from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from assets.services import create_asset, create_asset_category
from billing.services import (
    confirm_invoice, create_customer, create_invoice,
    set_invoice_item_shelf_allocations, update_invoice_due_date,
)
from purchases.models import Category, Product, Shelf
from purchases.services import (
    confirm_purchase_order, create_purchase_order, create_supplier,
    set_purchase_item_shelf_allocations,
)
from rates.services import create_rate
from users.models import User

from .selectors import (
    get_ap_aging_rows, get_ap_aging_summary, get_ar_aging_rows,
    get_ar_aging_summary, get_fixed_asset_register_rows,
    get_fixed_asset_register_summary,
)
from .views import (
    APAgingListView, ARAgingListView, FixedAssetRegisterListView,
)


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
