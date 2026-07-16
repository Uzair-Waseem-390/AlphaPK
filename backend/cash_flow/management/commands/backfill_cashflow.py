from decimal import Decimal

from django.core.management.base import BaseCommand

from cash_flow.models import CashFlow


class Command(BaseCommand):
    help = "Backfills the CashFlow singleton from existing invoices, purchases, and expenses."

    def handle(self, *args, **kwargs):
        from billing.models import Invoice, Payment, Return
        from purchases.models import LostInventoryItem, PurchaseOrder, PurchaseReturn, SupplierPayment
        from cash_flow.models import Expense

        self.stdout.write("Starting CashFlow backfill...\n")

        # Reset singleton
        cf, _ = CashFlow.objects.get_or_create(pk=1)
        cf.cash_in_hand               = Decimal("0")
        cf.customer_outstanding       = Decimal("0")
        cf.total_paid_payables        = Decimal("0")
        cf.supplier_payable_outstanding = Decimal("0")
        cf.total_expenses_amount      = Decimal("0")
        cf.total_lost_inventory_worth = Decimal("0")
        cf.total_purchase_returns_value = Decimal("0")
        cf.total_customer_returns_value = Decimal("0")
        cf.total_customer_returns_cogs  = Decimal("0")
        cf.total_invoice_revenue      = Decimal("0")
        cf.total_invoice_cogs         = Decimal("0")
        cf.total_gross_profit         = Decimal("0")
        cf.save()

        # 1. Customer outstanding = sum of credit_outstanding on confirmed invoices
        invoices = Invoice.objects.filter(
            is_deleted=False,
        ).exclude(status="draft")

        for inv in invoices:
            cf.customer_outstanding += inv.credit_outstanding or Decimal("0")
        self.stdout.write(f"  customer_outstanding: {cf.customer_outstanding}")

        # 2. Cash in hand + total_invoices_cash = sum of all positive invoice payments received
        payments = Payment.objects.filter(
            is_deleted=False,
            amount__gt=0,
            invoice__is_deleted=False,
        ).exclude(invoice__status="draft")

        for p in payments:
            cf.cash_in_hand       += p.amount
            cf.total_invoices_cash += p.amount
        self.stdout.write(f"  cash_in_hand (before expenses/advances): {cf.cash_in_hand}")
        self.stdout.write(f"  total_invoices_cash: {cf.total_invoices_cash}")

        # 3. Supplier payable outstanding = sum of payable_outstanding on confirmed orders
        orders = PurchaseOrder.objects.filter(
            is_deleted=False,
            status="confirmed",
        )
        for order in orders:
            cf.supplier_payable_outstanding += order.payable_outstanding or Decimal("0")
        self.stdout.write(f"  supplier_payable_outstanding: {cf.supplier_payable_outstanding}")

        # 3b. total_purchases_cash = sum of net_payable on all confirmed orders
        for order in orders:
            cf.total_purchases_cash += order.net_payable or Decimal("0")
        self.stdout.write(f"  total_purchases_cash: {cf.total_purchases_cash}")

        # 4. Total paid payables = sum of positive supplier payments (non-advance)
        sp = SupplierPayment.objects.filter(
            is_deleted=False,
            amount__gt=0,
            order__is_deleted=False,
            order__status="confirmed",
        )
        for p in sp:
            cf.total_paid_payables += p.amount
        self.stdout.write(f"  total_paid_payables: {cf.total_paid_payables}")

        # 5. Expenses
        expenses = Expense.objects.filter(is_deleted=False)
        for exp in expenses:
            cf.total_expenses_amount += exp.amount
            cf.cash_in_hand          -= exp.amount  # expenses reduce cash
        cf.cash_in_hand = max(Decimal("0"), cf.cash_in_hand)
        self.stdout.write(f"  total_expenses_amount: {cf.total_expenses_amount}")

        # 6. Advance payments already deducted from cash_in_hand
        advance_payments = SupplierPayment.objects.filter(
            is_deleted=False,
            amount__gt=0,
            note__startswith="Advance payment",
            order__is_deleted=False,
            order__status="draft",  # only draft advances not yet confirmed
        )
        for ap in advance_payments:
            cf.cash_in_hand -= ap.amount
        cf.cash_in_hand = max(Decimal("0"), cf.cash_in_hand)
        self.stdout.write(f"  cash_in_hand (final): {cf.cash_in_hand}")

        # 7. Lost inventory worth = sum of total_cost on all lost inventory items
        lost_items = LostInventoryItem.objects.filter(record__is_deleted=False)
        for li in lost_items:
            cf.total_lost_inventory_worth += li.total_cost or Decimal("0")
        self.stdout.write(f"  total_lost_inventory_worth: {cf.total_lost_inventory_worth}")

        # 8. Purchase returns value = sum of total_return_amount on accepted purchase returns
        purchase_returns = PurchaseReturn.objects.filter(is_deleted=False, status="accepted")
        for pr in purchase_returns:
            cf.total_purchase_returns_value += pr.total_return_amount or Decimal("0")
        self.stdout.write(f"  total_purchase_returns_value: {cf.total_purchase_returns_value}")

        # 9. Customer returns value/cogs = sum on accepted billing returns
        customer_returns = Return.objects.filter(is_deleted=False, status="accepted")
        for cr in customer_returns:
            cf.total_customer_returns_value += cr.total_return_amount or Decimal("0")
            cf.total_customer_returns_cogs  += cr.total_return_cogs or Decimal("0")
        self.stdout.write(f"  total_customer_returns_value: {cf.total_customer_returns_value}")
        self.stdout.write(f"  total_customer_returns_cogs: {cf.total_customer_returns_cogs}")

        # 10. Invoice revenue/cogs/gross_profit = sum over confirmed, non-data-entry invoices
        #     (mirrors exactly which invoices go through confirm_invoice in the live sync path)
        real_invoices = invoices.filter(is_data_entry=False)
        for inv in real_invoices:
            cf.total_invoice_revenue += inv.grand_total or Decimal("0")
            cf.total_invoice_cogs    += inv.total_cogs or Decimal("0")
            cf.total_gross_profit    += inv.gross_profit or Decimal("0")
        self.stdout.write(f"  total_invoice_revenue: {cf.total_invoice_revenue}")
        self.stdout.write(f"  total_invoice_cogs: {cf.total_invoice_cogs}")
        self.stdout.write(f"  total_gross_profit: {cf.total_gross_profit}")

        cf.save()
        self.stdout.write(self.style.SUCCESS("\nCashFlow backfill complete."))
        self.stdout.write(f"""
Final CashFlow state:
  cash_in_hand                  : {cf.cash_in_hand}
  customer_outstanding          : {cf.customer_outstanding}
  total_invoices_cash           : {cf.total_invoices_cash}
  total_paid_payables           : {cf.total_paid_payables}
  supplier_payable_outstanding  : {cf.supplier_payable_outstanding}
  total_purchases_cash          : {cf.total_purchases_cash}
  total_expenses_amount         : {cf.total_expenses_amount}
  total_lost_inventory_worth    : {cf.total_lost_inventory_worth}
  total_purchase_returns_value  : {cf.total_purchase_returns_value}
  total_customer_returns_value  : {cf.total_customer_returns_value}
  total_customer_returns_cogs   : {cf.total_customer_returns_cogs}
  total_invoice_revenue         : {cf.total_invoice_revenue}
  total_invoice_cogs            : {cf.total_invoice_cogs}
  total_gross_profit            : {cf.total_gross_profit}
""")