from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import CashFlow, Expense, ExpenseCategory


# ---------------------------------------------------------------------------
# Internal atomic CashFlow adjuster — NEVER call from outside this module
# ---------------------------------------------------------------------------

def _adjust_cashflow(
    *,
    cash_in_hand_delta              : Decimal = Decimal("0"),
    customer_outstanding_delta      : Decimal = Decimal("0"),
    total_paid_payables_delta       : Decimal = Decimal("0"),
    supplier_payable_outstanding_delta: Decimal = Decimal("0"),
    total_expenses_amount_delta     : Decimal = Decimal("0"),
    user,
) -> CashFlow:
    """
    Atomically adjusts the CashFlow singleton by the given deltas.
    Positive delta = increase. Negative delta = decrease.
    All values floored at 0 — nothing goes negative.
    This is the ONLY function that writes to CashFlow.
    """
    with transaction.atomic():
        cf = CashFlow.objects.select_for_update().get_or_create(pk=1)[0]

        cf.cash_in_hand = max(
            Decimal("0"), cf.cash_in_hand + cash_in_hand_delta
        )
        cf.customer_outstanding = max(
            Decimal("0"), cf.customer_outstanding + customer_outstanding_delta
        )
        cf.total_paid_payables = max(
            Decimal("0"), cf.total_paid_payables + total_paid_payables_delta
        )
        cf.supplier_payable_outstanding = max(
            Decimal("0"), cf.supplier_payable_outstanding + supplier_payable_outstanding_delta
        )
        cf.total_expenses_amount = max(
            Decimal("0"), cf.total_expenses_amount + total_expenses_amount_delta
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

def sync_invoice_confirmed(*, grand_total: Decimal, user) -> None:
    """
    Called when an invoice is confirmed.
    Full grand_total moves from nowhere → customer_outstanding.
    (Cash hasn't arrived yet — customer owes it.)
    """
    _adjust_cashflow(
        customer_outstanding_delta=+grand_total,
        user=user,
    )


def sync_invoice_payment_received(*, amount: Decimal, user) -> None:
    """
    Called when a customer payment is recorded.
    Cash arrives → cash_in_hand increases, customer_outstanding decreases.
    """
    _adjust_cashflow(
        cash_in_hand_delta         = +amount,
        customer_outstanding_delta = -amount,
        user=user,
    )


def sync_invoice_payment_deleted(*, amount: Decimal, user) -> None:
    """
    Called when a customer payment is deleted.
    Reverses the payment — cash goes back to outstanding.
    Only for positive payments (not credit notes).
    """
    if amount > 0:
        _adjust_cashflow(
            cash_in_hand_delta         = -amount,
            customer_outstanding_delta = +amount,
            user=user,
        )


def sync_invoice_return_accepted(*, return_amount: Decimal, user) -> None:
    """
    Called when a billing return is accepted.
    Customer owes less (credit note) → customer_outstanding decreases.
    No cash movement — goods came back, not money.
    """
    _adjust_cashflow(
        customer_outstanding_delta = -return_amount,
        user=user,
    )


def sync_purchase_order_confirmed(*, net_payable: Decimal, advance_amount: Decimal, user) -> None:
    """
    Called when a purchase order is confirmed.
    net_payable → supplier_payable_outstanding.
    But if advance was already paid (on draft creation), subtract it from outstanding.
    The advance was already deducted from cash_in_hand on draft creation.
    """
    _adjust_cashflow(
        supplier_payable_outstanding_delta = +(net_payable - advance_amount),
        total_paid_payables_delta          = +advance_amount,
        user=user,
    )


def sync_supplier_payment_made(*, amount: Decimal, user) -> None:
    """
    Called when a supplier payment is recorded (non-advance, non-credit-note).
    We pay supplier → cash_in_hand decreases, payable decreases, paid increases.
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
    Reverses the payment.
    """
    if amount > 0:
        _adjust_cashflow(
            cash_in_hand_delta                 = +amount,
            supplier_payable_outstanding_delta = +amount,
            total_paid_payables_delta          = -amount,
            user=user,
        )


def sync_purchase_return_accepted(*, return_amount: Decimal, user) -> None:
    """
    Called when a purchase return is accepted.
    We get goods back → supplier owes us less → payable_outstanding decreases.
    """
    _adjust_cashflow(
        supplier_payable_outstanding_delta = -return_amount,
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


def sync_advance_payment_deleted(*, advance_amount: Decimal, user) -> None:
    """
    Called when a draft purchase order with advance is deleted.
    Restores advance_amount to cash_in_hand.
    """
    _adjust_cashflow(
        cash_in_hand_delta = +advance_amount,
        user=user,
    )