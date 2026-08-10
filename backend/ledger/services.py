from datetime import date as date_cls
from decimal import Decimal
from itertools import accumulate

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from .models import SavedLedgerPDF, SupplierLedger, SupplierLedgerEntry, SupplierLedgerSnapshot


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_year_month(date) -> str:
    """Returns 'YYYY-MM' string from a date or datetime."""
    return date.strftime("%Y-%m")


def _as_date(value):
    """
    Normalizes a YYYY-MM-DD query-param string to a date (dates/None pass
    through; unparseable strings become None → filter skipped). The view
    layer hands strings straight to the balance code, which previously
    crashed on .strftime for any string date_from.
    """
    if value is None or isinstance(value, date_cls):
        return value
    return parse_date(str(value))


def _month_bounds(year_month: str) -> tuple:
    """
    (first day of month, first day of NEXT month) for a 'YYYY-MM' string —
    lets month filters be real date ranges that use the (ledger, date)
    index, instead of date__startswith, which casts the date column to text
    for a LIKE and forces a sequential scan.
    """
    year, month = map(int, year_month.split("-"))
    start = date_cls(year, month, 1)
    end = date_cls(year + 1, 1, 1) if month == 12 else date_cls(year, month + 1, 1)
    return start, end


def _get_previous_snapshot_balance(ledger: SupplierLedger, year_month: str) -> Decimal:
    """
    Returns the closing balance of the most recent snapshot BEFORE year_month.
    Returns 0 if no prior snapshot exists (opening balance = 0).
    """
    snapshot = (
        SupplierLedgerSnapshot.objects
        .filter(ledger=ledger, year_month__lt=year_month)
        .order_by("-year_month")
        .first()
    )
    return snapshot.closing_balance if snapshot else Decimal("0")


def _recalculate_snapshots_from(ledger: SupplierLedger, from_year_month: str) -> None:
    """
    Recalculates all monthly snapshots from from_year_month onwards.
    Called when any entry in a month is created, edited, or deleted.

    For each affected month:
      closing_balance = prior_snapshot_balance + sum(credits) - sum(debits) for that month
    """
    from django.db.models import Sum

    # Get all months that need recalculation (from_year_month onwards)
    affected_months = (
        SupplierLedgerSnapshot.objects
        .filter(ledger=ledger, year_month__gte=from_year_month)
        .order_by("year_month")
        .values_list("year_month", flat=True)
    )

    # Also include from_year_month itself even if no snapshot exists yet
    months_to_process = sorted(set(list(affected_months) + [from_year_month]))

    for ym in months_to_process:
        prior_balance = _get_previous_snapshot_balance(ledger, ym)

        # Sum all entries in this month — real date range so the
        # (ledger, date) index is used (date__startswith could not use it).
        month_start, month_end = _month_bounds(ym)
        agg = SupplierLedgerEntry.objects.filter(
            ledger=ledger,
            date__gte=month_start,
            date__lt=month_end,
        ).aggregate(
            total_credit=Sum("credit"),
            total_debit=Sum("debit"),
        )
        month_credit = agg["total_credit"] or Decimal("0")
        month_debit  = agg["total_debit"]  or Decimal("0")

        closing_balance = prior_balance + month_credit - month_debit
        # Store real balance including negative (overpaid state)
        # Negative balance means supplier owes us money
        SupplierLedgerSnapshot.objects.update_or_create(
            ledger=ledger,
            year_month=ym,
            defaults={"closing_balance": closing_balance},
        )


# ---------------------------------------------------------------------------
# Ledger creation (called when supplier is created)
# ---------------------------------------------------------------------------

def delete_ledger(*, pk: int, user) -> None:
    """
    Soft-deletes a SupplierLedger. Only allowed once the linked supplier is
    itself soft-deleted — a ledger must never disappear out from under a
    still-active supplier.
    """
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    ledger = get_object_or_404(
        SupplierLedger.objects.select_related("supplier"), pk=pk, is_deleted=False,
    )
    if not ledger.supplier.is_deleted:
        raise ValidationError({
            "detail": "Cannot delete ledger: the supplier must be deleted first.",
        })

    ledger.is_deleted = True
    ledger.deleted_at = timezone.now()
    ledger.deleted_by = user
    ledger.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])


def create_ledger_for_supplier(*, supplier) -> SupplierLedger:
    """
    Auto-creates an empty SupplierLedger when a supplier is created.
    Snapshots supplier name/code for historical preservation.
    """
    return SupplierLedger.objects.get_or_create(
        supplier=supplier,
        defaults={
            "supplier_name": supplier.name,
            "supplier_code": supplier.code,
        },
    )[0]


# ---------------------------------------------------------------------------
# Entry creation — called from purchases.services
# ---------------------------------------------------------------------------

@transaction.atomic
def add_purchase_entry(
    *, supplier, purchase_order, amount: Decimal, date, user,
) -> SupplierLedgerEntry:
    """Purchase confirmed → Credit entry (we owe supplier more)."""
    # Lock the ledger row: two entries for the same supplier written
    # concurrently would each recalculate the month snapshot without seeing
    # the other's uncommitted entry — last writer would store a balance
    # missing one entry. The lock serializes writes per supplier only.
    ledger = SupplierLedger.objects.select_for_update().get(supplier=supplier)
    entry  = SupplierLedgerEntry.objects.create(
        ledger          = ledger,
        entry_type      = SupplierLedgerEntry.EntryType.PURCHASE,
        date            = date,
        details         = f"Purchase Order: {purchase_order.description or purchase_order.order_number}",
        reference       = purchase_order.order_number,
        credit          = amount,
        debit           = Decimal("0"),
        purchase_order  = purchase_order,
        created_by      = user,
    )
    _recalculate_snapshots_from(ledger, _get_year_month(date))
    return entry


@transaction.atomic
def add_opening_balance_entry(
    *, supplier, amount: Decimal, date, reference: str,
    details: str = "Opening Balance", user,
) -> SupplierLedgerEntry:
    """
    Data-entry bootstrap: one-time opening balance for a supplier.
    Credit entry (we owe supplier from before go-live).
    """
    # Lock the ledger row: two entries for the same supplier written
    # concurrently would each recalculate the month snapshot without seeing
    # the other's uncommitted entry — last writer would store a balance
    # missing one entry. The lock serializes writes per supplier only.
    ledger = SupplierLedger.objects.select_for_update().get(supplier=supplier)
    entry  = SupplierLedgerEntry.objects.create(
        ledger     = ledger,
        entry_type = SupplierLedgerEntry.EntryType.OPENING_BALANCE,
        date       = date,
        details    = details,
        reference  = reference,
        credit     = amount,
        debit      = Decimal("0"),
        created_by = user,
    )
    _recalculate_snapshots_from(ledger, _get_year_month(date))
    return entry


@transaction.atomic
def add_payment_entry(
    *, supplier, supplier_payment, amount: Decimal, date, user,
) -> SupplierLedgerEntry:
    """Supplier payment made → Debit entry (we paid them)."""
    # Lock the ledger row: two entries for the same supplier written
    # concurrently would each recalculate the month snapshot without seeing
    # the other's uncommitted entry — last writer would store a balance
    # missing one entry. The lock serializes writes per supplier only.
    ledger = SupplierLedger.objects.select_for_update().get(supplier=supplier)
    entry  = SupplierLedgerEntry.objects.create(
        ledger           = ledger,
        entry_type       = SupplierLedgerEntry.EntryType.PAYMENT,
        date             = date,
        details          = supplier_payment.note or "Supplier payment",
        reference        = supplier_payment.reference_number,
        debit            = amount,
        credit           = Decimal("0"),
        supplier_payment = supplier_payment,
        created_by       = user,
    )
    _recalculate_snapshots_from(ledger, _get_year_month(date))
    return entry


@transaction.atomic
def add_advance_entry(
    *, supplier, supplier_payment, amount: Decimal, date, user,
) -> SupplierLedgerEntry:
    """Advance payment on draft PO → Debit entry."""
    # Lock the ledger row: two entries for the same supplier written
    # concurrently would each recalculate the month snapshot without seeing
    # the other's uncommitted entry — last writer would store a balance
    # missing one entry. The lock serializes writes per supplier only.
    ledger = SupplierLedger.objects.select_for_update().get(supplier=supplier)
    entry  = SupplierLedgerEntry.objects.create(
        ledger           = ledger,
        entry_type       = SupplierLedgerEntry.EntryType.ADVANCE,
        date             = date,
        details          = supplier_payment.note or "Advance payment",
        reference        = supplier_payment.reference_number,
        debit            = amount,
        credit           = Decimal("0"),
        supplier_payment = supplier_payment,
        created_by       = user,
    )
    _recalculate_snapshots_from(ledger, _get_year_month(date))
    return entry


@transaction.atomic
def add_return_entry(
    *, supplier, purchase_return, amount: Decimal, date, user,
) -> SupplierLedgerEntry:
    """Purchase return accepted → Debit entry (supplier owes us back)."""
    # Lock the ledger row: two entries for the same supplier written
    # concurrently would each recalculate the month snapshot without seeing
    # the other's uncommitted entry — last writer would store a balance
    # missing one entry. The lock serializes writes per supplier only.
    ledger = SupplierLedger.objects.select_for_update().get(supplier=supplier)
    entry  = SupplierLedgerEntry.objects.create(
        ledger          = ledger,
        entry_type      = SupplierLedgerEntry.EntryType.RETURN,
        date            = date,
        details         = purchase_return.note or f"Return against {purchase_return.order.order_number}",
        reference       = purchase_return.reference_number,
        debit           = amount,
        credit          = Decimal("0"),
        purchase_return = purchase_return,
        created_by      = user,
    )
    _recalculate_snapshots_from(ledger, _get_year_month(date))
    return entry


# ---------------------------------------------------------------------------
# Entry deletion — reverses an existing ledger entry
# ---------------------------------------------------------------------------

@transaction.atomic
def remove_ledger_entry_for_payment(*, supplier_payment) -> None:
    """
    Removes ledger entry linked to a supplier payment (deleted payment).
    Cascades snapshot recalculation from the affected month.
    """
    entry = SupplierLedgerEntry.objects.filter(supplier_payment=supplier_payment).first()
    if not entry:
        return
    # Same per-supplier write lock as the add-entry services.
    ledger    = SupplierLedger.objects.select_for_update().get(pk=entry.ledger_id)
    from_ym   = _get_year_month(entry.date)
    entry.delete()
    _recalculate_snapshots_from(ledger, from_ym)


@transaction.atomic
def remove_ledger_entry_for_return(*, purchase_return) -> None:
    """Removes ledger entry linked to a purchase return (if return is reversed)."""
    entry = SupplierLedgerEntry.objects.filter(purchase_return=purchase_return).first()
    if not entry:
        return
    # Same per-supplier write lock as the add-entry services.
    ledger  = SupplierLedger.objects.select_for_update().get(pk=entry.ledger_id)
    from_ym = _get_year_month(entry.date)
    entry.delete()
    _recalculate_snapshots_from(ledger, from_ym)


# ---------------------------------------------------------------------------
# PDF services
# ---------------------------------------------------------------------------

def save_ledger_pdf(
    *, ledger_id: int, file_name: str, date_from=None, date_to=None, user,
) -> SavedLedgerPDF:
    from pathlib import Path
    from django.conf import settings as django_settings
    from django.shortcuts import get_object_or_404

    ledger = get_object_or_404(SupplierLedger, pk=ledger_id)
    pdf, _ = generate_ledger_pdf_bytes(
        ledger_id=ledger_id, date_from=date_from, date_to=date_to,
    )

    local_now = timezone.localtime(timezone.now())
    year      = local_now.year
    timestamp = local_now.strftime("%Y%m%d_%H%M%S")
    safe_name = file_name.strip().replace(" ", "_").replace("/", "-")
    filename  = f"{safe_name}_{timestamp}.pdf"
    pdf_dir   = Path(django_settings.MEDIA_ROOT) / "ledgers" / str(year)
    pdf_dir.mkdir(parents=True, exist_ok=True)
    full_path = pdf_dir / filename

    with open(full_path, "wb") as f:
        f.write(pdf)

    # Forward slashes (as_posix) so the stored path is URL-safe on every OS.
    relative_path = (Path("ledgers") / str(year) / filename).as_posix()
    return SavedLedgerPDF.objects.create(
        ledger=ledger,
        file_name=file_name.strip(),
        file_path=relative_path,
        date_from=date_from,
        date_to=date_to,
        saved_by=user,
    )


def delete_ledger_pdf(*, saved_pdf_id: int, user) -> None:
    import os
    from pathlib import Path
    from django.conf import settings as django_settings
    from django.shortcuts import get_object_or_404

    record    = get_object_or_404(SavedLedgerPDF, pk=saved_pdf_id, is_deleted=False)
    full_path = Path(django_settings.MEDIA_ROOT) / record.file_path
    if full_path.exists():
        os.remove(full_path)

    record.is_deleted = True
    record.deleted_at = timezone.now()
    record.deleted_by = user
    record.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])


def generate_ledger_pdf_bytes(
    *, ledger_id: int, date_from=None, date_to=None,
) -> tuple[bytes, str]:
    from django.conf import settings as django_settings
    from django.template.loader import render_to_string
    from django.shortcuts import get_object_or_404

    from backend.pdf_utils import PDF_BODY_PADDING, PDF_PAGE_MARGIN, get_company_logo_data_uri

    ledger  = get_object_or_404(SupplierLedger, pk=ledger_id)
    entries, opening_balance, closing_balance = _get_entries_with_running_balance(
        ledger=ledger, date_from=date_from, date_to=date_to,
    )

    # Treat opening-balance entries as the account's Opening Balance figure shown
    # in the header, rather than as a transaction row. Their effect is already
    # baked into every subsequent running balance, so the remaining rows stay
    # correct. `opening_balance` is the carried-forward balance for date ranges;
    # add any opening_balance entries that fall inside the shown window.
    ob_from_entries = sum(
        (e["credit"] - e["debit"]) for e in entries if e["entry_type"] == "opening_balance"
    )
    header_opening_balance = opening_balance + ob_from_entries
    display_entries = [e for e in entries if e["entry_type"] != "opening_balance"]

    context = {
        "ledger"          : ledger,
        "entries"         : display_entries,
        "opening_balance" : header_opening_balance,
        "closing_balance" : closing_balance,
        "date_from"       : date_from,
        "date_to"         : date_to,
        "generated_at"    : timezone.localtime(timezone.now()).strftime("%d %b %Y %H:%M"),
        "currency"        : "PKR",
        "company_name"    : django_settings.COMPANY_NAME,
        "company_logo"    : get_company_logo_data_uri(),
        "page_margin"     : PDF_PAGE_MARGIN,
        "body_padding"    : PDF_BODY_PADDING,
    }
    html     = render_to_string("ledger/supplier_ledger_pdf.html", context)
    from weasyprint import HTML
    pdf      = HTML(string=html, base_url=str(django_settings.MEDIA_ROOT)).write_pdf()
    filename = f"Ledger_{ledger.supplier_code}.pdf"
    return pdf, filename


def _get_entries_with_running_balance(
    *, ledger: SupplierLedger, date_from=None, date_to=None,
) -> tuple[list[dict], Decimal, Decimal]:
    """
    Returns list of entry dicts with running_balance computed using hybrid method.
    Hybrid: grab last snapshot before date_from (or start), then accumulate current entries.
    """
    # Normalize view-layer query-param strings to dates (crash-free and
    # required for the index-friendly range filters below).
    date_from = _as_date(date_from)
    date_to   = _as_date(date_to)

    # Determine opening balance using last snapshot before the query window
    opening_balance = Decimal("0")
    if date_from:
        ym_start = _get_year_month(date_from)
        opening_balance = _get_previous_snapshot_balance(ledger, ym_start)
        # Add entries from that month before date_from — range filter so the
        # (ledger, date) index is used (date__startswith could not use it).
        from django.db.models import Sum
        month_start, _month_end = _month_bounds(ym_start)
        pre_month_agg = SupplierLedgerEntry.objects.filter(
            ledger=ledger,
            date__gte=month_start,
            date__lt=date_from,
        ).aggregate(total_credit=Sum("credit"), total_debit=Sum("debit"))
        opening_balance += (pre_month_agg["total_credit"] or Decimal("0"))
        opening_balance -= (pre_month_agg["total_debit"]  or Decimal("0"))
        opening_balance  = max(Decimal("0"), opening_balance)

    # Fetch entries in the query window.
    # Order: date ASC, then created_at ASC (exact chronological order of events).
    # Same-day entries appear in the order they were actually created in the system.
    qs = SupplierLedgerEntry.objects.filter(ledger=ledger).order_by("date", "created_at")

    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)

    # Compute running balance — allow negative temporarily for display accuracy,
    # but show the real balance so user can see when they overpaid
    result          = []
    running_balance = opening_balance
    for entry in qs:
        running_balance = running_balance + entry.credit - entry.debit
        result.append({
            "date"            : entry.date,
            "details"         : entry.details,
            "reference"       : entry.reference,
            "entry_type"      : entry.entry_type,
            "debit"           : entry.debit,
            "credit"          : entry.credit,
            "balance"         : running_balance,   # real balance, can show negative if overpaid
        })

    closing_balance = running_balance
    return result, opening_balance, closing_balance