import uuid
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from billing.models import Invoice
from billing.services import create_customer
from cash_flow.models import CashFlow
from ledger.models import CustomerLedgerEntry
from purchases.models import Category, Inventory, Product, Shelf
from purchases.services import (
    confirm_purchase_order, create_purchase_order, create_supplier,
    set_purchase_item_shelf_allocations,
)
from rates.services import create_rate

from .models import PartnerRateAccess, PurchaseRequest
from .tests import PARTNER, PROVIDER_ON, SECRET, make_admin, make_normal_user, signed

PRODUCTS_PATH = "/api/b2b/partner/products/"
REQUESTS_PATH = "/api/b2b/partner/purchase-requests/"
DECISIONS_PATH = "/api/b2b/partner/purchase-requests/decisions/"
CUSTOMER_CODE = "ALFA-CUST"


def cancel_path(request_uuid):
    return f"/api/b2b/partner/purchase-requests/{request_uuid}/cancel/"


@override_settings(**PROVIDER_ON, B2B_PARTNER_CUSTOMER_CODES={PARTNER: CUSTOMER_CODE})
class PurchaseRequestBase(TestCase):
    def setUp(self):
        cache.clear()
        # Default: the partner answers its wake-up check. test_wake.py removes this stub to test the real gate.
        awake = patch("b2b.request_services.ensure_partner_awake")
        awake.start()
        self.addCleanup(awake.stop)
        self.client = APIClient()
        self.admin = make_admin()
        self.category = Category.objects.create(name="Cat A")
        self.shelf = Shelf.objects.create(name="Shelf A")
        self.shelf2 = Shelf.objects.create(name="Shelf B")
        self.supplier = create_supplier(name="Ali Traders", code="ALI", user=self.admin)
        self.customer = create_customer(name="Alfa Stationery", code=CUSTOMER_CODE, address="Lahore", user=self.admin)

    # -- data helpers ------------------------------------------------------
    def stocked_product(self, code="PEN-1", name="Blue Pen", *, stock=10, price="100", cost="50"):
        product = Product.objects.create(name=name, code=code, category=self.category)
        create_rate(product_id=product.id, selling_price=Decimal(price), user=self.admin)
        order = create_purchase_order(
            supplier_id=self.supplier.id,
            items=[{"product_id": product.id, "quantity": stock, "unit_price": Decimal(cost)}],
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

    def payload(self, items, request_uuid=None, note=""):
        return {
            "request_uuid": str(request_uuid or uuid.uuid4()),
            "note": note,
            "items": [
                {
                    "product_code": p.code, "product_name": p.name, "quantity": q,
                    "discount": str(d), "gst": str(g), "wht": str(w),
                }
                for (p, q, d, g, w) in items
            ],
        }

    def submit(self, data, **kw):
        import json
        body = json.dumps(data).encode()
        return self.client.post(
            REQUESTS_PATH, data=body, content_type="application/json",
            **signed("POST", REQUESTS_PATH, body=body, **kw),
        )

    def make_request(self, items=None, **kw):
        if items is None:
            items = [(self.stocked_product(), 5, 10, 18, 1)]
        response = self.submit(self.payload(items), **kw)
        self.assertEqual(response.status_code, 201, response.content)
        return PurchaseRequest.objects.get(request_uuid=response.json()["request_uuid"])

    def admin_client(self, user=None):
        c = APIClient()
        c.force_authenticate(user or self.admin)
        return c

    def accept_body(self, request, quantities, shelf=None):
        shelf = shelf or self.shelf
        return {"items": [
            {
                "id": item.id, "accepted_quantity": quantities[i],
                "shelf_allocations": [{"shelf_id": shelf.id, "quantity": quantities[i]}] if quantities[i] else [],
            }
            for i, item in enumerate(request.items.all())
        ]}

    def accept(self, request, quantities, shelf=None, client=None):
        return (client or self.admin_client()).post(
            f"/api/b2b/purchase-requests/{request.id}/accept/",
            self.accept_body(request, quantities, shelf), format="json",
        )


class ProductSearchTests(PurchaseRequestBase):
    def search(self, query=""):
        return self.client.get(
            PRODUCTS_PATH + (f"?{query}" if query else ""), **signed("GET", PRODUCTS_PATH, query),
        )

    def test_only_priced_non_deleted_products_and_never_any_quantity(self):
        self.stocked_product("P1", "Pen", stock=7)
        Product.objects.create(name="Unpriced", code="P2", category=self.category)
        gone = self.stocked_product("P3", "Gone")
        Product.objects.filter(pk=gone.pk).update(is_deleted=True)
        body = self.search().json()
        self.assertEqual([r["code"] for r in body["results"]], ["P1"])
        self.assertEqual(sorted(body["results"][0]), ["code", "name", "selling_price"])
        self.assertNotIn("7", str(body))      # nothing resembling the stock level leaks

    def test_price_is_hidden_until_the_rate_list_is_approved(self):
        self.stocked_product("P1", "Pen", price="12.5")
        body = self.search().json()
        self.assertFalse(body["rates_allowed"])
        self.assertIsNone(body["results"][0]["selling_price"])
        PartnerRateAccess.objects.create(partner_name=PARTNER, status="approved")
        body = self.search().json()
        self.assertTrue(body["rates_allowed"])
        self.assertEqual(body["results"][0]["selling_price"], "12.5000")

    def test_search_filters_and_unsigned_is_404(self):
        self.stocked_product("A-1", "Apple pad")
        self.stocked_product("B-2", "Banana")
        self.assertEqual([r["code"] for r in self.search("search=pad").json()["results"]], ["A-1"])
        self.assertEqual(self.client.get(PRODUCTS_PATH).status_code, 404)

    def test_query_count_is_fixed(self):
        for i in range(10):
            self.stocked_product(f"Q-{i}", f"Row {i}")
        with CaptureQueriesContext(connection) as ctx:
            self.search("page_size=10")
        self.assertLessEqual(len(ctx), 5, [q["sql"] for q in ctx])


class SubmitAndCancelTests(PurchaseRequestBase):
    def test_submit_is_repeat_safe(self):
        product = self.stocked_product()
        data = self.payload([(product, 3, 0, 0, 0)])
        self.assertEqual(self.submit(data).status_code, 201)
        self.assertEqual(self.submit(data).status_code, 200)
        self.assertEqual(PurchaseRequest.objects.count(), 1)
        self.assertEqual(PurchaseRequest.objects.get().items.count(), 1)

    def test_bad_products_are_rejected_with_reasons(self):
        product = self.stocked_product()
        unpriced = Product.objects.create(name="Unpriced", code="U1", category=self.category)
        data = self.payload([(product, 1, 0, 0, 0)])
        data["items"] += [
            {"product_code": "NOPE", "product_name": "x", "quantity": 1},
            {"product_code": unpriced.code, "product_name": unpriced.name, "quantity": 1},
            {"product_code": product.code, "product_name": "Wrong Name", "quantity": 1},
        ]
        response = self.submit(data)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(PurchaseRequest.objects.count(), 0)

    def test_name_match_ignores_case_and_extra_spaces(self):
        product = self.stocked_product(name="Blue  Pen")
        data = self.payload([(product, 1, 0, 0, 0)])
        data["items"][0]["product_name"] = "  blue pen "
        self.assertEqual(self.submit(data).status_code, 201)

    def test_duplicate_product_empty_and_too_many_items_are_400(self):
        product = self.stocked_product()
        self.assertEqual(self.submit(self.payload([(product, 1, 0, 0, 0), (product, 2, 0, 0, 0)])).status_code, 400)
        self.assertEqual(self.submit(self.payload([])).status_code, 400)
        many = self.payload([(product, 1, 0, 0, 0)])
        many["items"] = [dict(many["items"][0], product_code=f"C{i}") for i in range(101)]
        self.assertEqual(self.submit(many).status_code, 400)

    def test_cancel_pending_hides_it_from_the_admin_list_but_keeps_the_row(self):
        request = self.make_request()
        path = cancel_path(request.request_uuid)
        response = self.client.post(path, **signed("POST", path))
        self.assertEqual(response.json(), {"status": "cancelled"})
        self.assertEqual(self.admin_client().get("/api/b2b/purchase-requests/").json()["count"], 0)
        self.assertEqual(PurchaseRequest.objects.count(), 1)

    def test_cancel_after_accept_is_refused_and_unknown_is_not_found(self):
        request = self.make_request()
        self.assertEqual(self.accept(request, [5]).status_code, 200)
        path = cancel_path(request.request_uuid)
        self.assertEqual(self.client.post(path, **signed("POST", path)).json(), {"status": "accepted"})
        unknown = cancel_path(uuid.uuid4())
        self.assertEqual(self.client.post(unknown, **signed("POST", unknown)).json(), {"status": "not_found"})

    def test_accept_after_cancel_gives_a_clear_error_and_creates_nothing(self):
        request = self.make_request()
        path = cancel_path(request.request_uuid)
        self.client.post(path, **signed("POST", path))
        response = self.accept(request, [5])
        self.assertEqual(response.status_code, 400)
        self.assertIn("cancelled", str(response.json()))
        self.assertEqual(Invoice.objects.count(), 0)


class AcceptTests(PurchaseRequestBase):
    def test_accept_creates_a_confirmed_invoice_moves_stock_and_ledger_not_cash(self):
        product = self.stocked_product(stock=10, price="100")
        request = self.make_request([(product, 5, 10, 18, 1)])
        cash_before = CashFlow.objects.first().cash_in_hand if CashFlow.objects.exists() else Decimal("0")

        with patch("b2b.request_services.notify_partner") as bell, self.captureOnCommitCallbacks(execute=True):
            response = self.accept(request, [4])
        self.assertEqual(response.status_code, 200, response.content)

        request.refresh_from_db()
        invoice = request.invoice
        self.assertEqual(request.status, "accepted")
        self.assertEqual(invoice.status, "confirmed")
        self.assertEqual(invoice.bill_number, request.invoice_number)
        self.assertEqual(invoice.customer_id, self.customer.id)
        self.assertEqual(invoice.payment_type, "after_delivery")
        self.assertEqual(Inventory.objects.get(product=product).quantity, 6)

        line = invoice.items.get()
        self.assertEqual((line.quantity, line.discount, line.gst, line.wht), (4, Decimal("10"), Decimal("18"), Decimal("1")))
        self.assertEqual(line.selling_price, Decimal("100"))
        self.assertEqual(line.effective_price, Decimal("90"))
        self.assertEqual(invoice.grand_total, Decimal("90") * 4 * Decimal("1.17"))
        self.assertEqual(invoice.credit_outstanding, invoice.grand_total)
        self.assertTrue(CustomerLedgerEntry.objects.filter(invoice=invoice).exists())

        item = request.items.get()
        self.assertEqual((item.accepted_quantity, item.effective_price), (4, Decimal("90")))
        cash_after = CashFlow.objects.first().cash_in_hand if CashFlow.objects.exists() else Decimal("0")
        self.assertEqual(cash_after, cash_before)
        bell.assert_called_once_with(PARTNER, request.request_uuid)

    def test_partner_pulls_the_accepted_decision_with_prices(self):
        request = self.make_request()
        self.accept(request, [3])
        path = f"{DECISIONS_PATH}?uuids={request.request_uuid},{uuid.uuid4()}"
        query = f"uuids={request.request_uuid},{path.split(',')[1]}"
        response = self.client.get(path, **signed("GET", DECISIONS_PATH, query))
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["status"], "accepted")
        self.assertEqual(results[0]["items"], [{
            "product_code": "PEN-1", "quantity": 3, "unit_price": "90.0000", "gst": "18.00", "wht": "1.00",
        }])

    def test_decisions_returns_every_requested_uuid_up_to_the_cap_and_ignores_garbage(self):
        product = self.stocked_product()
        uuids = []
        for _ in range(30):
            data = self.payload([(product, 1, 0, 0, 0)])
            self.submit(data)
            uuids.append(data["request_uuid"])
        query = "uuids=" + ",".join(uuids + ["not-a-uuid"]) + "&page_size=100"
        with CaptureQueriesContext(connection) as ctx:
            body = self.client.get(f"{DECISIONS_PATH}?{query}", **signed("GET", DECISIONS_PATH, query)).json()
        self.assertEqual(body["count"], 30)
        self.assertLessEqual(len(ctx), 4, [q["sql"] for q in ctx])

    def test_another_partners_request_is_invisible(self):
        request = self.make_request()
        PurchaseRequest.objects.filter(pk=request.pk).update(partner_name="SOMEONE ELSE")
        query = f"uuids={request.request_uuid}"
        body = self.client.get(f"{DECISIONS_PATH}?{query}", **signed("GET", DECISIONS_PATH, query)).json()
        self.assertEqual(body["results"], [])

    def test_quantity_can_be_raised_and_a_zero_line_is_left_out(self):
        pen = self.stocked_product("PEN-1", "Blue Pen", stock=20)
        pad = self.stocked_product("PAD-2", "Note Pad", stock=20)
        request = self.make_request([(pen, 5, 0, 0, 0), (pad, 5, 0, 0, 0)])
        self.assertEqual(self.accept(request, [8, 0]).status_code, 200)
        request.refresh_from_db()
        self.assertEqual({i.product_code: i.accepted_quantity for i in request.items.all()}, {"PEN-1": 8, "PAD-2": 0})
        self.assertEqual(request.invoice.items.count(), 1)
        self.assertEqual(Inventory.objects.get(product=pad).quantity, 20)

    def test_all_zero_is_refused(self):
        request = self.make_request()
        response = self.accept(request, [0])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Invoice.objects.count(), 0)

    def test_shortage_lists_every_item_and_changes_nothing(self):
        pen = self.stocked_product("PEN-1", "Blue Pen", stock=3)
        pad = self.stocked_product("PAD-2", "Note Pad", stock=2)
        request = self.make_request([(pen, 5, 0, 0, 0), (pad, 5, 0, 0, 0)])
        response = self.accept(request, [5, 5])
        self.assertEqual(response.status_code, 400)
        text = str(response.json())
        self.assertIn("Blue Pen", text)
        self.assertIn("Note Pad", text)
        self.assertIn("only 3 available", text)
        request.refresh_from_db()
        self.assertEqual(request.status, "pending")
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(Inventory.objects.get(product=pen).quantity, 3)

    def test_shelf_total_must_match_and_shelf_must_hold_the_stock(self):
        request = self.make_request()
        body = self.accept_body(request, [4])
        body["items"][0]["shelf_allocations"][0]["quantity"] = 3
        response = self.admin_client().post(f"/api/b2b/purchase-requests/{request.id}/accept/", body, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("shelves must add up to 4", str(response.json()))
        # an empty shelf cannot supply stock — and the failure rolls everything back
        response = self.accept(request, [4], shelf=self.shelf2)
        self.assertEqual(response.status_code, 400)
        request.refresh_from_db()
        self.assertEqual(request.status, "pending")
        self.assertEqual(Invoice.objects.count(), 0)

    def test_missing_customer_code_is_a_clear_error(self):
        request = self.make_request()
        with override_settings(B2B_PARTNER_CUSTOMER_CODES={PARTNER: "DOES-NOT-EXIST"}):
            response = self.accept(request, [5])
        self.assertEqual(response.status_code, 400)
        self.assertIn("DOES-NOT-EXIST", str(response.json()))
        with override_settings(B2B_PARTNER_CUSTOMER_CODES={}):
            self.assertIn("customer code", str(self.accept(request, [5]).json()))
        request.refresh_from_db()
        self.assertEqual(request.status, "pending")

    def test_discount_larger_than_the_price_is_refused(self):
        product = self.stocked_product(price="100")
        request = self.make_request([(product, 1, 150, 0, 0)])
        response = self.accept(request, [1])
        self.assertEqual(response.status_code, 400)
        self.assertIn("negative", str(response.json()))

    def test_negative_discount_is_a_surcharge(self):
        product = self.stocked_product(price="100")
        request = self.make_request([(product, 2, -10, 0, 0)])
        self.assertEqual(self.accept(request, [2]).status_code, 200)
        self.assertEqual(request.items.get().effective_price if False else
                         PurchaseRequest.objects.get().items.get().effective_price, Decimal("110"))

    def test_cannot_decide_twice(self):
        request = self.make_request()
        self.assertEqual(self.accept(request, [5]).status_code, 200)
        self.assertEqual(self.accept(request, [5]).status_code, 400)
        response = self.admin_client().post(f"/api/b2b/purchase-requests/{request.id}/deny/")
        self.assertEqual(response.status_code, 400)


class DenyAndAdminTests(PurchaseRequestBase):
    def test_deny_marks_it_and_rings_the_bell_once(self):
        request = self.make_request()
        with patch("b2b.request_services.notify_partner") as bell, self.captureOnCommitCallbacks(execute=True):
            response = self.admin_client().post(f"/api/b2b/purchase-requests/{request.id}/deny/")
        self.assertEqual(response.json()["status"], "denied")
        bell.assert_called_once_with(PARTNER, request.request_uuid)
        query = f"uuids={request.request_uuid}"
        results = self.client.get(f"{DECISIONS_PATH}?{query}", **signed("GET", DECISIONS_PATH, query)).json()["results"]
        self.assertEqual(results, [{"request_uuid": str(request.request_uuid), "status": "denied", "items": []}])
        self.assertEqual(self.accept(request, [5]).status_code, 400)

    def test_failed_accept_never_rings_the_bell(self):
        request = self.make_request()
        with patch("b2b.request_services.notify_partner") as bell, self.captureOnCommitCallbacks(execute=True):
            self.accept(request, [999])
        bell.assert_not_called()

    def test_detail_shows_live_stock_while_pending_and_never_any_shelf_data(self):
        request = self.make_request()
        body = self.admin_client().get(f"/api/b2b/purchase-requests/{request.id}/").json()
        item = body["items"][0]
        self.assertEqual((item["available_quantity"], item["requested_quantity"]), (10, 5))
        self.assertEqual(item["current_price"], "100.0000")
        self.assertNotIn("shelf", str(body).lower())
        self.accept(request, [5])
        after = self.admin_client().get(f"/api/b2b/purchase-requests/{request.id}/").json()["items"][0]
        self.assertIsNone(after["available_quantity"])
        self.assertEqual(after["accepted_quantity"], 5)

    def test_permissions_and_switch(self):
        request = self.make_request()
        url = f"/api/b2b/purchase-requests/{request.id}/"
        self.assertEqual(APIClient().get("/api/b2b/purchase-requests/").status_code, 401)
        normal = self.admin_client(make_normal_user())
        for response in (
            normal.get("/api/b2b/purchase-requests/"), normal.get(url),
            normal.post(url + "accept/", {"items": []}, format="json"), normal.post(url + "deny/"),
        ):
            self.assertEqual(response.status_code, 403)
        with override_settings(B2B_PROVIDER_ENABLED=False):
            self.assertEqual(self.admin_client().get("/api/b2b/purchase-requests/").status_code, 404)

    def test_list_is_paginated_filtered_and_query_count_is_fixed(self):
        product = self.stocked_product()
        for _ in range(12):
            self.submit(self.payload([(product, 1, 0, 0, 0)]))
        client = self.admin_client()
        with CaptureQueriesContext(connection) as ctx:
            body = client.get("/api/b2b/purchase-requests/?page_size=10").json()
        self.assertEqual((body["count"], len(body["results"])), (12, 10))
        self.assertLessEqual(len(ctx), 4, [q["sql"] for q in ctx])
        self.assertEqual(client.get("/api/b2b/purchase-requests/?status=accepted").json()["count"], 0)

    def test_the_doorbell_thread_never_raises(self):
        from . import doorbell
        with override_settings(B2B_PARTNER_BASE_URLS="{}"):
            doorbell._ring(PARTNER, str(uuid.uuid4()))            # not configured: just returns
        with override_settings(B2B_PARTNER_BASE_URLS='{"%s": "http://127.0.0.1:9"}' % PARTNER, DEBUG=True):
            doorbell._ring(PARTNER, str(uuid.uuid4()))            # connection refused: swallowed
