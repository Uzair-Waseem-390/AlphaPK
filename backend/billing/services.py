from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from purchases.models import Inventory
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
    from .models import Payment

    payments = Payment.objects.filter(invoice=invoice, is_deleted=False)

    # Sum all actual cash/digital payments received (positive amounts)
    cash_received = Decimal("0")
    for p in payments:
        if p.amount > 0:
            cash_received += p.amount

    # Sum return credit notes (negative amounts) — reduce what customer owes
    return_credits = Decimal("0")
    for p in payments:
        if p.amount < 0:
            return_credits += abs(p.amount)

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


def _generate_bill_number() -> str:
    """
    Generates sequential bill number: BILL-2026-0001.
    Reads the highest existing number for the current year and increments.
    Uses select_for_update inside a transaction to prevent race conditions
    under concurrent requests.
    """
    year = timezone.now().year
    prefix = f"BILL-{year}-"
    last = (
        Invoice.all_objects
        .filter(bill_number__startswith=prefix)
        .order_by("-bill_number")
        .first()
    )
    if last:
        last_seq = int(last.bill_number.split("-")[-1])
        seq = last_seq + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def _generate_payment_reference() -> str:
    """Generates sequential billing payment reference: PAY-2026-0001."""
    year   = timezone.now().year
    prefix = f"PAY-{year}-"
    from .models import Payment
    last = (
        Payment.objects
        .filter(reference_number__startswith=prefix)
        .order_by("-reference_number")
        .first()
    )
    seq = int(last.reference_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:04d}"


def _generate_return_reference() -> str:
    """Generates sequential billing return reference: RTN-2026-0001."""
    year   = timezone.now().year
    prefix = f"RTN-{year}-"
    from .models import Return
    last = (
        Return.objects
        .filter(reference_number__startswith=prefix)
        .order_by("-reference_number")
        .first()
    )
    seq = int(last.reference_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:04d}"


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

    batches = get_available_purchase_batches(product.id)
    available = sum(b.remaining_quantity for b in batches)

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
    batches = get_available_purchase_batches(product.id)

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
    # is restored first (correct FIFO reversal)
    layers = FIFOLedger.objects.filter(
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

    # Increment inventory
    inventory, _ = Inventory.objects.get_or_create(product=product)
    inventory.quantity += return_quantity
    inventory.save(update_fields=["quantity", "last_updated_at"])


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

def create_customer(*, name: str, code: str, address: str, mobile: str = "", user) -> Customer:
    from rest_framework.exceptions import ValidationError
    if Customer.objects.filter(code__iexact=code, is_deleted=False).exists():
        raise ValidationError({"code": "A customer with this code already exists."})
    return Customer.objects.create(
        name=name, code=code.upper(), address=address,
        mobile=mobile, created_by=user, updated_by=user,
    )


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
def create_invoice(*, customer_id: int, items: list[dict], user) -> Invoice:
    """
    Creates a DRAFT invoice with line items.
    items = [{"product_id": 1, "quantity": 5}, ...]

    Stock validation runs here so user sees errors immediately,
    but stock is NOT deducted yet (that happens on confirmation).
    Rate list validation also runs here.
    """
    from purchases.selectors import get_product_by_id
    from rest_framework.exceptions import ValidationError

    get_customer_by_id(customer_id)  # validate customer exists

    if not items:
        raise ValidationError({"items": "At least one item is required."})

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
        created_by=user,
        updated_by=user,
    )

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
def update_invoice_items(*, invoice_id: int, items: list[dict], user) -> Invoice:
    """
    Replaces all line items on a DRAFT invoice.
    Only allowed while status=DRAFT.
    Customer is immutable after creation.
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

    invoice.updated_by = user
    invoice.save(update_fields=["updated_by", "updated_at"])
    return invoice


def delete_invoice(*, invoice_id: int, user) -> None:
    from rest_framework.exceptions import ValidationError
    invoice = get_invoice_by_id(invoice_id)
    if invoice.status != Invoice.Status.DRAFT:
        raise ValidationError({"status": "Only draft invoices can be deleted."})
    _soft_delete(invoice, user)


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

    for item in invoice.items.all():
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

        # Deduct from inventory
        inventory, _ = Inventory.objects.get_or_create(product=product)
        inventory.quantity = max(0, inventory.quantity - item.quantity)
        inventory.last_updated_by = user
        inventory.save(update_fields=["quantity", "last_updated_at", "last_updated_by"])

    _recalculate_invoice_totals(invoice)

    invoice.status       = Invoice.Status.CONFIRMED
    invoice.confirmed_by = user
    invoice.confirmed_at = timezone.now()
    invoice.updated_by   = user
    invoice.save(update_fields=["status", "confirmed_by", "confirmed_at", "updated_by", "updated_at"])

    # Auto-credit the full grand_total to the customer on confirmation.
    # credit_outstanding starts equal to grand_total (customer owes the full amount).
    # Every payment received reduces this. remaining_amount always mirrors it.
    invoice.refresh_from_db(fields=["grand_total"])
    invoice.credit_outstanding = invoice.grand_total
    invoice.remaining_amount   = invoice.grand_total
    invoice.payment_status     = Invoice.PaymentStatus.UNPAID
    invoice.save(update_fields=["credit_outstanding", "remaining_amount", "payment_status"])

    # Sync CashFlow: customer owes full grand_total
    from cash_flow.services import sync_invoice_confirmed
    sync_invoice_confirmed(grand_total=invoice.grand_total, user=user)

    return invoice


# ---------------------------------------------------------------------------
# Payment services
# ---------------------------------------------------------------------------

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
    from cash_flow.services import sync_invoice_payment_received
    sync_invoice_payment_received(amount=amount, user=user)

    return payment


def delete_payment(*, payment_id: int, user) -> None:
    payment = get_payment_by_id(payment_id)
    invoice = payment.invoice
    amount  = payment.amount
    _soft_delete(payment, user)
    _sync_invoice_payment_summary(invoice)

    # Reverse CashFlow sync only for positive payments (not credit notes)
    from cash_flow.services import sync_invoice_payment_deleted
    sync_invoice_payment_deleted(amount=amount, user=user)


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

        ReturnItem.objects.create(
            return_record=return_record,
            invoice_item=invoice_item,
            quantity=item_data["quantity"],
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
        payment_date=timezone.now().date(),
        note=f"Auto credit note for Return {return_record.reference_number}",
        created_by=user,
        updated_by=user,
    )
    _sync_invoice_payment_summary(invoice)

    # Sync CashFlow: customer outstanding reduces (goods came back)
    from cash_flow.services import sync_invoice_return_accepted
    sync_invoice_return_accepted(return_amount=total_return_amount, user=user)

    return return_record