from datetime import timedelta
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

DEFAULT_DUE_DATE_DAYS = 7

from rates.selectors import get_price_at_date

from .models import (
    Customer, FIFOLedger, Invoice, InvoiceItem,
    Payment, Return, ReturnItem,
)
from .selectors import (
    get_available_purchase_batches,
    get_customer_by_id,
    get_invoice_by_id,
    get_invoice_item_by_id,
    get_payment_by_id,
    get_return_by_id,
)

# Single source of truth for identifying the system-generated advance
# Payment row (no dedicated is_advance field — see purchases.services'
# identical SupplierPayment convention). Every create/filter site below
# must use this constant so they can never drift out of sync.
ADVANCE_PAYMENT_NOTE = "Advance payment on draft invoice creation."


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _soft_delete(instance, user) -> None:
    """DRY soft delete - reused across all models in this app."""
    instance.is_deleted = True
    instance.deleted_at = timezone.now()
    instance.deleted_by = user
    instance.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])


def _sync_invoice_payment_summary(invoice) -> None:
    """
    Recomputes and saves all payment tracking fields on an Invoice.
    Called after every Payment create/delete, confirmation, and return acceptance.

    Business logic:
        - On confirmation: full grand_total is credited to customer
          (credit_outstanding = grand_total, meaning customer owes this on credit)
        - Each payment (cash/jazzcash/easypaisa/bank) reduces credit_outstanding
          and increases cash_received by the payment amount
        - Return credit notes (negative payments) reduce credit_outstanding further
          (customer owes less because stock came back)
        - remaining_amount = credit_outstanding (they are always equal)
        - payment_status:
            paid    -> credit_outstanding <= 0
            partial -> 0 < credit_outstanding < grand_total
            unpaid  -> credit_outstanding == grand_total (no payments at all)
    """
    from decimal import Decimal
    from django.db.models import Q, Sum
    from .models import Payment

    # One conditional aggregate instead of loading every payment row into
    # Python and looping twice — same numbers, one query.
    agg = Payment.objects.filter(invoice=invoice, is_deleted=False).aggregate(
        cash=Sum("amount", filter=Q(amount__gt=0)),
        credits=Sum("amount", filter=Q(amount__lt=0)),
    )
    # Actual cash/digital payments received (positive amounts)
    cash_received = agg["cash"] or Decimal("0")
    # Return credit notes (negative amounts) — reduce what customer owes
    return_credits = abs(agg["credits"] or Decimal("0"))

    # credit_outstanding = how much customer still owes on credit
    # Starts at grand_total, reduced by payments received and return credits
    credit_outstanding = max(
        Decimal("0"),
        invoice.grand_total - cash_received - return_credits,
    )

    # remaining_amount always mirrors credit_outstanding
    remaining_amount = credit_outstanding

    # total_paid = actual money received (excludes credit_outstanding)
    total_paid = cash_received

    if remaining_amount <= 0:
        payment_status = invoice.PaymentStatus.PAID
    elif cash_received > 0 or return_credits > 0:
        payment_status = invoice.PaymentStatus.PARTIAL
    else:
        payment_status = invoice.PaymentStatus.UNPAID

    invoice.cash_received      = cash_received
    invoice.credit_outstanding = credit_outstanding
    invoice.total_paid         = total_paid
    invoice.remaining_amount   = remaining_amount
    invoice.payment_status     = payment_status
    invoice.save(update_fields=[
        "cash_received", "credit_outstanding", "total_paid",
        "remaining_amount", "payment_status",
    ])


# Reference generation is counter-based (purchases.DocumentCounter): O(1),
# race-safe, immune to the text-sort rollover at 10000, and seeded from the
# numeric max of ALL existing rows including soft-deleted ones — the old
# generators here queried through the soft-delete manager, so soft-deleting
# the highest-numbered payment/return made the next create collide with the
# deleted row's unique reference (500).

def _generate_bill_number() -> str:
    """Sequential bill number: BILL-2026-0001."""
    from purchases.services import next_reference
    return next_reference(counter_key="BILL", prefix_label="BILL", model=Invoice, field="bill_number")


def _generate_payment_reference() -> str:
    """Sequential billing payment reference: PAY-2026-0001."""
    from purchases.services import next_reference
    return next_reference(counter_key="PAY", prefix_label="PAY", model=Payment, field="reference_number")


def _generate_return_reference() -> str:
    """
    Sequential billing return reference: RTN-2026-0001.
    Counter key BILL-RTN keeps this sequence independent from purchase
    returns, which share the RTN- display prefix (uniqueness is per-table).
    """
    from purchases.services import next_reference
    return next_reference(counter_key="BILL-RTN", prefix_label="RTN", model=Return, field="reference_number")


def _get_current_selling_price(product) -> Decimal:
    """
    Fetches the current selling price from the rate list.
    Raises ValidationError if no rate is set for this product.
    """
    from rest_framework.exceptions import ValidationError
    try:
        rate = product.rate  # OneToOne reverse from rates.ProductRate
        if not rate:
            raise ValidationError(
                {product.name: f"No selling price set for '{product.name}'. Please set a rate first."}
            )
        return rate.selling_price
    except Exception:
        raise ValidationError(
            {"product": f"No selling price set for '{product.name}'. Please set a rate first."}
        )


def _validate_stock(product, requested_qty: int, exclude_invoice_id: int = None) -> None:
    """
    Validates that enough stock is available in inventory.
    On draft edit, exclude the current invoice's already-reserved qty
    by checking remaining_quantity on purchase batches directly.
    Raises ValidationError with a clear message if stock is insufficient.
    """
    from rest_framework.exceptions import ValidationError
    from django.db.models import Sum

    # Single aggregate instead of loading every batch row to sum in Python.
    # Deliberately unlocked — this also runs on draft create/edit, which
    # must never take stock locks. The locked walk in _run_fifo has its own
    # ran-out guard for the confirm race.
    available = (
        get_available_purchase_batches(product.id)
        .aggregate(total=Sum("remaining_quantity"))["total"] or 0
    )

    if available < requested_qty:
        raise ValidationError({
            "quantity": (
                f"Insufficient stock for '{product.name}'. "
                f"Requested: {requested_qty}, Available: {available}."
            )
        })


def _run_fifo(*, invoice_item: InvoiceItem, quantity: int, user) -> Decimal:
    """
    Consumes stock from purchase batches in FIFO order for a given product.
    Creates FIFOLedger entries for each batch consumed.
    Returns the blended COGS per unit for storage on the invoice item.

    This is the heart of FIFO. It:
    1. Iterates purchase batches oldest-first
    2. Consumes as many units as possible from each batch
    3. Records each consumption in FIFOLedger
    4. Decrements remaining_quantity on the purchase batch
    5. Returns blended cost = total_cost / total_qty
    """
    product = invoice_item.product
    remaining_to_consume = quantity
    total_cost = Decimal("0")
    # for_update: this decrements remaining_quantity — batch rows are locked
    # so a concurrent confirm/loss can't consume the same units. Runs inside
    # confirm_invoice's transaction; locks acquired in FIFO order.
    batches = get_available_purchase_batches(product.id, for_update=True)

    for batch in batches:
        if remaining_to_consume <= 0:
            break

        consume = min(batch.remaining_quantity, remaining_to_consume)
        # Use tax-inclusive unit cost: total_price / quantity
        # This is the real cost we paid (includes GST added, WHT deducted)
        tax_inclusive_unit_cost = (
            batch.total_price / batch.quantity
            if batch.quantity > 0 else batch.unit_price
        )
        cost_for_layer = consume * tax_inclusive_unit_cost

        FIFOLedger.objects.create(
            invoice_item=invoice_item,
            purchase=batch,
            quantity=consume,
            unit_cost=tax_inclusive_unit_cost,
        )

        batch.remaining_quantity -= consume
        batch.save(update_fields=["remaining_quantity"])

        total_cost += cost_for_layer
        remaining_to_consume -= consume

    if remaining_to_consume > 0:
        # This should never happen if _validate_stock ran first
        from rest_framework.exceptions import ValidationError
        raise ValidationError({
            "stock": f"Stock ran out mid-confirmation for '{product.name}'. Please refresh and try again."
        })

    blended_cogs_per_unit = total_cost / Decimal(str(quantity))
    return blended_cogs_per_unit


def _reverse_fifo(*, invoice_item: InvoiceItem, return_quantity: int) -> None:
    """
    Reverses FIFO consumption for a return — restores remaining_quantity
    on purchase batches in reverse FIFO order (LIFO reversal = FIFO restore).
    Creates negative FIFOLedger entries for audit completeness.
    Also increments the inventory directly.
    """
    product = invoice_item.product
    remaining_to_restore = return_quantity

    # Reverse in newest-first order so the most recently consumed batch
    # is restored first (correct FIFO reversal).
    # select_related("purchase"): each layer's batch was previously lazy-
    # loaded one query at a time. select_for_update: the joined batch rows'
    # remaining_quantity is read-then-written, so they must be locked
    # against concurrent FIFO consumers. Inside accept_return's transaction.
    layers = FIFOLedger.objects.select_related("purchase").select_for_update().filter(
        invoice_item=invoice_item,
        quantity__gt=0,          # only original consumption entries
    ).order_by("-created_at")

    for layer in layers:
        if remaining_to_restore <= 0:
            break

        restore = min(layer.quantity, remaining_to_restore)

        # Restore remaining_quantity on the purchase batch
        layer.purchase.remaining_quantity += restore
        layer.purchase.save(update_fields=["remaining_quantity"])

        # Append a negative ledger entry for audit trail
        FIFOLedger.objects.create(
            invoice_item=invoice_item,
            purchase=layer.purchase,
            quantity=-restore,
            unit_cost=layer.unit_cost,
        )

        remaining_to_restore -= restore

    # Increment inventory — through the shared writer so the inventory
    # stats counters stay in sync (user=None: this path never recorded
    # last_updated_by, and the writer preserves that).
    from purchases.services import sync_inventory
    sync_inventory(product=product, quantity_delta=return_quantity, user=None)


def _recalculate_invoice_totals(invoice: Invoice) -> None:
    """
    Recomputes and saves all invoice-level totals from line items.
    Called after confirmation and after returns.
    Uses calculate_invoice_totals() from utils - single source of truth.
    """
    from .utils import calculate_invoice_totals

    line_data = [
        {
            "line_gross"      : item.line_gross,
            "line_gst_amount" : item.line_gst_amount,
            "line_wht_amount" : item.line_wht_amount,
            "line_total"      : item.line_total,
            "line_cogs"       : item.line_cogs,
        }
        for item in invoice.items.all()
    ]
    totals = calculate_invoice_totals(line_data)

    invoice.subtotal     = totals["subtotal"]
    invoice.gst_total    = totals["gst_total"]
    invoice.wht_total    = totals["wht_total"]
    invoice.grand_total  = totals["grand_total"]
    invoice.total_cogs   = totals["total_cogs"]
    invoice.gross_profit = totals["gross_profit"]
    invoice.save(update_fields=[
        "subtotal", "gst_total", "wht_total", "grand_total",
        "total_cogs", "gross_profit",
    ])


# ---------------------------------------------------------------------------
# Customer services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_customer(*, name: str, code: str, address: str, mobile: str = "", user) -> Customer:
    from rest_framework.exceptions import ValidationError
    if Customer.objects.filter(code__iexact=code, is_deleted=False).exists():
        raise ValidationError({"code": "A customer with this code already exists."})
    customer = Customer.objects.create(
        name=name, code=code.upper(), address=address,
        mobile=mobile, created_by=user, updated_by=user,
    )

    from credit_score.services import initialize_credit_score
    initialize_credit_score(customer, user)

    return customer


def update_customer(
    *, pk: int, name: str = None, code: str = None,
    address: str = None, mobile: str = None, user,
) -> Customer:
    from rest_framework.exceptions import ValidationError
    customer = get_customer_by_id(pk)
    if code:
        qs = Customer.objects.filter(code__iexact=code, is_deleted=False).exclude(pk=pk)
        if qs.exists():
            raise ValidationError({"code": "A customer with this code already exists."})
        customer.code = code.upper()
    if name is not None:
        customer.name = name
    if address is not None:
        customer.address = address
    if mobile is not None:
        customer.mobile = mobile
    customer.updated_by = user
    customer.save(update_fields=["name", "code", "address", "mobile", "updated_by", "updated_at"])
    return customer


def delete_customer(*, pk: int, user) -> None:
    customer = get_customer_by_id(pk)
    _soft_delete(customer, user)


# ---------------------------------------------------------------------------
# Invoice (Draft) services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_invoice(
    *, customer_id: int, items: list[dict],
    payment_type: str = "after_delivery", advance_amount: Decimal = Decimal("0"),
    payment_due_date=None, user,
) -> Invoice:
    """
    Creates a DRAFT invoice with line items.
    items = [{"product_id": 1, "quantity": 5}, ...]

    Stock validation runs here so user sees errors immediately,
    but stock is NOT deducted yet (that happens on confirmation).
    Rate list validation also runs here.

    If payment_type=advance and advance_amount > 0:
        - advance_amount immediately added to cash_in_hand
        - A Payment record is auto-created for the advance

    payment_due_date defaults to today + DEFAULT_DUE_DATE_DAYS when omitted,
    and is carried through unchanged at confirmation.
    """
    from purchases.selectors import get_product_by_id
    from rest_framework.exceptions import ValidationError

    get_customer_by_id(customer_id)  # validate customer exists

    if not items:
        raise ValidationError({"items": "At least one item is required."})

    if payment_type == "after_delivery":
        advance_amount = Decimal("0")
    if advance_amount < 0:
        raise ValidationError({"advance_amount": "Advance amount cannot be negative."})

    if payment_due_date is None:
        payment_due_date = timezone.localtime(timezone.now()).date() + timedelta(days=DEFAULT_DUE_DATE_DAYS)

    # Validate all products + stock before creating anything
    validated_items = []
    seen_products = set()
    for item in items:
        product = get_product_by_id(item["product_id"])
        if product.id in seen_products:
            raise ValidationError({"items": f"Duplicate product '{product.name}' in items."})
        seen_products.add(product.id)
        _get_current_selling_price(product)      # raises if no rate
        _validate_stock(product, item["quantity"])
        validated_items.append((
            product,
            item["quantity"],
            item.get("discount", Decimal("0")),
            item.get("gst",      Decimal("0")),
            item.get("wht",      Decimal("0")),
        ))

    invoice = Invoice.objects.create(
        bill_number=_generate_bill_number(),
        customer_id=customer_id,
        status=Invoice.Status.DRAFT,
        payment_type=payment_type,
        advance_amount=advance_amount,
        payment_due_date=payment_due_date,
        created_by=user,
        updated_by=user,
    )

    # If advance payment: add to cash_in_hand and record in payment history
    if payment_type == "advance" and advance_amount > 0:
        adv_payment = Payment.objects.create(
            invoice=invoice,
            reference_number=_generate_payment_reference(),
            amount=advance_amount,
            method=Payment.Method.CASH,
            payment_date=timezone.localtime(timezone.now()).date(),
            note=ADVANCE_PAYMENT_NOTE,
            created_by=user,
            updated_by=user,
        )
        from cash_flow.services import record_cash_movement, sync_invoice_advance_payment_created
        sync_invoice_advance_payment_created(advance_amount=advance_amount, user=user)
        record_cash_movement(adv_payment)

    for product, quantity, discount, gst, wht in validated_items:
        InvoiceItem.objects.create(
            invoice=invoice,
            product=product,
            quantity=quantity,
            discount=discount,
            gst=gst,
            wht=wht,
            # selling_price, effective_price, cogs filled at confirmation
        )

    return invoice


@transaction.atomic
def update_invoice_items(
    *, invoice_id: int, items: list[dict],
    payment_type: str = None, advance_amount: Decimal = None,
    payment_due_date=None, user,
) -> Invoice:
    """
    Replaces all line items on a DRAFT invoice.
    Only allowed while status=DRAFT.
    Customer is immutable after creation.
    payment_type, advance_amount, and payment_due_date can also be updated
    while in draft. advance_amount changes auto-adjust cash_in_hand.
    Editing the due date while still draft never touches the credit score —
    only a CONFIRMED invoice's due date affects a customer's score (see
    update_invoice_due_date for that path).
    """
    from purchases.selectors import get_product_by_id
    from rest_framework.exceptions import ValidationError

    invoice = get_invoice_by_id(invoice_id)

    if invoice.status != Invoice.Status.DRAFT:
        raise ValidationError({"status": "Only draft invoices can be edited."})

    if not items:
        raise ValidationError({"items": "At least one item is required."})

    validated_items = []
    seen_products = set()
    for item in items:
        product = get_product_by_id(item["product_id"])
        if product.id in seen_products:
            raise ValidationError({"items": f"Duplicate product '{product.name}' in items."})
        seen_products.add(product.id)
        _get_current_selling_price(product)
        _validate_stock(product, item["quantity"])
        validated_items.append((
            product,
            item["quantity"],
            item.get("discount", Decimal("0")),
            item.get("gst",      Decimal("0")),
            item.get("wht",      Decimal("0")),
        ))

    # Replace all existing items
    invoice.items.all().delete()
    for product, quantity, discount, gst, wht in validated_items:
        InvoiceItem.objects.create(
            invoice=invoice,
            product=product,
            quantity=quantity,
            discount=discount,
            gst=gst,
            wht=wht,
        )

    # Handle payment_type change
    if payment_type is not None:
        old_payment_type = invoice.payment_type
        invoice.payment_type = payment_type
        # If switching from advance to after_delivery — refund advance
        if old_payment_type == "advance" and payment_type == "after_delivery":
            old_advance = invoice.advance_amount
            if old_advance > 0:
                _cancel_advance_payment(invoice=invoice, user=user)
                invoice.advance_amount = Decimal("0")

    # Handle advance_amount change
    if advance_amount is not None and invoice.payment_type == "advance":
        if advance_amount < 0:
            raise ValidationError({"advance_amount": "Advance amount cannot be negative."})
        old_advance = invoice.advance_amount
        if advance_amount != old_advance:
            _update_advance_payment(invoice=invoice, old_amount=old_advance, new_amount=advance_amount, user=user)
            invoice.advance_amount = advance_amount

    if payment_due_date is not None:
        invoice.payment_due_date = payment_due_date

    invoice.updated_by = user
    invoice.save(update_fields=[
        "payment_type", "advance_amount", "payment_due_date", "updated_by", "updated_at",
    ])
    return invoice


@transaction.atomic
def delete_invoice(*, invoice_id: int, user) -> None:
    """Only DRAFT invoices can be deleted. Refunds advance payment if applicable."""
    from rest_framework.exceptions import ValidationError
    invoice = get_invoice_by_id(invoice_id)
    if invoice.status != Invoice.Status.DRAFT:
        raise ValidationError({"status": "Only draft invoices can be deleted."})

    # Refund advance if this was an advance invoice
    if invoice.payment_type == "advance" and invoice.advance_amount > 0:
        if not _cancel_advance_payment(invoice=invoice, user=user):
            from cash_flow.services import sync_invoice_advance_payment_deleted
            sync_invoice_advance_payment_deleted(advance_amount=invoice.advance_amount, user=user)

    _soft_delete(invoice, user)


@transaction.atomic
def update_invoice_due_date(*, invoice_id: int, new_due_date, user) -> Invoice:
    """
    Extends (or otherwise edits) a CONFIRMED invoice's due date. Draft due-date
    edits go through update_invoice_items instead, and never reach here.
    Allowed on CONFIRMED, PARTIAL (partially returned, may still carry a
    real balance), and RETURNED (harmless — no outstanding balance left to
    matter) — anything except DRAFT.

    Immediately re-runs the customer's credit score so an extension is
    reflected right away rather than waiting for the next catch-up sweep.
    """
    from rest_framework.exceptions import ValidationError

    invoice = get_invoice_by_id(invoice_id)
    if invoice.status == Invoice.Status.DRAFT:
        raise ValidationError({"status": "Draft invoices are edited via the normal invoice edit endpoint."})
    if not new_due_date:
        raise ValidationError({"payment_due_date": "A due date is required."})

    invoice.payment_due_date = new_due_date
    invoice.updated_by = user
    invoice.save(update_fields=["payment_due_date", "updated_by", "updated_at"])

    from credit_score.services import recalculate_credit_score
    recalculate_credit_score(
        customer_id=invoice.customer_id, user=user,
        trigger="due_date_extended", reference=invoice.bill_number,
    )

    return invoice


# ---------------------------------------------------------------------------
# Invoice — advance payment helpers (mirrors purchases.services pattern)
# ---------------------------------------------------------------------------

def _cancel_advance_payment(*, invoice, user) -> bool:
    """
    Cancels any existing advance Payment on this invoice and reverses cash.
    Returns True if an advance payment was found and cancelled.
    """
    advance_payment = Payment.objects.filter(
        invoice=invoice,
        note__startswith=ADVANCE_PAYMENT_NOTE,
        amount__gt=0,
        is_deleted=False,
    ).first()
    if advance_payment:
        from cash_flow.services import reverse_cash_movement, sync_invoice_advance_payment_deleted
        sync_invoice_advance_payment_deleted(advance_amount=advance_payment.amount, user=user)

        advance_payment.is_deleted = True
        advance_payment.deleted_by = user
        advance_payment.deleted_at = timezone.now()
        advance_payment.save(update_fields=["is_deleted", "deleted_by", "deleted_at"])
        reverse_cash_movement(advance_payment)
        return True
    return False


def _update_advance_payment(*, invoice, old_amount: Decimal, new_amount: Decimal, user) -> None:
    """Updates the advance Payment record and adjusts cash_in_hand."""
    advance_payment = Payment.objects.filter(
        invoice=invoice,
        note__startswith=ADVANCE_PAYMENT_NOTE,
        amount__gt=0,
        is_deleted=False,
    ).first()

    if advance_payment:
        advance_payment.amount = new_amount
        advance_payment.save(update_fields=["amount"])

        from cash_flow.services import refresh_cash_movement
        refresh_cash_movement(advance_payment)
    else:
        adv_payment = Payment.objects.create(
            invoice=invoice,
            reference_number=_generate_payment_reference(),
            amount=new_amount,
            method=Payment.Method.CASH,
            payment_date=timezone.localtime(timezone.now()).date(),
            note=ADVANCE_PAYMENT_NOTE,
            created_by=user,
            updated_by=user,
        )
        from cash_flow.services import record_cash_movement
        record_cash_movement(adv_payment)

    from cash_flow.services import sync_invoice_advance_payment_updated
    sync_invoice_advance_payment_updated(old_amount=old_amount, new_amount=new_amount, user=user)


# ---------------------------------------------------------------------------
# Confirm Invoice
# ---------------------------------------------------------------------------

@transaction.atomic
def confirm_invoice(*, invoice_id: int, user) -> Invoice:
    """
    Confirms a draft invoice:
    1. Validates stock one final time (race-condition safety)
    2. Snapshots selling price from rate list onto each item
    3. Runs FIFO to consume purchase batches and get blended COGS
    4. Stores line totals, COGS, profit on each item
    5. Deducts quantity from Inventory
    6. Recomputes invoice-level totals
    7. Sets status=CONFIRMED
    """
    from rest_framework.exceptions import ValidationError

    invoice = get_invoice_by_id(invoice_id)
    if invoice.status != Invoice.Status.DRAFT:
        raise ValidationError({"status": "Only draft invoices can be confirmed."})

    # Sorted in Python (not .order_by) for two reasons: a deterministic
    # product order means two concurrent confirms lock products in the same
    # sequence (no deadlocks), and sorting the PREFETCHED objects keeps
    # _recalculate_invoice_totals below reading the same in-memory items
    # this loop mutates.
    for item in sorted(invoice.items.all(), key=lambda i: i.product_id):
        product = item.product

        # Final stock check inside transaction
        _validate_stock(product, item.quantity)

        # Snapshot selling price from rate list
        selling_price = _get_current_selling_price(product)

        # Run FIFO - consumes purchase batches, returns blended cogs/unit
        cogs_per_unit = _run_fifo(invoice_item=item, quantity=item.quantity, user=user)

        # Compute line financials using shared utils formula
        from .utils import calculate_line_item
        calc = calculate_line_item(
            quantity=item.quantity,
            selling_price=selling_price,
            discount=item.discount,
            gst=item.gst,
            wht=item.wht,
        )
        line_cogs   = cogs_per_unit * item.quantity
        line_profit = calc["line_total"] - line_cogs

        item.selling_price   = selling_price
        item.effective_price = calc["effective_price"]
        item.cogs_per_unit   = cogs_per_unit
        item.line_gross      = calc["line_gross"]
        item.line_gst_amount = calc["line_gst_amount"]
        item.line_wht_amount = calc["line_wht_amount"]
        item.line_total      = calc["line_total"]
        item.line_cogs       = line_cogs
        item.line_profit     = line_profit
        item.save(update_fields=[
            "selling_price", "effective_price", "cogs_per_unit",
            "line_gross", "line_gst_amount", "line_wht_amount",
            "line_total", "line_cogs", "line_profit",
        ])

        # Deduct from inventory — through the shared writer so the
        # inventory stats counters stay in sync.
        from purchases.services import sync_inventory
        sync_inventory(product=product, quantity_delta=-item.quantity, user=user)

        # Stock Movement Report — bootstrap opening-balance invoices aren't
        # real sales, mirrors every other report's is_data_entry exclusion.
        if not invoice.is_data_entry:
            from purchases.services import _adjust_stock_movement
            _adjust_stock_movement(product_id=item.product_id, sold_delta=item.quantity)

    _recalculate_invoice_totals(invoice)

    invoice.status       = Invoice.Status.CONFIRMED
    invoice.confirmed_by = user
    invoice.confirmed_at = timezone.now()
    invoice.updated_by   = user
    invoice.save(update_fields=["status", "confirmed_by", "confirmed_at", "updated_by", "updated_at"])

    # Auto-credit the customer for whatever isn't already covered by an
    # advance payment. credit_outstanding starts at grand_total minus any
    # advance (advance was already collected at draft creation). Every
    # further payment received reduces this. remaining_amount mirrors it.
    invoice.refresh_from_db(fields=["grand_total", "advance_amount", "payment_type"])
    advance = invoice.advance_amount if invoice.payment_type == "advance" else Decimal("0")

    # Cap advance at grand_total (safety guard — advance was recorded
    # against the draft before line items/totals were locked in). The
    # underlying advance Payment row must be capped too, or a later call to
    # _sync_invoice_payment_summary would sum the uncapped Payment.amount
    # and silently raise cash_received/credit_outstanding back up.
    if advance > invoice.grand_total:
        advance = invoice.grand_total
        invoice.advance_amount = advance
        invoice.save(update_fields=["advance_amount"])

        advance_payment = Payment.objects.filter(
            invoice=invoice, note__startswith=ADVANCE_PAYMENT_NOTE,
            amount__gt=0, is_deleted=False,
        ).first()
        if advance_payment:
            advance_payment.amount = advance
            advance_payment.save(update_fields=["amount"])
            from cash_flow.services import refresh_cash_movement
            refresh_cash_movement(advance_payment)

    credit_outstanding = max(Decimal("0"), invoice.grand_total - advance)
    invoice.cash_received      = advance
    invoice.total_paid         = advance
    invoice.credit_outstanding = credit_outstanding
    invoice.remaining_amount   = credit_outstanding
    invoice.payment_status = (
        Invoice.PaymentStatus.PAID if credit_outstanding == 0
        else Invoice.PaymentStatus.PARTIAL if advance > 0
        else Invoice.PaymentStatus.UNPAID
    )
    invoice.save(update_fields=[
        "cash_received", "total_paid", "credit_outstanding",
        "remaining_amount", "payment_status",
    ])

    # Sync CashFlow: customer owes (grand_total - advance); advance already in cash
    from cash_flow.services import sync_invoice_confirmed
    sync_invoice_confirmed(
        grand_total=invoice.grand_total, advance_amount=advance,
        total_cogs=invoice.total_cogs, gross_profit=invoice.gross_profit, user=user,
    )

    # Sync TaxFlow: GST charged to customer + WHT withheld by customer
    from taxes.services import sync_invoice_tax
    sync_invoice_tax(gst_amount=invoice.gst_total, wht_amount=invoice.wht_total, user=user)

    from credit_score.services import recalculate_credit_score
    recalculate_credit_score(
        customer_id=invoice.customer_id, user=user,
        trigger="invoice_confirmed", reference=invoice.bill_number,
    )

    return invoice


# ---------------------------------------------------------------------------
# Data-entry bootstrap invoice (called from data_entry.services)
# ---------------------------------------------------------------------------

@transaction.atomic
def create_opening_balance_invoice(*, customer, amount: Decimal, user) -> Invoice:
    """
    Creates a CONFIRMED, is_data_entry Invoice with no line items,
    grand_total = credit_outstanding = amount. Exists so normal billing
    payment APIs can work against the customer opening balance.

    IMPORTANT: this deliberately does NOT call sync_invoice_confirmed() or any
    other CashFlow sync. The CashFlow adjustment for a customer opening balance
    is handled separately by
    cash_flow.services.sync_data_entry_customer_opening_balance().

    Still gets the same +7-day payment_due_date default and counts toward
    the customer's credit score like any other confirmed invoice — opening
    balances are real carried-forward debt, not excluded from scoring.
    """
    confirmed_at = timezone.now()
    invoice = Invoice.objects.create(
        bill_number        = _generate_bill_number(),
        customer           = customer,
        status             = Invoice.Status.CONFIRMED,
        is_data_entry      = True,
        subtotal           = amount,
        grand_total        = amount,
        credit_outstanding = amount,
        remaining_amount   = amount,
        payment_status     = Invoice.PaymentStatus.UNPAID,
        payment_due_date   = timezone.localtime(confirmed_at).date() + timedelta(days=DEFAULT_DUE_DATE_DAYS),
        confirmed_by       = user,
        confirmed_at       = confirmed_at,
        created_by         = user,
        updated_by         = user,
    )

    from credit_score.services import recalculate_credit_score
    recalculate_credit_score(
        customer_id=invoice.customer_id, user=user,
        trigger="invoice_confirmed", reference=invoice.bill_number,
    )

    return invoice


# ---------------------------------------------------------------------------
# Payment services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_payment(
    *, invoice_id: int, amount: Decimal,
    method: str, payment_date, note: str = "", user,
) -> Payment:
    from rest_framework.exceptions import ValidationError

    invoice = get_invoice_by_id(invoice_id)
    if invoice.status == Invoice.Status.DRAFT:
        raise ValidationError({"invoice": "Cannot record payment on a draft invoice."})

    # Prevent overpayment — compare against current credit_outstanding
    invoice.refresh_from_db(fields=["credit_outstanding"])
    if amount > invoice.credit_outstanding:
        raise ValidationError({
            "amount": (
                f"Payment of {amount} exceeds outstanding credit balance. "
                f"Credit outstanding: {invoice.credit_outstanding}."
            )
        })

    payment = Payment.objects.create(
        invoice=invoice,
        reference_number=_generate_payment_reference(),
        amount=amount,
        method=method,
        payment_date=payment_date,
        note=note,
        created_by=user,
        updated_by=user,
    )
    _sync_invoice_payment_summary(invoice)

    # Sync CashFlow: cash in hand increases, customer outstanding decreases
    from cash_flow.services import record_cash_movement, sync_invoice_payment_received
    sync_invoice_payment_received(amount=amount, user=user)
    record_cash_movement(payment)

    from credit_score.services import recalculate_credit_score
    recalculate_credit_score(
        customer_id=invoice.customer_id, user=user,
        trigger="payment_received", reference=invoice.bill_number,
    )

    return payment


@transaction.atomic
def delete_payment(*, payment_id: int, user) -> None:
    payment = get_payment_by_id(payment_id)
    invoice = payment.invoice
    amount  = payment.amount
    _soft_delete(payment, user)
    _sync_invoice_payment_summary(invoice)

    # Reverse CashFlow sync only for positive payments (not credit notes)
    from cash_flow.services import reverse_cash_movement, sync_invoice_payment_deleted
    sync_invoice_payment_deleted(amount=amount, user=user)
    reverse_cash_movement(payment)  # no-op for credit notes (never recorded)

    from credit_score.services import recalculate_credit_score
    recalculate_credit_score(
        customer_id=invoice.customer_id, user=user,
        trigger="payment_deleted", reference=invoice.bill_number,
    )


# ---------------------------------------------------------------------------
# Return services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_return(*, invoice_id: int, items: list[dict], note: str = "", user) -> Return:
    """
    Creates a PENDING return request.
    items = [{"invoice_item_id": 1, "quantity": 3}, ...]
    Validates quantities don't exceed returnable amounts.
    Does NOT touch inventory or FIFO yet — that happens on acceptance.
    """
    from rest_framework.exceptions import ValidationError

    invoice = get_invoice_by_id(invoice_id)
    if invoice.status not in (Invoice.Status.CONFIRMED, Invoice.Status.PARTIAL):
        raise ValidationError({"invoice": "Only confirmed invoices can have returns."})

    if not items:
        raise ValidationError({"items": "At least one item is required for a return."})

    return_record = Return.objects.create(
        invoice=invoice,
        reference_number=_generate_return_reference(),
        status=Return.Status.PENDING,
        note=note,
        created_by=user,
        updated_by=user,
    )

    for item_data in items:
        invoice_item = get_invoice_item_by_id(item_data["invoice_item_id"])

        if invoice_item.invoice_id != invoice.id:
            raise ValidationError({
                "invoice_item_id": f"Item {invoice_item.id} does not belong to this invoice."
            })
        if item_data["quantity"] > invoice_item.returnable_quantity:
            raise ValidationError({
                "quantity": (
                    f"Cannot return {item_data['quantity']} units of "
                    f"'{invoice_item.product.name}'. "
                    f"Returnable: {invoice_item.returnable_quantity}."
                )
            })

        qty           = item_data["quantity"]
        selling_price = invoice_item.selling_price
        cogs_per_unit = invoice_item.cogs_per_unit
        ReturnItem.objects.create(
            return_record=return_record,
            invoice_item=invoice_item,
            quantity=qty,
            selling_price=selling_price,
            cogs_per_unit=cogs_per_unit,
            line_total=selling_price * qty,
            line_cogs=cogs_per_unit * qty,
        )

    return return_record


@transaction.atomic
def accept_return(*, return_id: int, user) -> Return:
    """
    Accepts a pending return (admin/superuser only):
    1. Snapshots prices from original invoice item
    2. Reverses FIFO (restores purchase batch remaining_quantity)
    3. Increments inventory
    4. Updates returned_quantity on invoice items
    5. Updates invoice status (partial/returned)
    6. Adjusts invoice totals
    7. Creates a negative payment entry to reduce customer's outstanding balance
    """
    from rest_framework.exceptions import ValidationError

    return_record = get_return_by_id(return_id)
    if return_record.status != Return.Status.PENDING:
        raise ValidationError({"status": "Only pending returns can be accepted."})

    total_return_amount = Decimal("0")
    total_return_cogs   = Decimal("0")

    for return_item in return_record.items.all():
        invoice_item  = return_item.invoice_item
        qty           = return_item.quantity

        # Snapshot from original invoice item
        selling_price = invoice_item.selling_price
        cogs_per_unit = invoice_item.cogs_per_unit
        line_total    = selling_price * qty
        line_cogs     = cogs_per_unit * qty

        return_item.selling_price = selling_price
        return_item.cogs_per_unit = cogs_per_unit
        return_item.line_total    = line_total
        return_item.line_cogs     = line_cogs
        return_item.save(update_fields=[
            "selling_price", "cogs_per_unit", "line_total", "line_cogs"
        ])

        # Reverse FIFO and restore inventory
        _reverse_fifo(invoice_item=invoice_item, return_quantity=qty)

        # Track returned quantity on invoice item
        invoice_item.returned_quantity += qty
        invoice_item.save(update_fields=["returned_quantity"])

        # Stock Movement Report
        if not invoice_item.invoice.is_data_entry:
            from purchases.services import _adjust_stock_movement
            _adjust_stock_movement(product_id=invoice_item.product_id, sale_returned_delta=qty)

        total_return_amount += line_total
        total_return_cogs   += line_cogs

    # Save return totals
    return_record.total_return_amount = total_return_amount
    return_record.total_return_cogs   = total_return_cogs
    return_record.status              = Return.Status.ACCEPTED
    return_record.accepted_by         = user
    return_record.accepted_at         = timezone.now()
    return_record.updated_by          = user
    return_record.save(update_fields=[
        "total_return_amount", "total_return_cogs",
        "status", "accepted_by", "accepted_at", "updated_by", "updated_at",
    ])

    # Update invoice status
    invoice = return_record.invoice
    all_items      = invoice.items.all()
    total_qty      = sum(i.quantity for i in all_items)
    total_returned = sum(i.returned_quantity for i in all_items)

    if total_returned >= total_qty:
        invoice.status = Invoice.Status.RETURNED
    else:
        invoice.status = Invoice.Status.PARTIAL

    invoice.updated_by = user
    invoice.save(update_fields=["status", "updated_by", "updated_at"])

    # Recalculate invoice totals
    _recalculate_invoice_totals(invoice)

    # Credit note: negative payment entry to reduce outstanding balance
    Payment.objects.create(
        invoice=invoice,
        reference_number=_generate_payment_reference(),
        amount=-total_return_amount,
        method=Payment.Method.CASH,  # credit note — reduces customer outstanding
        payment_date=timezone.localtime(timezone.now()).date(),
        note=f"Auto credit note for Return {return_record.reference_number}",
        created_by=user,
        updated_by=user,
    )
    _sync_invoice_payment_summary(invoice)

    # Sync CashFlow: customer outstanding reduces, total_customer_returns_value/cogs increase
    from cash_flow.services import sync_invoice_return_accepted
    sync_invoice_return_accepted(
        return_amount=total_return_amount, return_cogs=total_return_cogs, user=user,
    )

    from credit_score.services import recalculate_credit_score
    recalculate_credit_score(
        customer_id=invoice.customer_id, user=user,
        trigger="return_accepted", reference=return_record.reference_number,
    )

    return return_record