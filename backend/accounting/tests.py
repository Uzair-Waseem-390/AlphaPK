from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from assets.services import create_asset, create_asset_category
from billing.services import (
    confirm_invoice, create_customer, create_invoice, create_payment,
    set_invoice_item_shelf_allocations, update_invoice_due_date,
)
from cash_flow.services import create_expense, create_expense_category
from purchases.models import Category, Product, Shelf
from purchases.services import (
    confirm_purchase_order, create_opening_stock_order, create_purchase_order,
    create_supplier, set_purchase_item_shelf_allocations,
)
from cash_management.services import create_investor
from data_entry.services import (
    create_customer_opening_balance, create_opening_cash,
    create_opening_investor_investment, create_supplier_opening_balance,
)
from profits.services import _add_months, catch_up_monthly_profits
from rates.services import create_rate

from .models import BalanceSheetSnapshot
from .services import catch_up_balance_sheet_snapshots
from .selectors import (
    get_ap_aging_rows, get_ap_aging_summary, get_ar_aging_rows,
    get_ar_aging_summary, get_balance_sheet_for_period, get_balance_sheet_live,
    get_cash_flow_statement, get_fixed_asset_register_rows,
    get_fixed_asset_register_summary, get_income_statement,
)
from .views import (
    APAgingListView, ARAgingListView, BalanceSheetView,
    CashFlowStatementView, FixedAssetRegisterListView, IncomeStatementView,
)
from users.models import User


def make_admin(email="admin@example.com"):
    return User.objects.create_user(
        email=email, password="Adm1n-secret!", first_name="Admin",
        last_name="User", is_staff=True,
    )


def make_normal_user(email="normal@example.com"):
    return User.objects.create_user(
        email=email, password="N0rmal-secret!", first_name="Normal", last_name="User",
    )


class AccountingTestBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = make_admin()
        self.category = Category.objects.create(name="Cat A")
        self.shelf = Shelf.objects.create(name="Shelf A")
        self.supplier = create_supplier(name="Ali Traders", code="ALI", user=self.admin)
        self.customer = create_customer(
            name="Big Mart", code="BM", address="Main St", user=self.admin,
        )

    def make_stocked_product(self, code="P001", stock=10, unit_cost="50", selling_price="100"):
        product = Product.objects.create(name="Product 1", code=code, category=self.category)
        create_rate(product_id=product.id, selling_price=Decimal(selling_price), user=self.admin)
        order = create_purchase_order(
            supplier_id=self.supplier.id,
            items=[{"product_id": product.id, "quantity": stock, "unit_price": Decimal(unit_cost)}],
            user=self.admin,
        )
        for item in order.items.all():
            set_purchase_item_shelf_allocations(
                purchase_item_id=item.id,
                allocations=[{"shelf_id": self.shelf.id, "quantity": item.quantity}],
                user=self.admin,
            )
        confirm_purchase_order(order_id=order.id, user=self.admin)
        return product

    def make_confirmed_invoice(self, product, quantity=4, due_date=None):
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": quantity}],
            user=self.admin,
        )
        for item in invoice.items.all():
            set_invoice_item_shelf_allocations(
                invoice_item_id=item.id,
                allocations=[{"shelf_id": self.shelf.id, "quantity": item.quantity}],
                user=self.admin,
            )
        invoice = confirm_invoice(invoice_id=invoice.id, user=self.admin)
        if due_date is not None:
            update_invoice_due_date(invoice_id=invoice.id, new_due_date=due_date, user=self.admin)
            invoice.refresh_from_db()
        return invoice

    def make_confirmed_purchase_order(self, product, quantity=4, unit_cost="50"):
        order = create_purchase_order(
            supplier_id=self.supplier.id,
            items=[{"product_id": product.id, "quantity": quantity, "unit_price": Decimal(unit_cost)}],
            user=self.admin,
        )
        for item in order.items.all():
            set_purchase_item_shelf_allocations(
                purchase_item_id=item.id,
                allocations=[{"shelf_id": self.shelf.id, "quantity": item.quantity}],
                user=self.admin,
            )
        return confirm_purchase_order(order_id=order.id, user=self.admin)


# ---------------------------------------------------------------------------
# A/R Aging
# ---------------------------------------------------------------------------

class ARAgingTests(AccountingTestBase):
    def test_bucketing_by_days_overdue(self):
        product = self.make_stocked_product(stock=20)
        today = timezone.localdate()
        current_invoice = self.make_confirmed_invoice(product, quantity=1, due_date=today + timedelta(days=5))
        overdue_invoice = self.make_confirmed_invoice(product, quantity=1, due_date=today - timedelta(days=45))

        rows = get_ar_aging_rows()
        by_id = {r["invoice_id"]: r for r in rows}
        self.assertEqual(by_id[current_invoice.id]["bucket"], "current")
        self.assertEqual(by_id[overdue_invoice.id]["bucket"], "31_60")
        self.assertEqual(by_id[overdue_invoice.id]["outstanding"], overdue_invoice.credit_outstanding)

        summary = get_ar_aging_summary(rows)
        self.assertEqual(summary["invoice_count"], 2)
        self.assertEqual(
            summary["grand_total"],
            current_invoice.credit_outstanding + overdue_invoice.credit_outstanding,
        )
        self.assertEqual(summary["buckets"]["31_60"]["count"], 1)

    def test_view_bucket_filter_narrows_results_but_not_summary(self):
        product = self.make_stocked_product(stock=20)
        today = timezone.localdate()
        self.make_confirmed_invoice(product, quantity=1, due_date=today + timedelta(days=5))
        overdue_invoice = self.make_confirmed_invoice(product, quantity=1, due_date=today - timedelta(days=45))

        request = self.factory.get("/api/accounting/ar-aging/", {"bucket": "31_60"})
        force_authenticate(request, user=self.admin)
        response = ARAgingListView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        # Table narrows to just the matching bucket...
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["invoice_id"], overdue_invoice.id)
        # ...but the summary cards still reflect BOTH invoices, unfiltered.
        self.assertEqual(response.data["summary"]["invoice_count"], 2)

    def test_fully_paid_invoice_excluded(self):
        product = self.make_stocked_product(stock=20)
        invoice = self.make_confirmed_invoice(product, quantity=1)
        from billing.services import create_payment
        create_payment(
            invoice_id=invoice.id, amount=invoice.credit_outstanding,
            method="cash", payment_date=timezone.localdate(), user=self.admin,
        )
        rows = get_ar_aging_rows()
        self.assertNotIn(invoice.id, {r["invoice_id"] for r in rows})

    def test_view_requires_admin(self):
        product = self.make_stocked_product(stock=20)
        self.make_confirmed_invoice(product, quantity=1)

        normal = make_normal_user()
        request = self.factory.get("/api/accounting/ar-aging/")
        force_authenticate(request, user=normal)
        response = ARAgingListView.as_view()(request)
        self.assertEqual(response.status_code, 403)

        request = self.factory.get("/api/accounting/ar-aging/")
        force_authenticate(request, user=self.admin)
        response = ARAgingListView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_query_count_is_bounded(self):
        product = self.make_stocked_product(stock=50)
        for _ in range(5):
            self.make_confirmed_invoice(product, quantity=1)

        request = self.factory.get("/api/accounting/ar-aging/")
        force_authenticate(request, user=self.admin)
        with CaptureQueriesContext(connection) as ctx:
            response = ARAgingListView.as_view()(request)
            response.render()
        self.assertEqual(response.status_code, 200)
        # One count-ish query from the paginator's list() + one row query
        # (select_related pulls customer in the same query) — no N+1.
        self.assertLessEqual(len(ctx.captured_queries), 3)


# ---------------------------------------------------------------------------
# A/P Aging
# ---------------------------------------------------------------------------

class APAgingTests(AccountingTestBase):
    def test_outstanding_purchase_order_appears(self):
        # make_stocked_product itself confirms a purchase order (to stock
        # inventory) that's left unpaid, so it's a second outstanding order
        # alongside the one this test creates directly — both are real.
        product = self.make_stocked_product(stock=20)
        order = self.make_confirmed_purchase_order(product, quantity=2)

        rows = get_ap_aging_rows()
        by_id = {r["order_id"]: r for r in rows}
        self.assertIn(order.id, by_id)
        self.assertEqual(by_id[order.id]["outstanding"], order.payable_outstanding)
        self.assertEqual(by_id[order.id]["bucket"], "current")

        summary = get_ap_aging_summary(rows)
        self.assertEqual(summary["order_count"], 2)
        self.assertEqual(
            summary["grand_total"],
            sum((r["outstanding"] for r in rows), Decimal("0")),
        )

    def test_fully_paid_order_excluded(self):
        product = self.make_stocked_product(stock=20)
        order = self.make_confirmed_purchase_order(product, quantity=2)
        from purchases.services import create_supplier_payment
        create_supplier_payment(
            order_id=order.id, amount=order.payable_outstanding,
            method="cash", payment_date=timezone.localdate(), user=self.admin,
        )
        rows = get_ap_aging_rows()
        self.assertNotIn(order.id, {r["order_id"] for r in rows})

    def test_view_requires_admin(self):
        normal = make_normal_user()
        request = self.factory.get("/api/accounting/ap-aging/")
        force_authenticate(request, user=normal)
        response = APAgingListView.as_view()(request)
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Fixed Asset Register
# ---------------------------------------------------------------------------

class FixedAssetRegisterTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = make_admin()
        self.category = create_asset_category(
            name="Machinery", valuation_method="depreciation",
            depreciation_rate=Decimal("0.12"), user=self.admin,
        )
        self.asset = create_asset(
            name="Generator", category_id=self.category.id, acquisition_type="existing",
            cost=Decimal("1200"), acquisition_date=date.today(), user=self.admin,
        )

    def test_register_row_matches_stored_worth(self):
        rows = get_fixed_asset_register_rows()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.asset.refresh_from_db()
        self.assertEqual(row["cost"], Decimal("1200"))
        self.assertEqual(row["net_book_value"], self.asset.current_worth)
        self.assertEqual(row["accumulated_depreciation"], Decimal("1200") - self.asset.current_worth)
        self.assertFalse(row["is_disposed"])

    def test_summary_totals(self):
        summary = get_fixed_asset_register_summary()
        self.assertEqual(summary["asset_count"], 1)
        self.assertEqual(summary["total_cost"], Decimal("1200"))

    def test_view_requires_admin(self):
        normal = make_normal_user()
        request = self.factory.get("/api/accounting/fixed-asset-register/")
        force_authenticate(request, user=normal)
        response = FixedAssetRegisterListView.as_view()(request)
        self.assertEqual(response.status_code, 403)

        request = self.factory.get("/api/accounting/fixed-asset-register/")
        force_authenticate(request, user=self.admin)
        response = FixedAssetRegisterListView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)


# ---------------------------------------------------------------------------
# Cash Flow Statement
# ---------------------------------------------------------------------------

class CashFlowStatementTests(AccountingTestBase):
    def test_classifies_operating_activities_and_nets_correctly(self):
        product = self.make_stocked_product(stock=20)
        invoice = self.make_confirmed_invoice(product, quantity=1)
        today = timezone.localdate()

        create_payment(
            invoice_id=invoice.id, amount=invoice.credit_outstanding,
            method="cash", payment_date=today, user=self.admin,
        )
        cat = create_expense_category(name="Utilities", user=self.admin)
        create_expense(
            name="Electricity", category_id=cat.id, amount=Decimal("50"),
            expense_date=today, user=self.admin,
        )

        result = get_cash_flow_statement(
            date_from=today.replace(day=1).isoformat(), date_to=today.isoformat(),
        )
        operating_labels = {line["label"] for line in result["operating"]["lines"]}
        self.assertIn("Invoice Payments Received", operating_labels)
        self.assertIn("Expenses Paid", operating_labels)
        self.assertEqual(
            result["operating"]["net"],
            invoice.credit_outstanding - Decimal("50"),
        )
        self.assertEqual(result["investing"]["lines"], [])
        self.assertEqual(result["financing"]["lines"], [])
        self.assertEqual(result["net_change_in_cash"], result["operating"]["net"])

    def test_opening_closing_only_present_when_range_ends_today(self):
        today = timezone.localdate()
        result_today = get_cash_flow_statement(
            date_from=today.isoformat(), date_to=today.isoformat(),
        )
        self.assertIsNotNone(result_today["closing_cash"])
        self.assertIsNotNone(result_today["opening_cash"])

        past_day = (today - timedelta(days=10)).isoformat()
        result_past = get_cash_flow_statement(date_from=past_day, date_to=past_day)
        self.assertIsNone(result_past["closing_cash"])
        self.assertIsNone(result_past["opening_cash"])

    def test_view_requires_admin(self):
        normal = make_normal_user()
        request = self.factory.get("/api/accounting/cash-flow-statement/")
        force_authenticate(request, user=normal)
        response = CashFlowStatementView.as_view()(request)
        self.assertEqual(response.status_code, 403)

        request = self.factory.get("/api/accounting/cash-flow-statement/")
        force_authenticate(request, user=self.admin)
        response = CashFlowStatementView.as_view()(request)
        self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Income Statement
# ---------------------------------------------------------------------------

class IncomeStatementTests(AccountingTestBase):
    def _finalize_last_month(self):
        product = self.make_stocked_product(stock=20, unit_cost="50", selling_price="100")
        invoice = self.make_confirmed_invoice(product, quantity=4)

        today = timezone.localdate()
        y, m = _add_months(today.year, today.month, -1)
        period = f"{y:04d}-{m:02d}"
        from billing.models import Invoice
        Invoice.objects.filter(pk=invoice.pk).update(
            confirmed_at=timezone.now().replace(year=y, month=m, day=15),
        )

        cat = create_expense_category(name="Rent", user=self.admin)
        create_expense(
            name="Shop Rent", category_id=cat.id, amount=Decimal("30"),
            expense_date=date(y, m, 20), user=self.admin,
        )

        catch_up_monthly_profits(user=self.admin)
        return period

    def test_finished_period_matches_monthly_profit_and_includes_breakdown(self):
        period = self._finalize_last_month()
        from profits.models import MonthlyProfit
        mp = MonthlyProfit.objects.get(period=period)

        data = get_income_statement(period=period)
        self.assertFalse(data["is_provisional"])
        self.assertEqual(data["net_profit"], mp.net_profit)
        self.assertEqual(data["gross_profit"], mp.gross_profit)
        categories = {line["category"] for line in data["expense_breakdown"]}
        self.assertIn("Rent", categories)

    def test_current_month_is_provisional(self):
        data = get_income_statement()
        self.assertTrue(data["is_provisional"])

    def test_view_404_for_unfinalized_period(self):
        request = self.factory.get("/api/accounting/income-statement/", {"period": "2020-01"})
        force_authenticate(request, user=self.admin)
        response = IncomeStatementView.as_view()(request)
        self.assertEqual(response.status_code, 404)

    def test_view_requires_admin(self):
        normal = make_normal_user()
        request = self.factory.get("/api/accounting/income-statement/")
        force_authenticate(request, user=normal)
        response = IncomeStatementView.as_view()(request)
        self.assertEqual(response.status_code, 403)

    def _pay_recurring_expense(self, *, period, category_name, amount, payment_date):
        """Creates a template + assignment + payment for `period` so the month
        has a RecurringExpenseAssignmentPayment row to (not) show up in the
        breakdown."""
        from recurring_expenses.services import (
            create_recurring_expense, create_recurring_expense_assignment,
            create_recurring_expense_category, create_recurring_expense_payment,
        )

        cat = create_recurring_expense_category(name=category_name, user=self.admin)
        template = create_recurring_expense(
            name=f"{category_name} Bill", category_id=cat.id, amount=Decimal(amount),
            start_date=payment_date, user=self.admin,
        )
        assignment = create_recurring_expense_assignment(
            recurring_expense_id=template.id, period=period, user=self.admin,
        )
        create_recurring_expense_payment(
            assignment_id=assignment.id, amount=Decimal(amount),
            payment_date=payment_date, user=self.admin,
        )

    def test_expense_breakdown_excludes_recurring_and_foots_to_expenses_paid(self):
        """
        Regression: the breakdown used to concatenate recurring-expense
        categories too, while the Income Statement ALSO renders a separate
        "Recurring Expenses" total line — so recurring expenses appeared
        twice in the visible lines and the section's own lines no longer
        added up to its own "Total Operating Expenses" subtotal (overstated
        by exactly recurring_expenses_paid). The breakdown must decompose
        expenses_paid and nothing else.
        """
        product = self.make_stocked_product(stock=20, unit_cost="50", selling_price="100")
        invoice = self.make_confirmed_invoice(product, quantity=4)

        today = timezone.localdate()
        y, m = _add_months(today.year, today.month, -1)
        period = f"{y:04d}-{m:02d}"
        from billing.models import Invoice
        Invoice.objects.filter(pk=invoice.pk).update(
            confirmed_at=timezone.now().replace(year=y, month=m, day=15),
        )

        # A one-off expense and a recurring payment sharing the SAME category
        # name — the exact collision that produced two identical-looking rows.
        cat = create_expense_category(name="Utilities", user=self.admin)
        create_expense(
            name="Electricity Top-Up", category_id=cat.id, amount=Decimal("40"),
            expense_date=date(y, m, 20), user=self.admin,
        )
        self._pay_recurring_expense(
            period=period, category_name="Utilities", amount="25",
            payment_date=date(y, m, 21),
        )

        catch_up_monthly_profits(user=self.admin)
        data = get_income_statement(period=period)

        # Both figures are genuinely non-zero, so this test can actually fail.
        self.assertEqual(Decimal(data["expenses_paid"]), Decimal("40"))
        self.assertEqual(Decimal(data["recurring_expenses_paid"]), Decimal("25"))

        breakdown = data["expense_breakdown"]
        self.assertEqual(
            sum(Decimal(line["amount"]) for line in breakdown),
            Decimal(data["expenses_paid"]),
            "expense_breakdown must sum to expenses_paid exactly — no recurring rows.",
        )
        # "Utilities" must appear exactly once (the one-off), not twice.
        utilities_rows = [b for b in breakdown if b["category"] == "Utilities"]
        self.assertEqual(len(utilities_rows), 1)
        self.assertEqual(Decimal(utilities_rows[0]["amount"]), Decimal("40"))

    def test_print_operating_expense_lines_foot_to_their_subtotal(self):
        """
        Guards the PDF itself, not just the selector — the print view builds
        its sections independently of the API view and is what an accountant
        actually reads. Every non-bold line in Operating Expenses must add up
        to the bold "Total Operating Expenses" line.
        """
        from .views import IncomeStatementPrintView

        product = self.make_stocked_product(stock=20, unit_cost="50", selling_price="100")
        invoice = self.make_confirmed_invoice(product, quantity=4)
        today = timezone.localdate()
        y, m = _add_months(today.year, today.month, -1)
        period = f"{y:04d}-{m:02d}"
        from billing.models import Invoice
        Invoice.objects.filter(pk=invoice.pk).update(
            confirmed_at=timezone.now().replace(year=y, month=m, day=15),
        )
        cat = create_expense_category(name="Utilities", user=self.admin)
        create_expense(
            name="Electricity Top-Up", category_id=cat.id, amount=Decimal("40"),
            expense_date=date(y, m, 20), user=self.admin,
        )
        self._pay_recurring_expense(
            period=period, category_name="Utilities", amount="25",
            payment_date=date(y, m, 21),
        )
        catch_up_monthly_profits(user=self.admin)

        captured = {}
        original = IncomeStatementPrintView._build_sections

        def _capture(self_view, data):
            sections = original(self_view, data)
            captured["sections"] = sections
            return sections

        IncomeStatementPrintView._build_sections = _capture
        try:
            request = self.factory.get(
                "/api/accounting/income-statement/print/", {"period": period},
            )
            force_authenticate(request, user=self.admin)
            response = IncomeStatementPrintView.as_view()(request)
            self.assertEqual(response.status_code, 200)
        finally:
            IncomeStatementPrintView._build_sections = original

        opex = next(s for s in captured["sections"] if s["heading"] == "Operating Expenses")
        line_total = sum(
            Decimal(line["amount"]) for line in opex["lines"] if not line.get("bold")
        )
        subtotal = next(
            Decimal(line["amount"]) for line in opex["lines"]
            if line.get("bold") and line["label"] == "Total Operating Expenses"
        )
        self.assertEqual(
            line_total, subtotal,
            "Printed Operating Expenses lines must add up to their own subtotal.",
        )


# ---------------------------------------------------------------------------
# Balance Sheet
# ---------------------------------------------------------------------------

class BalanceSheetTests(AccountingTestBase):
    def test_live_balance_sheet_balances(self):
        product = self.make_stocked_product(stock=20, unit_cost="50", selling_price="100")
        self.make_confirmed_invoice(product, quantity=2)

        data = get_balance_sheet_live()
        self.assertEqual(
            data["assets"]["total"] - data["liabilities"]["total"] - data["equity"]["total"],
            data["balance_check"],
        )
        self.assertTrue(data["is_balanced"], msg=f"balance_check={data['balance_check']}")

    def test_balances_with_data_entry_bootstrap_data(self):
        """
        Regression test for a real Rs 1000 mismatch traced back to exactly
        this gap: customer/supplier opening balances and opening stock each
        create one side of a transaction (an asset or liability) with no
        natural double-entry counterpart, so without opening_balance_equity
        the balance sheet would never balance for a business that used the
        Data Entry app to bootstrap pre-existing debts/stock at go-live.
        """
        customer = create_customer(name="Old Customer", code="OLDC", address="X", user=self.admin)
        create_customer_opening_balance(customer_id=customer.id, amount=Decimal("5000"), user=self.admin)

        supplier2 = create_supplier(name="Old Supplier", code="OLDS", user=self.admin)
        create_supplier_opening_balance(supplier_id=supplier2.id, amount=Decimal("8000"), user=self.admin)

        product = Product.objects.create(name="Legacy Stock", code="LEGACY", category=self.category)
        system_supplier = create_supplier(name="System", code="SYS", user=self.admin)
        create_opening_stock_order(
            supplier=system_supplier,
            items=[{"product_id": product.id, "quantity": 10, "unit_price": Decimal("300"), "shelf_id": self.shelf.id}],
            user=self.admin,
        )

        data = get_balance_sheet_live()
        # +5000 (customer OB) +3000 (10*300 opening stock) -8000 (supplier OB) = 0
        self.assertEqual(data["equity"]["opening_balance_equity"], Decimal("0"))
        self.assertTrue(data["is_balanced"], msg=f"balance_check={data['balance_check']}")

    def test_balances_with_opening_cash(self):
        """Opening Cash (data_entry Feature 3) is a cash asset with nothing
        offsetting it — must be added to opening_balance_equity, same
        reasoning as customer opening balances."""
        create_opening_cash(amount=Decimal("2000"), user=self.admin)

        data = get_balance_sheet_live()
        self.assertEqual(data["equity"]["opening_balance_equity"], Decimal("2000"))
        self.assertTrue(data["is_balanced"], msg=f"balance_check={data['balance_check']}")

    def test_balances_with_opening_investor_investment(self):
        """
        Opening Investor Investment (data_entry Feature 5) is the OPPOSITE
        direction from the other four: it inflates CashManagementFlow.
        net_investor_capital (this Balance Sheet's equity.investor_capital)
        with NO cash asset behind it, by design — cash_management.services.
        create_investor_transaction's is_data_entry branch deliberately
        skips the cash_in_hand sync ("the cash isn't actually sitting in
        the till"). Without subtracting it, equity would exceed assets.
        """
        investor = create_investor(name="Old Investor", growth_rate=Decimal("0"), user=self.admin)
        create_opening_investor_investment(investor_id=investor.id, amount=Decimal("3000"), user=self.admin)

        data = get_balance_sheet_live()
        self.assertEqual(data["equity"]["investor_capital"], Decimal("3000"))
        self.assertEqual(data["equity"]["opening_balance_equity"], Decimal("-3000"))
        self.assertTrue(data["is_balanced"], msg=f"balance_check={data['balance_check']}")

    def test_opening_balance_equity_never_imports_data_entry(self):
        """
        The data_entry app is meant to be removed after go-live — if
        accounting.selectors ever imports FROM data_entry.models again,
        the entire Balance Sheet breaks the moment that happens. Checks for
        an actual import statement, not the bare word (which legitimately
        appears in comments explaining WHY it's avoided).
        """
        import inspect
        from . import selectors as accounting_selectors

        source = inspect.getsource(accounting_selectors)
        for line in source.splitlines():
            stripped = line.strip()
            if stripped.startswith("from data_entry") or stripped.startswith("import data_entry"):
                self.fail(f"accounting/selectors.py imports data_entry: {stripped!r}")

    def test_live_view_query_count_is_small_and_fixed(self):
        """
        Per architecture.md's STRICT 200ms rule and verification.md rule 6 —
        must be counted, not eyeballed. ~21 queries is the honest number for
        this endpoint: 1 to ensure CashFlow's singleton row exists (see
        get_balance_sheet_live's CashFlow.get_instance() comment), 1
        subquery-joined singleton read, 2 for inventory valuation, ~12 from
        reusing profits.get_current_month_net_profit_only() (each of ITS
        `_compute_*` helpers is one small bounded aggregate scoped to the
        current month only), and 5 from _compute_opening_balance_equity
        (one bounded aggregate per data_entry bootstrap path — customer OB,
        opening stock, supplier OB, opening cash, opening investor
        investment). None are N+1 or proportional to total data size,
        verified by inspecting each source directly. Bound set generously
        above that so this test catches a REAL regression (e.g. an
        accidental N+1) rather than false-alarming on normal variance — if
        this ever creeps past ~30, that's worth investigating, not silently
        raising the bound further.
        """
        product = self.make_stocked_product(stock=20)
        self.make_confirmed_invoice(product, quantity=1)

        request = self.factory.get("/api/accounting/balance-sheet/")
        force_authenticate(request, user=self.admin)
        with CaptureQueriesContext(connection) as ctx:
            response = BalanceSheetView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(
            len(ctx.captured_queries), 30,
            msg=f"{len(ctx.captured_queries)} queries — investigate before shipping:\n"
                + "\n".join(q["sql"][:120] for q in ctx.captured_queries),
        )

    def test_catch_up_snapshots_only_most_recent_finished_month(self):
        product = self.make_stocked_product(stock=20)
        invoice = self.make_confirmed_invoice(product, quantity=1)
        today = timezone.localdate()
        y, m = _add_months(today.year, today.month, -1)
        period = f"{y:04d}-{m:02d}"
        from billing.models import Invoice
        Invoice.objects.filter(pk=invoice.pk).update(
            confirmed_at=timezone.now().replace(year=y, month=m, day=15),
        )
        catch_up_monthly_profits(user=self.admin)

        created = catch_up_balance_sheet_snapshots()
        self.assertEqual(created, 1)
        self.assertTrue(BalanceSheetSnapshot.objects.filter(period=period).exists())

        # Idempotent — calling again creates nothing new.
        self.assertEqual(catch_up_balance_sheet_snapshots(), 0)
        self.assertEqual(BalanceSheetSnapshot.objects.count(), 1)

        snap = BalanceSheetSnapshot.objects.get(period=period)
        self.assertEqual(snap.total_assets - snap.total_liabilities - snap.total_equity,
                          snap.total_assets - (snap.total_liabilities + snap.total_equity))

        # get_balance_sheet_for_period reads it back without recomputing.
        via_selector = get_balance_sheet_for_period(period)
        self.assertEqual(via_selector["assets"]["total"], snap.total_assets)

    def test_period_without_snapshot_raises(self):
        with self.assertRaises(BalanceSheetSnapshot.DoesNotExist):
            get_balance_sheet_for_period("2020-01")

    # ---- Snapshot freshness (lag_days) --------------------------------------
    # A snapshot copies all-time singletons and stamps last month's label on
    # them, so a LATE one silently contains the following month's activity and
    # is frozen that way forever. These guard that the lag is surfaced.

    def _make_snapshot_taken_on(self, *, period, taken_on):
        """Freezes a snapshot for `period`, then forces computed_at to
        `taken_on` local time. computed_at is auto_now_add, so it has to be
        overwritten with .update() (which bypasses auto_now_add) rather than
        set on create."""
        from datetime import datetime, time as time_cls

        snap = BalanceSheetSnapshot.objects.create(period=period)
        aware = timezone.make_aware(
            datetime.combine(taken_on, time_cls(12, 0)),
            timezone.get_current_timezone(),
        )
        BalanceSheetSnapshot.objects.filter(pk=snap.pk).update(computed_at=aware)
        return snap

    def test_lag_days_is_small_when_snapshot_taken_promptly(self):
        # July 2026 ends the 31st; frozen Aug 1 => 1 day late, not stale.
        self._make_snapshot_taken_on(period="2026-07", taken_on=date(2026, 8, 1))
        freshness = get_balance_sheet_for_period("2026-07")["freshness"]

        self.assertTrue(freshness["is_snapshot"])
        self.assertEqual(freshness["lag_days"], 1)
        self.assertEqual(freshness["snapshot_taken_on"], date(2026, 8, 1))
        self.assertFalse(freshness["is_stale"])

    def test_lag_days_flags_a_late_snapshot_as_stale(self):
        # Frozen Aug 20 for July => 20 days of August bled into "July".
        self._make_snapshot_taken_on(period="2026-07", taken_on=date(2026, 8, 20))
        freshness = get_balance_sheet_for_period("2026-07")["freshness"]

        self.assertEqual(freshness["lag_days"], 20)
        self.assertTrue(freshness["is_stale"])

    def test_live_sheet_reports_no_snapshot_lag(self):
        """The live sheet reads the singletons directly, so lag is meaningless
        — it must report is_snapshot=False rather than a misleading 0."""
        freshness = get_balance_sheet_live()["freshness"]

        self.assertFalse(freshness["is_snapshot"])
        self.assertIsNone(freshness["lag_days"])
        self.assertIsNone(freshness["snapshot_taken_on"])
        self.assertFalse(freshness["is_stale"])

    def test_view_exposes_freshness(self):
        self._make_snapshot_taken_on(period="2026-07", taken_on=date(2026, 8, 20))
        request = self.factory.get("/api/accounting/balance-sheet/", {"period": "2026-07"})
        force_authenticate(request, user=self.admin)
        response = BalanceSheetView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["freshness"]["lag_days"], 20)
        self.assertTrue(response.data["freshness"]["is_stale"])

    def test_print_pdf_carries_the_stale_warning(self):
        """A printed PDF outlives the screen it came from, so the caveat has
        to travel with it — not just live on the page."""
        from .views import BalanceSheetPrintView

        self._make_snapshot_taken_on(period="2026-07", taken_on=date(2026, 8, 20))

        captured = {}
        import accounting.views as accounting_views
        original = accounting_views.generate_statement_pdf_bytes

        def _capture(**kwargs):
            captured.update(kwargs)
            return original(**kwargs)

        accounting_views.generate_statement_pdf_bytes = _capture
        try:
            request = self.factory.get(
                "/api/accounting/balance-sheet/print/", {"period": "2026-07"},
            )
            force_authenticate(request, user=self.admin)
            response = BalanceSheetPrintView.as_view()(request)
            self.assertEqual(response.status_code, 200)
        finally:
            accounting_views.generate_statement_pdf_bytes = original

        self.assertIn("WARNING", captured["filter_description"])
        self.assertIn("20 days", captured["filter_description"])

    def test_view_requires_admin(self):
        normal = make_normal_user()
        request = self.factory.get("/api/accounting/balance-sheet/")
        force_authenticate(request, user=normal)
        response = BalanceSheetView.as_view()(request)
        self.assertEqual(response.status_code, 403)

        request = self.factory.get("/api/accounting/balance-sheet/")
        force_authenticate(request, user=self.admin)
        response = BalanceSheetView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertIn("is_balanced", response.data)

    def test_view_404_for_period_without_snapshot(self):
        request = self.factory.get("/api/accounting/balance-sheet/", {"period": "2020-01"})
        force_authenticate(request, user=self.admin)
        response = BalanceSheetView.as_view()(request)
        self.assertEqual(response.status_code, 404)
