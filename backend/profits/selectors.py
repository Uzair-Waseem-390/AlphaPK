from decimal import Decimal


def get_business_worth() -> dict:
    """
    Total Business Worth — a live net-worth (balance-sheet) read, not a
    stored/synced figure. Every component is either already an O(1)
    singleton field on another app's Flow model, or a bounded live
    computation (Inventory Valuation — cost scales with today's distinct
    product count, not history size, same reasoning as the existing
    Inventory Valuation Report). No new sync wiring needed anywhere.

    Assets:
        + cash_in_hand                  (CashFlow)
        + inventory_value               (live FIFO cost, reports selectors)
        + assets_current_worth          (AssetFlow)
        + customer_outstanding          (CashFlow — accounts receivable)
    Liabilities (subtracted):
        - supplier_payable_outstanding  (CashFlow — accounts payable)
        - sales_tax_outstanding         (TaxFlow — GST owed to FBR)
        - wht_outstanding               (TaxFlow — WHT withheld from suppliers, not yet deposited)
        - recurring_expense_pending     (RecurringExpenseFlow — assigned but unpaid dues)
    """
    from assets.models import AssetFlow
    from cash_flow.models import CashFlow
    from recurring_expenses.models import RecurringExpenseFlow
    from reports.selectors import get_inventory_valuation_report_data, get_inventory_valuation_report_stats
    from taxes.models import TaxFlow

    cf   = CashFlow.get_instance()
    af   = AssetFlow.get_instance()
    tf   = TaxFlow.get_instance()
    ref  = RecurringExpenseFlow.get_instance()

    inventory_rows  = get_inventory_valuation_report_data()
    inventory_stats = get_inventory_valuation_report_stats(inventory_rows)
    inventory_value = inventory_stats["total_inventory_value"]

    cash_in_hand                 = cf.cash_in_hand
    assets_current_worth         = af.total_current_worth
    customer_outstanding         = cf.customer_outstanding
    supplier_payable_outstanding = cf.supplier_payable_outstanding
    sales_tax_outstanding        = tf.sales_tax_outstanding
    wht_outstanding              = tf.wht_outstanding
    recurring_expense_pending    = ref.total_pending_amount

    total_business_worth = (
        cash_in_hand
        + inventory_value
        + assets_current_worth
        + customer_outstanding
        - supplier_payable_outstanding
        - sales_tax_outstanding
        - wht_outstanding
        - recurring_expense_pending
    )

    return {
        "cash_in_hand"                 : cash_in_hand,
        "inventory_value"              : inventory_value,
        "assets_current_worth"         : assets_current_worth,
        "customer_outstanding"         : customer_outstanding,
        "supplier_payable_outstanding" : supplier_payable_outstanding,
        "sales_tax_outstanding"        : sales_tax_outstanding,
        "wht_outstanding"              : wht_outstanding,
        "recurring_expense_pending"    : recurring_expense_pending,
        "total_business_worth"         : total_business_worth,
    }


def get_ownership_split() -> dict:
    """
    Splits total_business_worth between investors (by their theoretical,
    growth-compounded current_worth) and the owner (the residual). Never
    netted or capped — if investors' combined current_worth exceeds actual
    business worth, owner_share_percent goes negative on purpose (mirrors
    CashManagementFlow.net_owner_capital, which is already allowed to go
    negative for the same reason).
    """
    from cash_management.models import CashManagementFlow, Investor

    worth = get_business_worth()
    total_business_worth = worth["total_business_worth"]

    cmf = CashManagementFlow.get_instance()
    total_investor_net_worth = cmf.total_investor_net_worth

    investors_qs = Investor.objects.filter(is_deleted=False).order_by("name")

    def _share_percent(amount: Decimal) -> Decimal:
        if total_business_worth == 0:
            return Decimal("0")
        return (amount / total_business_worth) * Decimal("100")

    investors = [
        {
            "id"             : inv.id,
            "name"           : inv.name,
            "current_worth"  : inv.current_worth,
            "share_percent"  : _share_percent(inv.current_worth),
        }
        for inv in investors_qs
    ]

    owner_worth         = total_business_worth - total_investor_net_worth
    owner_share_percent = Decimal("100") - _share_percent(total_investor_net_worth)

    return {
        **worth,
        "total_investor_net_worth" : total_investor_net_worth,
        "investors"                 : investors,
        "owner_worth"                : owner_worth,
        "owner_share_percent"        : owner_share_percent,
    }
