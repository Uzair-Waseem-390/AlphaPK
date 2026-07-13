from decimal import Decimal
from itertools import accumulate

from django.db import transaction
from django.utils import timezone

from .models import SavedLedgerPDF, SupplierLedger, SupplierLedgerEntry, SupplierLedgerSnapshot


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_year_month(date) -> str:
    """Returns 'YYYY-MM' string from a date or datetime."""
    return date.strftime("%Y-%m")


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

        # Sum all entries in this month
        agg = SupplierLedgerEntry.objects.filter(
            ledger=ledger,
            date__startswith=ym,
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
    ledger = SupplierLedger.objects.get(supplier=supplier)
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
    ledger = SupplierLedger.objects.get(supplier=supplier)
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
    ledger = SupplierLedger.objects.get(supplier=supplier)
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
    ledger = SupplierLedger.objects.get(supplier=supplier)
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
    ledger = SupplierLedger.objects.get(supplier=supplier)
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
    ledger    = entry.ledger
    from_ym   = _get_year_month(entry.date)
    entry.delete()
    _recalculate_snapshots_from(ledger, from_ym)


@transaction.atomic
def remove_ledger_entry_for_return(*, purchase_return) -> None:
    """Removes ledger entry linked to a purchase return (if return is reversed)."""
    entry = SupplierLedgerEntry.objects.filter(purchase_return=purchase_return).first()
    if not entry:
        return
    ledger  = entry.ledger
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

    relative_path = str(Path("ledgers") / str(year) / filename)
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

    ledger  = get_object_or_404(SupplierLedger, pk=ledger_id)
    entries, closing_balance = _get_entries_with_running_balance(
        ledger=ledger, date_from=date_from, date_to=date_to,
    )

    context = {
        "ledger"          : ledger,
        "entries"         : entries,
        "closing_balance" : closing_balance,
        "date_from"       : date_from,
        "date_to"         : date_to,
        "generated_at"    : timezone.localtime(timezone.now()).strftime("%d %b %Y %H:%M"),
        "currency"        : "PKR",
    }
    html     = render_to_string("ledger/supplier_ledger_pdf.html", context)
    from weasyprint import HTML
    pdf      = HTML(string=html, base_url=str(django_settings.MEDIA_ROOT)).write_pdf()
    filename = f"Ledger_{ledger.supplier_code}.pdf"
    return pdf, filename


def _get_entries_with_running_balance(
    *, ledger: SupplierLedger, date_from=None, date_to=None,
) -> tuple[list[dict], Decimal]:
    """
    Returns list of entry dicts with running_balance computed using hybrid method.
    Hybrid: grab last snapshot before date_from (or start), then accumulate current entries.
    """
    # Determine opening balance using last snapshot before the query window
    opening_balance = Decimal("0")
    if date_from:
        ym_start = _get_year_month(date_from)
        opening_balance = _get_previous_snapshot_balance(ledger, ym_start)
        # Add entries from that month before date_from
        from django.db.models import Sum
        pre_month_agg = SupplierLedgerEntry.objects.filter(
            ledger=ledger,
            date__startswith=ym_start,
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
    return result, closing_balance