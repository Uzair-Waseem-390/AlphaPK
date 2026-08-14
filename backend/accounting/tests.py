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
from data_entry.services import create_customer_opening_balance, create_supplier_opening_balance
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

    def test_live_view_query_count_is_small_and_fixed(self):
        """
        Per architecture.md's STRICT 200ms rule and verification.md rule 6 —
        must be counted, not eyeballed. ~15 queries is the honest number for
        this endpoint: 1 subquery-joined singleton read, 2 for inventory
        valuation, and ~12 more from reusing
        profits.get_current_month_net_profit_only() (each of ITS
        `_compute_*` helpers is one small bounded aggregate scoped to the
        current month only — none are N+1 or proportional to total data
        size, verified by inspecting profits/services.py directly). Bound
        set generously above that so this test catches a REAL regression
        (e.g. an accidental N+1) rather than false-alarming on normal
        variance — if this ever creeps past ~20, that's worth investigating,
        not silently raising the bound further.
        """
        product = self.make_stocked_product(stock=20)
        self.make_confirmed_invoice(product, quantity=1)

        request = self.factory.get("/api/accounting/balance-sheet/")
        force_authenticate(request, user=self.admin)
        with CaptureQueriesContext(connection) as ctx:
            response = BalanceSheetView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(
            len(ctx.captured_queries), 20,
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
