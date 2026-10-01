import time
from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from purchases.models import Category, Product
from rates.models import ProductRate
from rates.services import create_rate
from users.models import User

from .models import PartnerRateAccess, PartnerRateAccessEvent
from .signing import (
    HEADER_CLIENT, HEADER_SIGNATURE, HEADER_TIMESTAMP, compute_signature,
)

PARTNER = "ALFA TEST"
SECRET = "unit-test-shared-secret"
REQUEST_PATH = "/api/b2b/partner/request/"
LIST_PATH = "/api/b2b/partner/rate-list/"

PROVIDER_ON = dict(
    B2B_PROVIDER_ENABLED=True,
    B2B_PARTNER_SECRETS='{"%s": "%s"}' % (PARTNER, SECRET),
    B2B_SIGNATURE_MAX_AGE_SECONDS=60,
    B2B_FAILED_AUTH_LIMIT="3/hour",
)


def signed(method, path, query="", *, client=PARTNER, secret=SECRET, timestamp=None,
           sign_query=None, body=b""):
    """Headers for the Django test client, signed the way the consumer signs."""
    ts = int(time.time()) if timestamp is None else timestamp
    signature = compute_signature(
        secret, timestamp=ts, method=method, path=path,
        query=query if sign_query is None else sign_query, body=body,
    )
    return {
        "HTTP_" + HEADER_CLIENT.upper().replace("-", "_"): client,
        "HTTP_" + HEADER_TIMESTAMP.upper().replace("-", "_"): str(ts),
        "HTTP_" + HEADER_SIGNATURE.upper().replace("-", "_"): signature,
    }


def make_admin(email="admin@example.com"):
    return User.objects.create_user(
        email=email, password="Adm1n-secret!", first_name="Admin",
        last_name="User", is_staff=True,
    )


def make_normal_user(email="normal@example.com"):
    return User.objects.create_user(
        email=email, password="N0rmal-secret!", first_name="Normal", last_name="User",
    )


@override_settings(**PROVIDER_ON)
class B2BTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = make_admin()
        self.category = Category.objects.create(name="Cat A")

    def get_list(self, query="", **kw):
        return self.client.get(LIST_PATH + (f"?{query}" if query else ""), **signed("GET", LIST_PATH, query, **kw))

    def post_request(self, **kw):
        return self.client.post(REQUEST_PATH, **signed("POST", REQUEST_PATH, **kw))

    def make_priced_product(self, code, name, price="100"):
        product = Product.objects.create(name=name, code=code, category=self.category)
        create_rate(product_id=product.id, selling_price=Decimal(price), user=self.admin)
        return product

    def admin_action(self, access_id, action):
        admin_client = APIClient()
        admin_client.force_authenticate(self.admin)
        return admin_client.post(f"/api/b2b/requests/{access_id}/{action}/")


class SignedAuthTests(B2BTestBase):
    def test_valid_signature_reaches_the_view(self):
        response = self.get_list()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "not_requested")

    def test_unknown_partner_is_404_and_never_touches_the_database(self):
        headers = signed("GET", LIST_PATH, client="SOMEONE ELSE")
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(LIST_PATH, **headers)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(ctx), 0)

    def test_bad_stale_missing_and_tampered_requests_are_all_the_same_404(self):
        bodies = []
        cases = {
            "wrong secret": self.client.get(LIST_PATH, **signed("GET", LIST_PATH, secret="nope")),
            "stale": self.client.get(LIST_PATH, **signed("GET", LIST_PATH, timestamp=int(time.time()) - 3600)),
            "no headers": self.client.get(LIST_PATH),
            "query tampered": self.client.get(LIST_PATH + "?search=b", **signed("GET", LIST_PATH, "search=a")),
            "wrong method": self.client.get(LIST_PATH, **signed("POST", LIST_PATH)),
        }
        for label, response in cases.items():
            self.assertEqual(response.status_code, 404, label)
            bodies.append(response.content)
        self.assertEqual(len(set(bodies)), 1)

    def test_signed_post_works_and_unsigned_post_does_not(self):
        self.assertEqual(self.client.post(REQUEST_PATH).status_code, 404)
        self.assertEqual(self.post_request().status_code, 200)

    @override_settings(B2B_PROVIDER_ENABLED=False)
    def test_provider_switched_off_is_404_everywhere(self):
        self.assertEqual(self.get_list().status_code, 404)
        admin_client = APIClient()
        admin_client.force_authenticate(self.admin)
        self.assertEqual(admin_client.get("/api/b2b/requests/").status_code, 404)

    @override_settings(B2B_PARTNER_SECRETS="{not json")
    def test_malformed_secrets_env_means_no_partners_not_a_crash(self):
        self.assertEqual(self.get_list().status_code, 404)

    @override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=10)
    def test_oversize_body_is_the_same_404_and_counts_as_a_failure(self):
        for _ in range(3):
            response = self.client.post(
                REQUEST_PATH, data=b"x" * 100, content_type="application/octet-stream",
                **signed("POST", REQUEST_PATH),
            )
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.get_list().status_code, 404)   # the IP is now blocked

    def test_repeated_failures_block_the_ip_even_for_a_valid_request(self):
        for _ in range(3):
            self.client.get(LIST_PATH, **signed("GET", LIST_PATH, secret="wrong"))
        self.assertEqual(self.get_list().status_code, 404)


class AccessFlowTests(B2BTestBase):
    def test_request_creates_a_pending_row_and_is_idempotent(self):
        self.assertEqual(self.post_request().json()["status"], "pending")
        self.assertEqual(self.post_request().json()["status"], "pending")
        self.assertEqual(PartnerRateAccess.objects.count(), 1)
        self.assertEqual(PartnerRateAccessEvent.objects.count(), 1)

    def test_pending_partner_sees_status_but_no_rates(self):
        self.make_priced_product("P1", "Pen")
        self.post_request()
        body = self.get_list().json()
        self.assertEqual(body["status"], "pending")
        self.assertEqual(body["results"], [])

    def test_full_lifecycle_with_re_request_after_revoke_and_after_reject(self):
        self.post_request()
        access = PartnerRateAccess.objects.get()

        self.assertEqual(self.admin_action(access.id, "approve").json()["status"], "approved")
        self.assertEqual(self.get_list().json()["status"], "approved")

        self.assertEqual(self.admin_action(access.id, "revoke").json()["status"], "revoked")
        self.assertEqual(self.get_list().json()["results"], [])
        self.assertEqual(self.post_request().json()["status"], "pending")      # re-request after revoke

        self.assertEqual(self.admin_action(access.id, "reject").json()["status"], "rejected")
        self.assertEqual(self.get_list().json()["status"], "rejected")
        self.assertEqual(self.post_request().json()["status"], "pending")      # re-request after reject

        self.assertEqual(self.admin_action(access.id, "reject").json()["status"], "rejected")
        self.assertEqual(self.admin_action(access.id, "approve").json()["status"], "approved")  # approve a rejected one later

        events = list(PartnerRateAccessEvent.objects.values_list("to_status", "actor_id"))
        self.assertEqual(events[0], ("pending", None))             # partner-triggered
        self.assertIn(("approved", self.admin.pk), events)         # admin-triggered

    def test_invalid_transitions_are_clean_400s(self):
        self.post_request()
        access = PartnerRateAccess.objects.get()
        self.assertEqual(self.admin_action(access.id, "revoke").status_code, 400)   # pending can't be revoked
        self.admin_action(access.id, "approve")
        self.assertEqual(self.admin_action(access.id, "approve").status_code, 400)  # already approved
        self.assertEqual(self.admin_action(access.id, "reject").status_code, 400)   # approved can't be rejected
        self.assertEqual(self.admin_action(99999, "approve").status_code, 404)

    def test_approved_partner_pending_request_call_is_a_no_op(self):
        self.post_request()
        access = PartnerRateAccess.objects.get()
        self.admin_action(access.id, "approve")
        self.assertEqual(self.post_request().json()["status"], "approved")


class SharedRateListTests(B2BTestBase):
    def approve(self):
        self.post_request()
        self.admin_action(PartnerRateAccess.objects.get().id, "approve")

    def test_only_priced_non_deleted_products_with_only_three_fields(self):
        self.make_priced_product("P1", "Pen", "12.5")
        Product.objects.create(name="Unpriced", code="P2", category=self.category)
        deleted = self.make_priced_product("P3", "Gone")
        Product.objects.filter(pk=deleted.pk).update(is_deleted=True)
        self.approve()

        body = self.get_list().json()
        self.assertEqual(body["status"], "approved")
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["results"], [{"code": "P1", "name": "Pen", "selling_price": "12.5000"}])

    def test_search_matches_name_or_code_and_results_are_ordered(self):
        self.make_priced_product("B-2", "Banana pad")
        self.make_priced_product("A-1", "Apple pad")
        self.make_priced_product("Z-9", "Stapler")
        self.approve()

        self.assertEqual([r["code"] for r in self.get_list().json()["results"]], ["A-1", "B-2", "Z-9"])
        self.assertEqual([r["code"] for r in self.get_list("search=pad").json()["results"]], ["A-1", "B-2"])
        self.assertEqual([r["code"] for r in self.get_list("search=z-9").json()["results"]], ["Z-9"])

    def test_pagination_envelope(self):
        for i in range(30):
            self.make_priced_product(f"C-{i:02d}", f"Item {i:02d}")
        self.approve()
        body = self.get_list("page_size=10&page=3").json()
        self.assertEqual(
            sorted(body), ["count", "current_page", "page_size", "results", "status", "total_pages"],
        )
        self.assertEqual((body["count"], body["total_pages"], body["current_page"], len(body["results"])), (30, 3, 3, 10))

    def test_query_count_is_fixed_not_per_row(self):
        for i in range(25):
            self.make_priced_product(f"Q-{i:02d}", f"Row {i:02d}")
        self.approve()
        with CaptureQueriesContext(connection) as ctx:
            response = self.get_list("page_size=25")
        self.assertEqual(len(response.json()["results"]), 25)
        self.assertLessEqual(len(ctx), 4, [q["sql"] for q in ctx])

    def test_no_cost_or_internal_fields_leak(self):
        self.make_priced_product("P1", "Pen")
        self.approve()
        result = self.get_list().json()["results"][0]
        self.assertEqual(sorted(result), ["code", "name", "selling_price"])
        self.assertEqual(ProductRate.objects.count(), 1)


class AdminPermissionTests(B2BTestBase):
    def test_only_admin_or_superuser_can_list_and_act(self):
        self.post_request()
        access = PartnerRateAccess.objects.get()

        anonymous = APIClient()
        self.assertEqual(anonymous.get("/api/b2b/requests/").status_code, 401)

        normal = APIClient()
        normal.force_authenticate(make_normal_user())
        self.assertEqual(normal.get("/api/b2b/requests/").status_code, 403)
        self.assertEqual(normal.post(f"/api/b2b/requests/{access.id}/approve/").status_code, 403)
        access.refresh_from_db()
        self.assertEqual(access.status, "pending")

        admin_client = APIClient()
        admin_client.force_authenticate(self.admin)
        listing = admin_client.get("/api/b2b/requests/").json()
        self.assertEqual(listing["count"], 1)
        self.assertEqual(listing["results"][0]["partner_name"], PARTNER)
        self.assertEqual(admin_client.get("/api/b2b/requests/?status=approved").json()["count"], 0)

    def test_request_list_query_count_is_fixed(self):
        admin_client = APIClient()
        admin_client.force_authenticate(self.admin)
        with CaptureQueriesContext(connection) as ctx:
            admin_client.get("/api/b2b/requests/")
        self.assertLessEqual(len(ctx), 4)
