from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import CashFlow, Expense, ExpenseCategory


# ---------------------------------------------------------------------------
# Internal atomic CashFlow adjuster — NEVER call from outside this module
# ---------------------------------------------------------------------------

def _adjust_cashflow(
    *,
    cash_in_hand_delta                 : Decimal = Decimal("0"),
    customer_outstanding_delta         : Decimal = Decimal("0"),
    total_invoices_cash_delta          : Decimal = Decimal("0"),
    total_paid_payables_delta          : Decimal = Decimal("0"),
    supplier_payable_outstanding_delta : Decimal = Decimal("0"),
    total_purchases_cash_delta         : Decimal = Decimal("0"),
    total_expenses_amount_delta        : Decimal = Decimal("0"),
    total_lost_inventory_worth_delta   : Decimal = Decimal("0"),
    total_purchase_returns_value_delta : Decimal = Decimal("0"),
    total_purchase_returns_cogs_delta  : Decimal = Decimal("0"),
    total_customer_returns_value_delta : Decimal = Decimal("0"),
    total_customer_returns_cogs_delta  : Decimal = Decimal("0"),
    total_invoice_revenue_delta        : Decimal = Decimal("0"),
    total_invoice_cogs_delta           : Decimal = Decimal("0"),
    total_gross_profit_delta           : Decimal = Decimal("0"),
    user,
) -> CashFlow:
    """
    Atomically adjusts the CashFlow singleton by the given deltas.
    Positive delta = increase. Negative delta = decrease.
    Fields floored at 0 where appropriate.
    This is the ONLY function that writes to CashFlow.

    Field semantics:
        cash_in_hand            = actual cash available (invoice receipts - expenses - supplier payments)
        customer_outstanding    = what customers still owe (increases on confirm, decreases on payment)
        total_invoices_cash     = GROSS invoice receipts ever collected (only ever increases)
        total_paid_payables     = total ever paid to suppliers (only ever increases)
        supplier_payable_outstanding = what we still owe suppliers
        total_purchases_cash    = total purchase value confirmed (paid + outstanding, only ever increases)
        total_expenses_amount   = total expenses recorded
        total_lost_inventory_worth = total FIFO cost of products marked lost (only ever increases)
        total_purchase_returns_value = total value of accepted returns to suppliers (only ever increases)
        total_purchase_returns_cogs  = total pre-tax cost of accepted returns to suppliers (only ever increases)
        total_customer_returns_value = total value of accepted returns from customers (only ever increases)
        total_customer_returns_cogs  = total COGS reversed via accepted customer returns (only ever increases)
        total_invoice_revenue   = total grand_total across confirmed invoices (only ever increases)
        total_invoice_cogs      = total COGS across confirmed invoices (only ever increases)
        total_gross_profit      = total gross profit across confirmed invoices (only ever increases)
    """
    with transaction.atomic():
        cf = CashFlow.objects.select_for_update().get_or_create(pk=1)[0]

        cf.cash_in_hand = max(
            Decimal("0"), cf.cash_in_hand + cash_in_hand_delta
        )
        cf.customer_outstanding = max(
            Decimal("0"), cf.customer_outstanding + customer_outstanding_delta
        )
        # total_invoices_cash: gross receipts — floored at 0 but should only increase
        cf.total_invoices_cash = max(
            Decimal("0"), cf.total_invoices_cash + total_invoices_cash_delta
        )
        cf.total_paid_payables = max(
            Decimal("0"), cf.total_paid_payables + total_paid_payables_delta
        )
        cf.supplier_payable_outstanding = max(
            Decimal("0"), cf.supplier_payable_outstanding + supplier_payable_outstanding_delta
        )
        # total_purchases_cash: total purchase value — floored at 0
        cf.total_purchases_cash = max(
            Decimal("0"), cf.total_purchases_cash + total_purchases_cash_delta
        )
        cf.total_expenses_amount = max(
            Decimal("0"), cf.total_expenses_amount + total_expenses_amount_delta
        )
        cf.total_lost_inventory_worth = max(
            Decimal("0"), cf.total_lost_inventory_worth + total_lost_inventory_worth_delta
        )
        cf.total_purchase_returns_value = max(
            Decimal("0"), cf.total_purchase_returns_value + total_purchase_returns_value_delta
        )
        cf.total_purchase_returns_cogs = max(
            Decimal("0"), cf.total_purchase_returns_cogs + total_purchase_returns_cogs_delta
        )
        cf.total_customer_returns_value = max(
            Decimal("0"), cf.total_customer_returns_value + total_customer_returns_value_delta
        )
        cf.total_customer_returns_cogs = max(
            Decimal("0"), cf.total_customer_returns_cogs + total_customer_returns_cogs_delta
        )
        cf.total_invoice_revenue = max(
            Decimal("0"), cf.total_invoice_revenue + total_invoice_revenue_delta
        )
        cf.total_invoice_cogs = max(
            Decimal("0"), cf.total_invoice_cogs + total_invoice_cogs_delta
        )
        cf.total_gross_profit = max(
            Decimal("0"), cf.total_gross_profit + total_gross_profit_delta
        )
        cf.last_updated_by = user
        cf.save()
        return cf


# ---------------------------------------------------------------------------
# ExpenseCategory services
# ---------------------------------------------------------------------------

def create_expense_category(*, name: str, description: str = "", user) -> ExpenseCategory:
    from rest_framework.exceptions import ValidationError
    if ExpenseCategory.objects.filter(name__iexact=name.strip()).exists():
        raise ValidationError({"name": "An expense category with this name already exists."})
    return ExpenseCategory.objects.create(
        name=name.strip(),
        description=description,
        created_by=user,
    )


def update_expense_category(*, pk: int, name: str = None, description: str = None, user) -> ExpenseCategory:
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError
    category = get_object_or_404(ExpenseCategory, pk=pk)
    if name:
        qs = ExpenseCategory.objects.filter(name__iexact=name.strip()).exclude(pk=pk)
        if qs.exists():
            raise ValidationError({"name": "An expense category with this name already exists."})
        category.name = name.strip()
    if description is not None:
        category.description = description
    category.save(update_fields=["name", "description"])
    return category


def delete_expense_category(*, pk: int) -> None:
    from django.shortcuts import get_object_or_404
    category = get_object_or_404(ExpenseCategory, pk=pk)
    category.delete()


# ---------------------------------------------------------------------------
# Expense services
# ---------------------------------------------------------------------------

def create_expense(
    *, name: str, category_id: int, amount: Decimal,
    expense_date, description: str = "", user,
) -> Expense:
    """
    Creates an expense and immediately deducts amount from cash_in_hand.
    """
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    if amount <= 0:
        raise ValidationError({"amount": "Expense amount must be greater than zero."})

    get_object_or_404(ExpenseCategory, pk=category_id)

    expense = Expense.objects.create(
        name=name,
        category_id=category_id,
        amount=amount,
        expense_date=expense_date,
        description=description,
        created_by=user,
        updated_by=user,
    )

    # Deduct from cash_in_hand and add to total_expenses_amount
    _adjust_cashflow(
        cash_in_hand_delta          = -amount,
        total_expenses_amount_delta = +amount,
        user=user,
    )

    return expense


def update_expense(
    *, pk: int, name: str = None, category_id: int = None,
    amount: Decimal = None, expense_date=None,
    description: str = None, user,
) -> Expense:
    """
    Updates an expense. If amount changes, adjusts cash_in_hand by the difference.
    Example: old=10000, new=8000 → cash_in_hand += 2000 (refund)
             old=10000, new=12000 → cash_in_hand -= 2000 (extra deduction)
    """
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    expense = get_object_or_404(Expense, pk=pk, is_deleted=False)
    old_amount = expense.amount

    if name is not None:
        expense.name = name
    if category_id is not None:
        get_object_or_404(ExpenseCategory, pk=category_id)
        expense.category_id = category_id
    if description is not None:
        expense.description = description
    if expense_date is not None:
        expense.expense_date = expense_date
    if amount is not None:
        if amount <= 0:
            raise ValidationError({"amount": "Expense amount must be greater than zero."})
        expense.amount = amount

    expense.updated_by = user
    expense.save()

    # Adjust cash_in_hand by the difference
    if amount is not None and amount != old_amount:
        delta = old_amount - amount  # positive = refund, negative = extra deduction
        _adjust_cashflow(
            cash_in_hand_delta          = delta,
            total_expenses_amount_delta = -delta,  # inverse
            user=user,
        )

    return expense


def delete_expense(*, pk: int, user) -> None:
    """
    Soft-deletes expense and restores its amount to cash_in_hand.
    """
    from django.shortcuts import get_object_or_404

    expense = get_object_or_404(Expense, pk=pk, is_deleted=False)
    amount  = expense.amount

    expense.is_deleted = True
    expense.deleted_at = timezone.now()
    expense.deleted_by = user
    expense.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])

    # Restore amount to cash_in_hand
    _adjust_cashflow(
        cash_in_hand_delta          = +amount,
        total_expenses_amount_delta = -amount,
        user=user,
    )


# ---------------------------------------------------------------------------
# Public sync functions — called by purchases and billing apps
# ---------------------------------------------------------------------------

def sync_invoice_confirmed(
    *, grand_total: Decimal, total_cogs: Decimal = Decimal("0"),
    gross_profit: Decimal = Decimal("0"), user,
) -> None:
    """
    Called when an invoice is confirmed.
    Full grand_total moves from nowhere → customer_outstanding.
    (Cash hasn't arrived yet — customer owes it.)
    total_invoice_revenue/total_invoice_cogs/total_gross_profit are the
    all-time running totals for the Profit/Margin report — returns don't
    reduce these (Invoice.total_cogs/gross_profit are unaffected by returns,
    confirmed by tracing _recalculate_invoice_totals), so this is the only
    place they're ever incremented.
    """
    _adjust_cashflow(
        customer_outstanding_delta = +grand_total,
        total_invoice_revenue_delta = +grand_total,
        total_invoice_cogs_delta    = +total_cogs,
        total_gross_profit_delta    = +gross_profit,
        user=user,
    )


def sync_invoice_payment_received(*, amount: Decimal, user) -> None:
    """
    Called when a customer payment is recorded.
    cash_in_hand increases (actual cash received).
    customer_outstanding decreases (they paid us).
    total_invoices_cash increases (gross collection tracker — never reversed).
    """
    _adjust_cashflow(
        cash_in_hand_delta         = +amount,
        customer_outstanding_delta = -amount,
        total_invoices_cash_delta  = +amount,
        user=user,
    )


def sync_invoice_payment_deleted(*, amount: Decimal, user) -> None:
    """
    Called when a customer payment is deleted.
    Reverses all three fields that were updated on creation.
    Only for positive payments (not credit notes).
    """
    if amount > 0:
        _adjust_cashflow(
            cash_in_hand_delta        = -amount,
            customer_outstanding_delta= +amount,
            total_invoices_cash_delta = -amount,
            user=user,
        )


def sync_invoice_return_accepted(
    *, return_amount: Decimal, return_cogs: Decimal = Decimal("0"), user,
) -> None:
    """
    Called when a billing return is accepted.
    Customer owes less (credit note) → customer_outstanding decreases.
    No cash movement — goods came back, not money.
    total_customer_returns_value/total_customer_returns_cogs are all-time
    running totals for the Customer Returns report — no reversal path exists
    for an accepted return, so this only ever increases.
    """
    _adjust_cashflow(
        customer_outstanding_delta         = -return_amount,
        total_customer_returns_value_delta = +return_amount,
        total_customer_returns_cogs_delta  = +return_cogs,
        user=user,
    )


def sync_purchase_order_confirmed(*, net_payable: Decimal, advance_amount: Decimal, user) -> None:
    """
    Called when a purchase order is confirmed.
    total_purchases_cash increases by full net_payable (gross purchase value tracker).
    supplier_payable_outstanding = net_payable - advance (advance already paid on draft).
    total_paid_payables += advance (it was already paid from cash_in_hand on draft).
    """
    _adjust_cashflow(
        supplier_payable_outstanding_delta = +(net_payable - advance_amount),
        total_paid_payables_delta          = +advance_amount,
        total_purchases_cash_delta         = +net_payable,
        user=user,
    )


def sync_supplier_payment_made(*, amount: Decimal, user) -> None:
    """
    Called when a supplier payment is recorded (non-advance, non-credit-note).
    cash_in_hand decreases (we spent cash).
    supplier_payable_outstanding decreases (we cleared some debt).
    total_paid_payables increases (total ever paid tracker).
    total_purchases_cash does NOT change — already recorded at PO confirmation.
    """
    _adjust_cashflow(
        cash_in_hand_delta                 = -amount,
        supplier_payable_outstanding_delta = -amount,
        total_paid_payables_delta          = +amount,
        user=user,
    )


def sync_supplier_payment_deleted(*, amount: Decimal, user) -> None:
    """
    Called when a supplier payment record is deleted.
    Reverses all three fields updated on payment creation.
    total_purchases_cash is not touched (PO is still confirmed).
    """
    if amount > 0:
        _adjust_cashflow(
            cash_in_hand_delta                 = +amount,
            supplier_payable_outstanding_delta = +amount,
            total_paid_payables_delta          = -amount,
            user=user,
        )


def sync_purchase_return_accepted(
    *, return_amount: Decimal, return_cogs: Decimal = Decimal("0"), user,
) -> None:
    """
    Called when a purchase return is accepted.
    We get goods back → supplier owes us less → payable_outstanding decreases.
    total_purchase_returns_value/total_purchase_returns_cogs are the all-time
    running totals for the Purchase Returns report (return_cogs is the
    pre-tax cost portion — total_return_gross — mirroring how
    total_customer_returns_cogs works for symmetry on the dashboard).
    No reversal path exists for an accepted return, so these only increase.
    """
    _adjust_cashflow(
        supplier_payable_outstanding_delta = -return_amount,
        total_purchase_returns_value_delta = +return_amount,
        total_purchase_returns_cogs_delta  = +return_cogs,
        user=user,
    )


def sync_advance_payment_created(*, advance_amount: Decimal, user) -> None:
    """
    Called when a DRAFT purchase order is created with payment_type=advance.
    Immediately deducts advance from cash_in_hand.
    Recorded in payment history separately.
    """
    _adjust_cashflow(
        cash_in_hand_delta = -advance_amount,
        user=user,
    )


def sync_advance_payment_updated(*, old_amount: Decimal, new_amount: Decimal, user) -> None:
    """
    Called when advance_amount is edited on a draft purchase order.
    Adjusts cash_in_hand by the difference.
    """
    delta = old_amount - new_amount  # positive = refund, negative = extra deduction
    _adjust_cashflow(
        cash_in_hand_delta = delta,
        user=user,
    )


def sync_data_entry_supplier_opening_balance(*, amount: Decimal, user) -> None:
    """
    Data-entry bootstrap: records a supplier opening balance (what we owed a
    supplier before go-live). A carried-forward payable only — it is NOT a
    purchase made in the operating period, so ONLY supplier_payable_outstanding
    increases. total_purchases_cash is deliberately untouched, mirroring the
    customer side (sync_data_entry_customer_opening_balance). No cash movement.
    """
    _adjust_cashflow(
        supplier_payable_outstanding_delta = +amount,
        user=user,
    )


def sync_data_entry_customer_opening_balance(*, amount: Decimal, user) -> None:
    """
    Data-entry bootstrap: records a customer opening balance (what a customer
    owed us before go-live). Only customer_outstanding increases — NO cash was
    received, so total_invoices_cash is deliberately left untouched.
    """
    _adjust_cashflow(
        customer_outstanding_delta = +amount,
        user=user,
    )


def sync_data_entry_opening_cash(*, amount: Decimal, user) -> None:
    """
    Data-entry bootstrap: seeds starting cash on hand. Treated as collected cash,
    so both cash_in_hand and total_invoices_cash increase.
    """
    _adjust_cashflow(
        cash_in_hand_delta        = +amount,
        total_invoices_cash_delta = +amount,
        user=user,
    )


def sync_advance_payment_deleted(*, advance_amount: Decimal, user) -> None:
    """
    Called when a draft purchase order with advance is deleted.
    Restores advance_amount to cash_in_hand.
    """
    _adjust_cashflow(
        cash_in_hand_delta = +advance_amount,
        user=user,
    )


def sync_lost_inventory_created(*, amount: Decimal, user) -> None:
    """
    Called when a lost inventory record is created.
    total_lost_inventory_worth increases by the batch's FIFO cost.
    No reversal path exists — lost inventory records cannot be deleted/undone.
    """
    _adjust_cashflow(
        total_lost_inventory_worth_delta = +amount,
        user=user,
    )