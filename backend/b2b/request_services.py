"""
Writes for purchase requests. Every status change happens under a row lock on
the request, which is what makes "cancel vs accept" a clean race: whichever
transaction takes the lock first wins, and the other gets a clear message.

Accepting reuses the existing billing code end to end (create a draft invoice,
set the shelves, confirm it) so stock, FIFO cost, the customer ledger, taxes and
credit score all move exactly as for any other invoice — nothing is re-implemented
here, and all of it sits in ONE transaction: any failure rolls back everything.
"""

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from billing.models import Customer, InvoiceItem
from billing.services import confirm_invoice, create_invoice, set_invoice_item_shelf_allocations
from rates.models import ProductRate

from . import config
from .doorbell import ensure_partner_awake, notify_partner
from .models import PurchaseRequest, PurchaseRequestItem
from .request_selectors import get_current_prices, get_stock_levels

Status = PurchaseRequest.Status


def _same_text(a: str, b: str) -> bool:
    """Trimmed, whitespace-collapsed, case-insensitive comparison."""
    return " ".join((a or "").split()).casefold() == " ".join((b or "").split()).casefold()


# ---------------------------------------------------------------------------
# Partner-facing
# ---------------------------------------------------------------------------

def submit_purchase_request(*, partner_name: str, request_uuid, note: str, items: list):
    """
    Records a partner's request. Returns (request, created). Sending the same
    request_uuid again is a no-op that returns the existing row, so a retry can
    never create a duplicate.

    Every product must exist here with the SAME code AND name, be priced, and not
    be deleted — the partner's search only offers such products, so anything else
    means a stale or tampered request.
    """
    existing = PurchaseRequest.objects.filter(partner_name=partner_name, request_uuid=request_uuid).first()
    if existing is not None:
        return existing, False

    codes = [i["product_code"].strip() for i in items]
    if len(set(codes)) != len(codes):
        raise ValidationError({"items": "A product appears more than once."})

    products = {
        rate.product.code: rate.product
        for rate in ProductRate.objects.filter(
            product__code__in=codes, product__is_deleted=False,
        ).select_related("product")
    }
    problems = []
    for item in items:
        code = item["product_code"].strip()
        product = products.get(code)
        if product is None:
            problems.append(f"'{code}' is not available to request.")
        elif not _same_text(product.name, item["product_name"]):
            problems.append(f"'{code}' does not match a product with that name.")
    if problems:
        raise ValidationError({"items": problems})

    try:
        with transaction.atomic():
            request = PurchaseRequest.objects.create(
                partner_name=partner_name, request_uuid=request_uuid, note=note or "",
            )
            PurchaseRequestItem.objects.bulk_create([
                PurchaseRequestItem(
                    request=request,
                    product=products[i["product_code"].strip()],
                    product_code=products[i["product_code"].strip()].code,
                    product_name=products[i["product_code"].strip()].name,
                    requested_quantity=i["quantity"],
                    discount=i["discount"], gst=i["gst"], wht=i["wht"],
                )
                for i in items
            ])
    except IntegrityError:
        # Lost a race against an identical submit — the other one won.
        winner = PurchaseRequest.objects.filter(partner_name=partner_name, request_uuid=request_uuid).first()
        if winner is None:
            raise   # a different integrity problem — don't hide it
        return winner, False
    return request, True


@transaction.atomic
def cancel_purchase_request(*, partner_name: str, request_uuid):
    """
    The partner cancels. Only a PENDING request can be cancelled; if it was
    already accepted / denied the row is returned unchanged so the partner can
    see why. Returns None when the request doesn't exist.
    """
    request = PurchaseRequest.objects.select_for_update().filter(
        partner_name=partner_name, request_uuid=request_uuid,
    ).first()
    if request is None:
        return None
    if request.status == Status.PENDING:
        request.status = Status.CANCELLED
        request.decided_at = timezone.now()
        request.save(update_fields=["status", "decided_at"])
    return request


# ---------------------------------------------------------------------------
# Admin-facing
# ---------------------------------------------------------------------------

def _lock_for_decision(request_id: int) -> PurchaseRequest:
    request = PurchaseRequest.objects.select_for_update().filter(pk=request_id).first()
    if request is None:
        raise NotFound("Request not found.")
    if request.status == Status.CANCELLED:
        raise ValidationError({"status": "This request was cancelled by the partner and can no longer be decided."})
    if request.status != Status.PENDING:
        raise ValidationError({"status": f"This request is already {request.get_status_display().lower()}."})
    return request


def _partner_of(request_id: int) -> str:
    """
    The partner to wake-check for a decision. A request that can no longer be decided gets the
    same clear 400 as before — without costing a pointless wake-up call (the locked check inside
    the transaction stays authoritative).
    """
    row = PurchaseRequest.objects.filter(pk=request_id).values_list("partner_name", "status").first()
    if row is None:
        raise NotFound("Request not found.")
    partner_name, status = row
    if status == Status.CANCELLED:
        raise ValidationError({"status": "This request was cancelled by the partner and can no longer be decided."})
    if status != Status.PENDING:
        raise ValidationError({"status": f"This request is already {Status(status).label.lower()}."})
    return partner_name


def deny_purchase_request(*, request_id: int, user) -> PurchaseRequest:
    """Denying tells the partner, so the partner must answer a wake-up check first — otherwise NOTHING is written."""
    ensure_partner_awake(_partner_of(request_id))
    return _deny_atomic(request_id=request_id, user=user)


@transaction.atomic
def _deny_atomic(*, request_id: int, user) -> PurchaseRequest:
    request = _lock_for_decision(request_id)
    request.status = Status.DENIED
    request.decided_at = timezone.now()
    request.decided_by = user
    request.save(update_fields=["status", "decided_at", "decided_by"])
    transaction.on_commit(lambda: notify_partner(request.partner_name, request.request_uuid))
    return request


def accept_purchase_request(*, request_id: int, items: list, user) -> PurchaseRequest:
    """
    Accepting makes the partner create its purchase order, so the partner must answer a
    wake-up check first. If it does not, nothing is written here (no invoice, no stock
    change, no status change) and the admin is told to wake it and retry.
    """
    ensure_partner_awake(_partner_of(request_id))
    return _accept_atomic(request_id=request_id, items=items, user=user)


@transaction.atomic
def _accept_atomic(*, request_id: int, items: list, user) -> PurchaseRequest:
    """
    items = [{"id": <request item id>, "accepted_quantity": int >= 0,
              "shelf_allocations": [{"shelf_id": int, "quantity": int}, ...]}, ...]
    Quantity may be raised or lowered freely (0 = not supplied); discount, GST and
    WHT always stay exactly as the partner entered them.
    """
    request = _lock_for_decision(request_id)

    code = config.customer_code_for(request.partner_name)
    customer = (
        Customer.objects.filter(Q(code=code) | Q(code=code.upper()), is_deleted=False).first() if code else None
    )
    if customer is None:
        raise ValidationError({"customer": (
            f"No customer with code '{code}' exists for this partner. Create it (or fix the code in the settings) and try again."
            if code else "No customer code is configured for this partner."
        )})

    rows = list(request.items.select_related("product"))
    by_id = {row.id: row for row in rows}
    chosen = {}
    for entry in items:
        if entry["id"] not in by_id:
            raise ValidationError({"items": f"Unknown request item {entry['id']}."})
        if entry["id"] in chosen:
            raise ValidationError({"items": f"Request item {entry['id']} was sent twice."})
        chosen[entry["id"]] = entry
    if set(chosen) != set(by_id):
        raise ValidationError({"items": "Every item of the request must be included."})

    accepted = {row.id: chosen[row.id]["accepted_quantity"] for row in rows}
    supplied = [row for row in rows if accepted[row.id] > 0]
    if not supplied:
        raise ValidationError({"items": "Every quantity is zero — deny the request instead."})

    # Check everything that can be checked up front and report ALL problems in
    # one message; the invoice flow below re-validates under its own locks.
    product_ids = [row.product_id for row in supplied]
    stock = get_stock_levels(product_ids)
    prices = get_current_prices(product_ids)
    problems = []
    for row in supplied:
        qty = accepted[row.id]
        label = f"{row.product_name} ({row.product_code})"
        have = stock.get(row.product_id, 0)
        if qty > have:
            problems.append(f"{label}: {qty} accepted but only {have} available.")
        price = prices.get(row.product_id)
        if price is None:
            problems.append(f"{label}: no selling price is set.")
        elif price - row.discount < 0:
            problems.append(f"{label}: the price after the requested discount would be negative.")
        shelf_total = sum(a["quantity"] for a in chosen[row.id].get("shelf_allocations", []))
        if shelf_total != qty:
            problems.append(f"{label}: shelves must add up to {qty} (currently {shelf_total}).")
    if problems:
        raise ValidationError({"items": problems})

    invoice = create_invoice(
        customer_id=customer.id,
        items=[
            {
                "product_id": row.product_id, "quantity": accepted[row.id],
                "discount": row.discount, "gst": row.gst, "wht": row.wht,
            }
            for row in supplied
        ],
        payment_type="after_delivery",
        user=user,
    )
    invoice_lines = {line.product_id: line for line in invoice.items.all()}
    # Product-id order, the same order confirm_invoice locks in, so a concurrent
    # normal confirm can never deadlock against this transaction's shelf locks.
    for row in sorted(supplied, key=lambda r: r.product_id):
        set_invoice_item_shelf_allocations(
            invoice_item_id=invoice_lines[row.product_id].id,
            allocations=chosen[row.id]["shelf_allocations"],
            user=user,
        )
    confirm_invoice(invoice_id=invoice.id, user=user)
    invoice.refresh_from_db()

    confirmed = {line.product_id: line for line in InvoiceItem.objects.filter(invoice_id=invoice.id)}
    for row in rows:
        row.accepted_quantity = accepted[row.id]
        line = confirmed.get(row.product_id)
        if line is not None and accepted[row.id] > 0:
            row.selling_price = line.selling_price
            row.effective_price = line.effective_price
    PurchaseRequestItem.objects.bulk_update(rows, ["accepted_quantity", "selling_price", "effective_price"])

    request.status = Status.ACCEPTED
    request.decided_at = timezone.now()
    request.decided_by = user
    request.invoice = invoice
    request.invoice_number = invoice.bill_number
    request.save(update_fields=["status", "decided_at", "decided_by", "invoice", "invoice_number"])
    transaction.on_commit(lambda: notify_partner(request.partner_name, request.request_uuid))
    return request
