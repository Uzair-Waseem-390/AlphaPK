"""The wake-up rule: if the partner does not answer its readiness check, NOTHING is written here."""
import json
import time
from unittest.mock import patch
from urllib import error

from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from billing.models import Invoice
from purchases.models import Inventory

from . import doorbell
from .models import PurchaseRequest
from .signing import compute_signature
from .test_requests import CUSTOMER_CODE, PurchaseRequestBase
from .tests import PARTNER, PROVIDER_ON, SECRET, make_admin, make_normal_user, signed

PING = "/api/b2b/partner/ping/"
WRITE_VERBS = ("INSERT", "UPDATE", "DELETE")


def writes(ctx):
    return [q["sql"][:90] for q in ctx.captured_queries if q["sql"].lstrip().upper().startswith(WRITE_VERBS)]


class FakeResponse:
    def __init__(self, status=200, body=b'{"ok": true}'):
        self.status, self._body = status, body

    def read(self, n=-1):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@override_settings(**PROVIDER_ON)
class ReadinessEndpointTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_signed_partner_gets_200_and_everyone_else_404(self):
        client = APIClient()
        self.assertEqual(client.get(PING, **signed("GET", PING)).json(), {"ok": True})
        self.assertEqual(client.get(PING).status_code, 404)
        self.assertEqual(client.get(PING, **signed("GET", PING, secret="wrong")).status_code, 404)
        self.assertEqual(client.get(PING, **signed("GET", PING, client="SOMEONE ELSE")).status_code, 404)

    def test_a_broken_database_means_not_ready(self):
        with patch("b2b.views.connection.cursor", side_effect=Exception("db down")):
            response = APIClient().get(PING, **signed("GET", PING))
        self.assertEqual(response.status_code, 503)

    @override_settings(B2B_PROVIDER_ENABLED=False)
    def test_switched_off_is_404(self):
        self.assertEqual(APIClient().get(PING, **signed("GET", PING)).status_code, 404)


@override_settings(**PROVIDER_ON, B2B_PARTNER_BASE_URLS='{"%s": "https://partner.example"}' % PARTNER)
class PartnerIsAwakeTests(TestCase):
    def test_only_an_http_200_counts_as_awake(self):
        with patch.object(doorbell._opener, "open", return_value=FakeResponse(200)):
            self.assertTrue(doorbell.partner_is_awake(PARTNER))
        with patch.object(doorbell._opener, "open", return_value=FakeResponse(204)):
            self.assertFalse(doorbell.partner_is_awake(PARTNER))

    def test_status_tells_asleep_from_refused(self):
        cases = [
            (error.URLError("down"), "asleep"), (TimeoutError(), "asleep"), (ConnectionRefusedError(), "asleep"),
            (error.HTTPError("u", 503, "waking", {}, None), "asleep"),
            (error.HTTPError("u", 502, "bad gateway", {}, None), "asleep"),
            (error.HTTPError("u", 404, "no", {}, None), "not_configured"),
            (error.HTTPError("u", 403, "no", {}, None), "not_configured"),
        ]
        for failure, expected in cases:
            with patch.object(doorbell._opener, "open", side_effect=failure):
                self.assertEqual(doorbell.partner_wake_status(PARTNER), expected, repr(failure))
        with patch.object(doorbell._opener, "open", return_value=FakeResponse(200)):
            self.assertEqual(doorbell.partner_wake_status(PARTNER), "awake")

    def test_every_kind_of_failure_means_not_awake(self):
        for failure in (
            error.URLError("down"), TimeoutError(), ConnectionRefusedError(),
            error.HTTPError("u", 503, "waking", {}, None), error.HTTPError("u", 404, "nf", {}, None),
        ):
            with patch.object(doorbell._opener, "open", side_effect=failure):
                self.assertFalse(doorbell.partner_is_awake(PARTNER), repr(failure))

    def test_the_check_is_signed_uses_get_and_a_five_second_limit(self):
        with patch.object(doorbell._opener, "open", return_value=FakeResponse(200)) as opened:
            doorbell.partner_is_awake(PARTNER)
        req = opened.call_args.args[0]
        self.assertEqual((req.get_method(), req.full_url), ("GET", "https://partner.example" + PING))
        self.assertEqual(opened.call_args.kwargs["timeout"], 5.0)
        headers = {k.lower(): v for k, v in req.header_items()}
        expected = compute_signature(
            SECRET, timestamp=headers["x-b2b-timestamp"], method="GET", path=PING, query="", body=b"",
        )
        self.assertEqual(headers["x-b2b-signature"], expected)

    def test_not_configured_means_not_awake_without_any_network_call(self):
        with override_settings(B2B_PARTNER_BASE_URLS="{}"), patch.object(doorbell._opener, "open") as opened:
            self.assertFalse(doorbell.partner_is_awake(PARTNER))
        opened.assert_not_called()

    @override_settings(B2B_PARTNER_BASE_URLS='{"%s": "http://partner.example"}' % PARTNER, DEBUG=False)
    def test_plain_http_is_refused_outside_debug(self):
        with patch.object(doorbell._opener, "open") as opened:
            self.assertFalse(doorbell.partner_is_awake(PARTNER))
        opened.assert_not_called()


class WakeGateTests(PurchaseRequestBase):
    """Accept / deny with a partner that does not answer: no write, no invoice, no status change."""

    def setUp(self):
        super().setUp()
        self.addCleanup(patch.stopall)
        patch.stopall()   # remove the default "always awake" stub so the REAL gate runs
        self.request = self.make_request()
        self.stock_before = Inventory.objects.get().quantity

    def asleep(self):
        return patch("b2b.doorbell.partner_wake_status", return_value="asleep")

    def assert_nothing_changed(self):
        self.request.refresh_from_db()
        self.assertEqual((self.request.status, self.request.invoice_id), ("pending", None))
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(Inventory.objects.get().quantity, self.stock_before)

    def test_accept_with_a_sleeping_partner_is_409_and_writes_nothing(self):
        with self.asleep(), CaptureQueriesContext(connection) as ctx:
            response = self.accept(self.request, [5])
        self.assertEqual(response.status_code, 409)
        self.assertIn("nothing was changed", response.json()["detail"].lower())
        self.assertEqual(writes(ctx), [])
        self.assert_nothing_changed()

    def test_deny_with_a_sleeping_partner_is_409_and_writes_nothing(self):
        with self.asleep(), CaptureQueriesContext(connection) as ctx:
            response = self.admin_client().post(f"/api/b2b/purchase-requests/{self.request.id}/deny/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(writes(ctx), [])
        self.assert_nothing_changed()

    def test_no_doorbell_and_no_second_call_when_the_check_fails(self):
        with self.asleep(), patch("b2b.request_services.notify_partner") as bell, \
                self.captureOnCommitCallbacks(execute=True):
            self.accept(self.request, [5])
        bell.assert_not_called()

    def test_the_check_runs_before_the_first_write(self):
        seen = {}

        def awake(partner):
            seen["partner"] = partner
            seen["writes_so_far"] = writes(ctx)
            return "awake"

        with patch("b2b.doorbell.partner_wake_status", side_effect=awake), CaptureQueriesContext(connection) as ctx:
            response = self.accept(self.request, [5])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(seen, {"partner": PARTNER, "writes_so_far": []})

    def test_a_partner_that_refuses_us_blocks_accept_with_its_own_message_and_writes_nothing(self):
        with patch("b2b.doorbell.partner_wake_status", return_value="not_configured"), \
                CaptureQueriesContext(connection) as ctx:
            response = self.accept(self.request, [5])
        self.assertEqual(response.status_code, 409)
        self.assertIn("did not accept this connection", response.json()["detail"])
        self.assertEqual(writes(ctx), [])
        self.assert_nothing_changed()

    def test_an_awake_partner_lets_everything_through(self):
        with patch("b2b.doorbell.partner_wake_status", return_value="awake"):
            self.assertEqual(self.accept(self.request, [5]).status_code, 200)
        self.request.refresh_from_db()
        self.assertEqual(self.request.status, "accepted")

    def test_an_unconfigured_partner_blocks_accept_too(self):
        with override_settings(B2B_PARTNER_BASE_URLS="{}"):
            response = self.accept(self.request, [5])
        self.assertEqual(response.status_code, 409)
        self.assert_nothing_changed()

    def test_partner_facing_calls_and_rate_access_are_not_gated(self):
        # Submitting / cancelling / rate-list approval never call the partner, so they never wake it.
        path = f"/api/b2b/partner/purchase-requests/{self.request.request_uuid}/cancel/"
        with self.asleep():
            response = self.client.post(path, **signed("POST", path))
        self.assertEqual(response.json(), {"status": "cancelled"})


@override_settings(**PROVIDER_ON, B2B_PARTNER_BASE_URLS='{"%s": "https://partner.example"}' % PARTNER)
class WakeEndpointTests(TestCase):
    def setUp(self):
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def test_reports_awake_or_not_for_a_known_partner(self):
        url = f"/api/b2b/partners/{PARTNER}/wake/"
        with patch("b2b.views.partner_wake_status", return_value="awake"):
            self.assertEqual(self.admin.post(url).json(), {"awake": True})
        with patch("b2b.views.partner_wake_status", return_value="asleep"):
            self.assertEqual(self.admin.post(url).json(), {"awake": False, "reason": "asleep"})
        with patch("b2b.views.partner_wake_status", return_value="not_configured"):
            self.assertEqual(self.admin.post(url).json(), {"awake": False, "reason": "not_configured"})

    def test_unknown_partner_admin_only_and_switch(self):
        self.assertEqual(self.admin.post("/api/b2b/partners/NOBODY/wake/").status_code, 404)
        normal = APIClient()
        normal.force_authenticate(make_normal_user())
        self.assertEqual(normal.post(f"/api/b2b/partners/{PARTNER}/wake/").status_code, 403)
        self.assertEqual(APIClient().post(f"/api/b2b/partners/{PARTNER}/wake/").status_code, 401)
        with override_settings(B2B_PROVIDER_ENABLED=False):
            self.assertEqual(self.admin.post(f"/api/b2b/partners/{PARTNER}/wake/").status_code, 404)


class AuditHardeningTests(PurchaseRequestBase):
    def setUp(self):
        super().setUp()
        patch.stopall()                       # real gate again
        self.request = self.make_request()

    def test_the_gate_runs_before_the_transaction_function_is_even_entered(self):
        order = []
        with patch("b2b.doorbell.partner_wake_status", side_effect=lambda p: order.append("ping") or "asleep"), \
                patch("b2b.request_services._accept_atomic", side_effect=lambda **k: order.append("accept")), \
                patch("b2b.request_services._deny_atomic", side_effect=lambda **k: order.append("deny")):
            self.accept(self.request, [5])
            self.admin_client().post(f"/api/b2b/purchase-requests/{self.request.id}/deny/")
        self.assertEqual(order, ["ping", "ping"])          # asleep: the atomic functions were never called

    def test_a_request_that_can_no_longer_be_decided_is_a_400_without_any_wake_call(self):
        PurchaseRequest.objects.filter(pk=self.request.pk).update(status="cancelled")
        with patch("b2b.doorbell.partner_wake_status") as ping:
            cancelled = self.accept(self.request, [5])
            PurchaseRequest.objects.filter(pk=self.request.pk).update(status="accepted")
            decided = self.admin_client().post(f"/api/b2b/purchase-requests/{self.request.id}/deny/")
        self.assertEqual((cancelled.status_code, decided.status_code), (400, 400))
        self.assertIn("cancelled", str(cancelled.json()))
        ping.assert_not_called()
        self.assertEqual(self.admin_client().post("/api/b2b/purchase-requests/99999/deny/").status_code, 404)

    @override_settings(B2B_PARTNER_BASE_URLS='{"%s": "https://[broken"}' % PARTNER)
    def test_a_malformed_partner_url_is_a_clean_409_not_a_500(self):
        response = self.accept(self.request, [5])
        self.assertEqual(response.status_code, 409)
        self.assertIn("did not accept this connection", response.json()["detail"])

    @override_settings(B2B_PARTNER_BASE_URLS='{"%s": "https://partner.example"}' % PARTNER)
    def test_a_redirect_is_never_followed_and_counts_as_not_awake(self):
        redirect = error.HTTPError("u", 301, "moved", {"Location": "https://elsewhere"}, None)
        with patch.object(doorbell._opener, "open", side_effect=redirect) as opened:
            self.assertEqual(doorbell.partner_wake_status(PARTNER), "asleep")
        self.assertEqual(opened.call_count, 1)

    @override_settings(B2B_PARTNER_BASE_URLS='{"%s": "https://partner.example"}' % PARTNER)
    def test_a_non_ascii_company_name_cannot_be_sent_as_a_header(self):
        with override_settings(COMPANY_NAME="caf\u00e9"), patch.object(doorbell._opener, "open") as opened:
            self.assertEqual(doorbell.partner_wake_status(PARTNER), "not_configured")
        opened.assert_not_called()

    def test_strangers_never_reach_the_database_on_the_ping_endpoint(self):
        client = APIClient()
        with patch("b2b.views.connection.cursor") as cursor:
            client.get(PING)                                                   # no headers
            client.get(PING, **signed("GET", PING, secret="wrong"))            # bad signature
            client.get(PING, **signed("GET", PING, timestamp=int(time.time()) - 3600))   # stale
        cursor.assert_not_called()
