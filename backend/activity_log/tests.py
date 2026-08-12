from django.apps import apps
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory, force_authenticate

from purchases.models import Category
from users.models import User

from .models import ActivityEvent, ActivityStatsFlow
from .selectors import get_activity_stats
from .tracking import TRACKED_MODELS
from .views import ActivityEventListView, ActivityStatsView


def make_superuser(email="super@example.com"):
    return User.objects.create_user(
        email=email, password="Sup3r-secret!", first_name="Super", last_name="User",
        is_staff=True, is_superuser=True,
    )


def make_admin(email="admin@example.com"):
    return User.objects.create_user(
        email=email, password="Adm1n-secret!", first_name="Admin", last_name="User",
        is_staff=True,
    )


def make_normal_user(email="normal@example.com"):
    return User.objects.create_user(
        email=email, password="N0rmal-secret!", first_name="Normal", last_name="User",
    )


class TrackedModelsRegistryTests(TestCase):
    """
    Regression coverage for the audit finding: a typo'd or renamed entry in
    TRACKED_MODELS silently stops tracking that model forever (only a
    log.warning, nothing louder) — this asserts every entry actually
    resolves, so a broken one fails CI instead of degrading silently.
    """
    def test_every_tracked_model_resolves(self):
        for app_label, model_name in TRACKED_MODELS:
            try:
                apps.get_model(app_label, model_name)
            except LookupError:
                self.fail(f"TRACKED_MODELS entry ({app_label!r}, {model_name!r}) does not resolve to a real model")

    def test_child_line_item_models_are_not_tracked(self):
        # Regression for the audit's must-fix: LostInventoryItem is a child
        # row of LostInventoryRecord (looped per-item on creation) and must
        # stay untracked, same as PurchaseItem/InvoiceItem/etc.
        self.assertNotIn(("purchases", "lostinventoryitem"), TRACKED_MODELS)
        self.assertNotIn(("purchases", "purchaseitem"), TRACKED_MODELS)
        self.assertNotIn(("billing", "invoiceitem"), TRACKED_MODELS)


class SignalTrackingTests(TestCase):
    """
    Uses Category (a small, simple tracked model) to verify the
    create/update/delete/state_change classification logic end to end,
    through the real signal path — not by calling record_activity()
    directly.
    """

    def test_create_fires_create_event(self):
        cat = Category.objects.create(name="Test Cat")
        event = ActivityEvent.objects.filter(app_label="purchases", model_name="category", object_id=str(cat.pk)).latest("id")
        self.assertEqual(event.action, ActivityEvent.Action.CREATE)
        self.assertIn("Test Cat", event.description)
        self.assertIn("Test Cat", event.object_repr)

    def test_update_with_fields_lists_changed_fields(self):
        cat = Category.objects.create(name="Test Cat 2")
        cat.name = "Renamed"
        cat.save(update_fields=["name"])
        event = ActivityEvent.objects.filter(app_label="purchases", model_name="category", object_id=str(cat.pk)).latest("id")
        self.assertEqual(event.action, ActivityEvent.Action.UPDATE)
        self.assertEqual(event.changed_fields, ["name"])

    def test_soft_delete_detected_as_delete_not_update(self):
        cat = Category.objects.create(name="Test Cat 3")
        cat.is_deleted = True
        cat.save(update_fields=["is_deleted"])
        event = ActivityEvent.objects.filter(app_label="purchases", model_name="category", object_id=str(cat.pk)).latest("id")
        self.assertEqual(event.action, ActivityEvent.Action.DELETE)

    def test_stats_singleton_increments_atomically(self):
        Category.objects.create(name="Stats Cat 1")
        Category.objects.create(name="Stats Cat 2")
        stats = get_activity_stats()
        self.assertGreaterEqual(stats.total_events, 2)
        self.assertGreaterEqual(stats.total_creates, 2)

    def test_untracked_model_produces_no_event(self):
        # ShelfStock is the child/accounting table behind Shelf/Product —
        # never in TRACKED_MODELS — while Shelf/Product/Category (used to
        # build it) are tracked, so this confirms the whitelist actually
        # discriminates rather than tracking everything.
        from purchases.models import Category as Cat
        from purchases.models import Product, Shelf, ShelfStock
        cat = Cat.objects.create(name="X")
        product = Product.objects.create(name="Untracked Product Test", code="UPT1", category=cat)
        shelf = Shelf.objects.create(name="Untracked Shelf")
        ShelfStock.objects.create(shelf=shelf, product=product, quantity=5)

        self.assertTrue(ActivityEvent.objects.filter(model_name="product", object_id=str(product.pk)).exists())
        self.assertTrue(ActivityEvent.objects.filter(model_name="shelf", object_id=str(shelf.pk)).exists())
        self.assertFalse(ActivityEvent.objects.filter(model_name="shelfstock").exists())


class ActivityLogPermissionTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        Category.objects.create(name="Permission Test Cat")

    def test_normal_user_forbidden(self):
        request = self.factory.get("/api/activity-log/events/")
        force_authenticate(request, user=make_normal_user())
        response = ActivityEventListView.as_view()(request)
        self.assertEqual(response.status_code, 403)

    def test_admin_non_superuser_forbidden(self):
        request = self.factory.get("/api/activity-log/events/")
        force_authenticate(request, user=make_admin())
        response = ActivityEventListView.as_view()(request)
        self.assertEqual(response.status_code, 403)

    def test_superuser_allowed(self):
        request = self.factory.get("/api/activity-log/events/")
        force_authenticate(request, user=make_superuser())
        response = ActivityEventListView.as_view()(request)
        self.assertEqual(response.status_code, 200)

    def test_stats_endpoint_superuser_only(self):
        request = self.factory.get("/api/activity-log/stats/")
        force_authenticate(request, user=make_admin())
        response = ActivityStatsView.as_view()(request)
        self.assertEqual(response.status_code, 403)

        request = self.factory.get("/api/activity-log/stats/")
        force_authenticate(request, user=make_superuser())
        response = ActivityStatsView.as_view()(request)
        self.assertEqual(response.status_code, 200)


class ActivityLogQueryCountTests(TestCase):
    def test_event_list_query_count_stays_flat(self):
        superuser = make_superuser()
        for i in range(30):
            Category.objects.create(name=f"QC Cat {i}")

        request = APIRequestFactory().get("/api/activity-log/events/", {"page_size": 25})
        force_authenticate(request, user=superuser)
        with CaptureQueriesContext(connection) as ctx:
            response = ActivityEventListView.as_view()(request)
            response.render() if hasattr(response, "render") else None
        self.assertEqual(response.status_code, 200)
        # Paginated list (count + page + select_related(user) join) should
        # be a small fixed number regardless of how many events exist —
        # not proportional to the 30 rows just created.
        self.assertLess(len(ctx.captured_queries), 6)

    def test_stats_endpoint_is_single_query(self):
        superuser = make_superuser()
        Category.objects.create(name="Stats QC Cat")

        request = APIRequestFactory().get("/api/activity-log/stats/")
        force_authenticate(request, user=superuser)
        with CaptureQueriesContext(connection) as ctx:
            response = ActivityStatsView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(ctx.captured_queries), 2)
