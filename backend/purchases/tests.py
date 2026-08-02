from decimal import Decimal

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from users.models import User

from .models import (
    LOW_STOCK_THRESHOLD, Category, Inventory, InventoryStatsFlow, Product,
    PurchaseOrder, Shelf, Supplier,
)
from .services import (
    confirm_purchase_order, create_lost_inventory_record, create_purchase_order,
    create_supplier, delete_product, mark_lost_inventory_found, sync_inventory,
)
from .views import (
    DraftPurchaseOrderListView, InventoryListView, InventoryStatsView,
    LowStockInventoryListView, OutOfStockInventoryListView,
    PurchaseOrderListCreateView,
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


class PurchasesTestBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = make_admin()
        self.category = Category.objects.create(name="Cat A")
        self.shelf = Shelf.objects.create(name="Shelf A")
        # Through the service so the supplier ledger exists for confirm flows.
        self.supplier = create_supplier(name="Ali Traders", code="ALI", user=self.admin)

    def make_product(self, code="P001", name="Product 1"):
        return Product.objects.create(
            name=name, code=code, category=self.category, shelf=self.shelf,
        )

    def make_order(self, product, quantity=10, unit_price="100"):
        return create_purchase_order(
            supplier_id=self.supplier.id,
            items=[{"product_id": product.id, "quantity": quantity, "unit_price": Decimal(unit_price)}],
            user=self.admin,
        )

    def make_confirmed_order(self, product, quantity=10, unit_price="100"):
        order = self.make_order(product, quantity=quantity, unit_price=unit_price)
        return confirm_purchase_order(order_id=order.id, user=self.admin)

    def get(self, view, url, user=None, **params):
        request = self.factory.get(url, params)
        if user is not None:
            force_authenticate(request, user=user)
        return view(request)


class ReferenceCounterTests(PurchasesTestBase):
    def test_sequential_numbering_and_format(self):
        product = self.make_product()
        year = timezone.now().year
        o1 = self.make_order(product)
        o2 = self.make_order(product)
        self.assertEqual(o1.order_number, f"PO-{year}-0001")
        self.assertEqual(o2.order_number, f"PO-{year}-0002")

    def test_seeds_numerically_from_legacy_references_past_9999(self):
        # Old generator sorted references as TEXT, so '9999' > '10000' and
        # numbering broke permanently at 10000. The counter must seed from
        # the numeric max instead.
        year = timezone.now().year
        PurchaseOrder.objects.create(order_number=f"PO-{year}-9999", supplier=self.supplier)
        PurchaseOrder.objects.create(order_number=f"PO-{year}-10000", supplier=self.supplier)

        product = self.make_product()
        order = self.make_order(product)
        self.assertEqual(order.order_number, f"PO-{year}-10001")


class InventoryStatsFlowTests(PurchasesTestBase):
    def stats(self):
        return InventoryStatsFlow.get_instance()

    def test_confirm_purchase_creates_and_buckets_inventory(self):
        product = self.make_product()
        self.make_confirmed_order(product, quantity=10)
        flow = self.stats()
        self.assertEqual(flow.total_products, 1)
        self.assertEqual(flow.low_stock_count, 0)
        self.assertEqual(flow.out_of_stock_count, 0)

    def test_threshold_crossings_move_between_buckets(self):
        product = self.make_product()
        self.make_confirmed_order(product, quantity=10)

        # 10 → 4 : enters low stock
        create_lost_inventory_record(
            items=[{"product_id": product.id, "quantity": 6}], user=self.admin,
        )
        flow = self.stats()
        self.assertEqual((flow.low_stock_count, flow.out_of_stock_count), (1, 0))

        # 4 → 0 : leaves low, enters out of stock
        record = create_lost_inventory_record(
            items=[{"product_id": product.id, "quantity": 4}], user=self.admin,
        )
        flow = self.stats()
        self.assertEqual((flow.low_stock_count, flow.out_of_stock_count), (0, 1))

        # 0 → 2 : found again, back to low stock
        lost_item = record.items.first()
        mark_lost_inventory_found(lost_item_id=lost_item.id, quantity=2, user=self.admin)
        flow = self.stats()
        self.assertEqual((flow.low_stock_count, flow.out_of_stock_count), (1, 0))

    def test_product_soft_delete_leaves_stats(self):
        product = self.make_product()
        self.make_confirmed_order(product, quantity=3)  # low stock
        delete_product(pk=product.id, user=self.admin)
        flow = self.stats()
        self.assertEqual(flow.total_products, 0)
        self.assertEqual(flow.low_stock_count, 0)
        self.assertEqual(flow.out_of_stock_count, 0)

    def test_shared_writer_used_directly_matches_billing_paths(self):
        # billing calls sync_inventory with user=None (return path) and a
        # user (confirm path) — both must maintain the counters.
        product = self.make_product()
        sync_inventory(product=product, quantity_delta=4, user=None)
        flow = self.stats()
        self.assertEqual((flow.total_products, flow.low_stock_count), (1, 1))
        sync_inventory(product=product, quantity_delta=-4, user=self.admin)
        flow = self.stats()
        self.assertEqual((flow.low_stock_count, flow.out_of_stock_count), (0, 1))

    def test_backfill_is_idempotent_and_matches_live_data(self):
        p1 = self.make_product("P001")
        p2 = self.make_product("P002", "Product 2")
        self.make_confirmed_order(p1, quantity=3)   # low
        self.make_confirmed_order(p2, quantity=20)  # ok

        # Corrupt the singleton, then rebuild twice.
        InventoryStatsFlow.get_instance()
        InventoryStatsFlow.objects.filter(pk=1).update(
            total_products=99, low_stock_count=99, out_of_stock_count=99,
        )
        call_command("backfill_inventory_stats")
        first = self.stats()
        self.assertEqual(
            (first.total_products, first.low_stock_count, first.out_of_stock_count),
            (2, 1, 0),
        )
        call_command("backfill_inventory_stats")
        second = self.stats()
        self.assertEqual(
            (second.total_products, second.low_stock_count, second.out_of_stock_count),
            (2, 1, 0),
        )


class InventoryEndpointTests(PurchasesTestBase):
    def setUp(self):
        super().setUp()
        self.normal = make_normal_user()
        p_ok  = self.make_product("P-OK", "Plenty")
        p_low = self.make_product("P-LOW", "Scarce")
        p_out = self.make_product("P-OUT", "Gone")
        sync_inventory(product=p_ok, quantity_delta=20, user=self.admin)
        sync_inventory(product=p_low, quantity_delta=LOW_STOCK_THRESHOLD, user=self.admin)
        Inventory.objects.get_or_create(product=p_out)  # row exists at 0
        # p_out was created outside the writer → rebuild counts, which is
        # exactly what backfill exists for.
        call_command("backfill_inventory_stats")

    def test_stats_endpoint_returns_singleton_counts(self):
        response = self.get(InventoryStatsView.as_view(), "/purchases/inventory/stats/", user=self.normal)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_products"], 3)
        self.assertEqual(response.data["low_stock_count"], 1)
        self.assertEqual(response.data["out_of_stock_count"], 1)

    def test_stats_endpoint_requires_authentication(self):
        response = self.get(InventoryStatsView.as_view(), "/purchases/inventory/stats/")
        self.assertEqual(response.status_code, 401)

    def test_breakdown_endpoints_return_correct_products(self):
        low = self.get(LowStockInventoryListView.as_view(), "/purchases/inventory/low-stock/", user=self.normal)
        self.assertEqual(low.status_code, 200)
        self.assertEqual([r["product"]["code"] for r in low.data["results"]], ["P-LOW"])

        out = self.get(OutOfStockInventoryListView.as_view(), "/purchases/inventory/out-of-stock/", user=self.normal)
        self.assertEqual(out.status_code, 200)
        self.assertEqual([r["product"]["code"] for r in out.data["results"]], ["P-OUT"])

    def test_inventory_list_no_longer_embeds_stats(self):
        response = self.get(InventoryListView.as_view(), "/purchases/inventory/", user=self.normal)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("stats", response.data)
        self.assertEqual(response.data["count"], 3)


class QueryCountStabilityTests(PurchasesTestBase):
    """Guards against N+1: query count must not grow with row count."""

    def count_queries(self, view, url):
        request = self.factory.get(url)
        force_authenticate(request, user=self.admin)
        with CaptureQueriesContext(connection) as ctx:
            response = view(request)
            response.render()
        self.assertEqual(response.status_code, 200)
        return len(ctx.captured_queries)

    def test_order_list_query_count_is_flat(self):
        view = PurchaseOrderListCreateView.as_view()
        p1 = self.make_product("P001")
        self.make_confirmed_order(p1, quantity=10)
        baseline = self.count_queries(view, "/purchases/orders/")

        for i in range(4):
            p = self.make_product(f"P10{i}", f"Product 10{i}")
            self.make_confirmed_order(p, quantity=10)
        grown = self.count_queries(view, "/purchases/orders/")
        self.assertEqual(baseline, grown)

    def test_draft_list_with_preview_query_count_is_flat(self):
        view = DraftPurchaseOrderListView.as_view()
        p1 = self.make_product("P001")
        self.make_order(p1)
        baseline = self.count_queries(view, "/purchases/orders/drafts/")

        for i in range(4):
            p = self.make_product(f"P20{i}", f"Product 20{i}")
            self.make_order(p)
        grown = self.count_queries(view, "/purchases/orders/drafts/")
        self.assertEqual(baseline, grown)

    def test_inventory_list_query_count_is_flat(self):
        view = InventoryListView.as_view()
        p1 = self.make_product("P001")
        sync_inventory(product=p1, quantity_delta=5, user=self.admin)
        baseline = self.count_queries(view, "/purchases/inventory/")

        for i in range(4):
            p = self.make_product(f"P30{i}", f"Product 30{i}")
            sync_inventory(product=p, quantity_delta=5, user=self.admin)
        grown = self.count_queries(view, "/purchases/inventory/")
        self.assertEqual(baseline, grown)


class OrderDateFilterTests(PurchasesTestBase):
    def setUp(self):
        super().setUp()
        product = self.make_product()
        self.o_old = self.make_order(product)
        p2 = self.make_product("P002", "Product 2")
        self.o_new = self.make_order(p2)
        # Backdate the first order (created_at is auto_now_add, so set via update).
        PurchaseOrder.objects.filter(pk=self.o_old.pk).update(
            created_at=timezone.now() - timezone.timedelta(days=10),
        )

    def order_numbers(self, **params):
        response = self.get(
            PurchaseOrderListCreateView.as_view(), "/purchases/orders/",
            user=self.admin, **params,
        )
        self.assertEqual(response.status_code, 200)
        return {r["order_number"] for r in response.data["results"]}

    def test_date_from_filter(self):
        today = timezone.localtime(timezone.now()).date().isoformat()
        self.assertEqual(self.order_numbers(date_from=today), {self.o_new.order_number})

    def test_date_to_filter(self):
        cutoff = (timezone.localtime(timezone.now()).date() - timezone.timedelta(days=5)).isoformat()
        self.assertEqual(self.order_numbers(date_to=cutoff), {self.o_old.order_number})

    def test_exact_date_filter(self):
        today = timezone.localtime(timezone.now()).date().isoformat()
        self.assertEqual(self.order_numbers(date=today), {self.o_new.order_number})
