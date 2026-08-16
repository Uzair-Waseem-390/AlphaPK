from datetime import date
from decimal import Decimal

from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from users.models import User

from payment_methods.models import PaymentMethod

from .models import AssetFlow, AssetValuationEntry
from .selectors import get_all_assets, get_asset_stats
from .services import (
    _add_months, create_asset, create_asset_category, dispose_asset,
    update_asset_category,
)
from .views import AssetDisposalListView, AssetListCreateView


def make_admin(email="admin@example.com"):
    return User.objects.create_user(
        email=email, password="Adm1n-secret!", first_name="Admin",
        last_name="User", is_staff=True,
    )


class AssetsTestBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = make_admin()
        # 12%/year reducing balance → cost 1200 depreciates 12/month in year 1.
        self.category = create_asset_category(
            name="Machinery", valuation_method="depreciation",
            depreciation_rate=Decimal("0.12"), user=self.admin,
        )
        today = timezone.localdate()
        y, m = _add_months(today.year, today.month, -2)
        # 'existing' asset acquired 2 months ago — create_asset back-fills
        # its 2 elapsed depreciation months immediately.
        self.asset = create_asset(
            name="Generator", category_id=self.category.id, acquisition_type="existing",
            cost=Decimal("1200"), acquisition_date=date(y, m, 1), user=self.admin,
        )


class DepreciationCatchUpTests(AssetsTestBase):
    def test_backfill_marker_and_rate_change_semantics(self):
        entries = AssetValuationEntry.objects.filter(asset=self.asset).order_by("period")
        self.assertEqual(entries.count(), 2)
        self.assertEqual([e.amount for e in entries], [Decimal("-12.0000"), Decimal("-12.0000")])
        self.assertEqual([e.rate_applied for e in entries], [Decimal("0.1200"), Decimal("0.1200")])
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.current_worth, Decimal("1176.0000"))

        # Stats sweep stamps the month marker; repeat reads post nothing new.
        get_asset_stats()
        today = timezone.localdate()
        current_period = f"{today.year:04d}-{today.month:02d}"
        self.assertEqual(
            AssetFlow.get_instance().depreciation_caught_up_through, current_period,
        )
        get_asset_stats()
        list(get_all_assets())
        self.assertEqual(AssetValuationEntry.objects.filter(asset=self.asset).count(), 2)

        # Rate edit resets the marker so the NEW rate applies from the next
        # read forward — already-posted months keep their snapshotted rate.
        update_asset_category(pk=self.category.pk, depreciation_rate=Decimal("0.24"), user=self.admin)
        self.assertEqual(AssetFlow.get_instance().depreciation_caught_up_through, "")
        get_asset_stats()
        self.assertEqual(AssetFlow.get_instance().depreciation_caught_up_through, current_period)
        # All months were already posted — nothing new, history untouched.
        entries = AssetValuationEntry.objects.filter(asset=self.asset).order_by("period")
        self.assertEqual(entries.count(), 2)
        self.assertEqual([e.rate_applied for e in entries], [Decimal("0.1200"), Decimal("0.1200")])

    def test_duplicate_depreciation_month_is_impossible(self):
        entry = AssetValuationEntry.objects.filter(asset=self.asset, entry_type="depreciation").first()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AssetValuationEntry.objects.create(
                    asset=self.asset, entry_type="depreciation", period=entry.period,
                    rate_applied=entry.rate_applied, worth_before=0, worth_after=0, amount=0,
                )

        # Two manual revaluations in the same month stay legitimate.
        for worth in (Decimal("1100"), Decimal("1050")):
            AssetValuationEntry.objects.create(
                asset=self.asset, entry_type="revaluation", period=entry.period,
                worth_before=0, worth_after=worth, amount=0,
            )


class AssetListQueryStabilityTests(AssetsTestBase):
    def list_assets(self):
        request = self.factory.get("/assets/")
        force_authenticate(request, user=self.admin)
        return AssetListCreateView.as_view()(request)

    def test_list_queries_constant_as_assets_grow(self):
        get_asset_stats()  # stamp the marker first

        with CaptureQueriesContext(connection) as ctx_small:
            response = self.list_assets()
        self.assertEqual(response.status_code, 200)

        today = timezone.localdate()
        for i in range(5):
            create_asset(
                name=f"Extra {i}", category_id=self.category.id, acquisition_type="existing",
                cost=Decimal("100"), acquisition_date=today, user=self.admin,
            )

        with CaptureQueriesContext(connection) as ctx_large:
            response = self.list_assets()
        self.assertEqual(response.data["count"], 6)
        # Marker gate + select_related: query count must not scale with rows.
        self.assertEqual(len(ctx_small.captured_queries), len(ctx_large.captured_queries))


class AssetAllocationTests(AssetsTestBase):
    """Phase 5 Batch C: method_allocations required only on the branch that
    actually moves cash (new acquisition / sold disposal)."""

    def setUp(self):
        super().setUp()
        self.cash = PaymentMethod.objects.create(name="Cash", balance=Decimal("1000000"))

    def cash_split(self, amount):
        return [(self.cash, Decimal(amount))]

    def test_existing_asset_needs_no_method_allocations(self):
        # No exception, no cash/allocation movement — already exercised by
        # AssetsTestBase.setUp itself (acquisition_type="existing"), asserted
        # again here explicitly for clarity.
        asset = create_asset(
            name="Shed", category_id=self.category.id, acquisition_type="existing",
            cost=Decimal("500"), acquisition_date=timezone.localdate(), user=self.admin,
        )
        self.cash.refresh_from_db()
        self.assertEqual(self.cash.balance, Decimal("1000000"))
        from payment_methods.models import PaymentAllocation
        self.assertFalse(
            PaymentAllocation.objects.filter(source_model="assets.asset", source_id=asset.id).exists(),
        )

    def test_new_asset_without_method_allocations_rejected(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            create_asset(
                name="Forklift", category_id=self.category.id, acquisition_type="new",
                cost=Decimal("500"), acquisition_date=timezone.localdate(), user=self.admin,
            )

    def test_new_asset_moves_method_balance(self):
        create_asset(
            name="Forklift", category_id=self.category.id, acquisition_type="new",
            cost=Decimal("500"), acquisition_date=timezone.localdate(),
            method_allocations=self.cash_split("500"), user=self.admin,
        )
        self.cash.refresh_from_db()
        self.assertEqual(self.cash.balance, Decimal("999500"))

    def test_scrapped_disposal_needs_no_method_allocations(self):
        asset = create_asset(
            name="Forklift", category_id=self.category.id, acquisition_type="new",
            cost=Decimal("500"), acquisition_date=timezone.localdate(),
            method_allocations=self.cash_split("500"), user=self.admin,
        )
        dispose_asset(
            asset_id=asset.id, disposal_type="scrapped",
            disposal_date=timezone.localdate(), user=self.admin,
        )
        self.cash.refresh_from_db()
        self.assertEqual(self.cash.balance, Decimal("999500"))  # unchanged by the disposal itself

    def test_sold_disposal_without_method_allocations_rejected(self):
        asset = create_asset(
            name="Forklift", category_id=self.category.id, acquisition_type="new",
            cost=Decimal("500"), acquisition_date=timezone.localdate(),
            method_allocations=self.cash_split("500"), user=self.admin,
        )
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            dispose_asset(
                asset_id=asset.id, disposal_type="sold",
                disposal_date=timezone.localdate(), sale_amount=Decimal("300"), user=self.admin,
            )

    def test_sold_disposal_moves_method_balance(self):
        asset = create_asset(
            name="Forklift", category_id=self.category.id, acquisition_type="new",
            cost=Decimal("500"), acquisition_date=timezone.localdate(),
            method_allocations=self.cash_split("500"), user=self.admin,
        )
        dispose_asset(
            asset_id=asset.id, disposal_type="sold", disposal_date=timezone.localdate(),
            sale_amount=Decimal("300"), method_allocations=self.cash_split("300"), user=self.admin,
        )
        self.cash.refresh_from_db()
        self.assertEqual(self.cash.balance, Decimal("999800"))  # 1000000 - 500 + 300


class AssetAllocationAPITests(AssetsTestBase):
    """Exercises the real serializer validation path (AssetCreateSerializer/
    AssetDisposeSerializer's conditional method_allocations requirement),
    not just the service functions directly."""

    def setUp(self):
        super().setUp()
        self.cash = PaymentMethod.objects.create(name="Cash", balance=Decimal("1000000"))

    def test_create_new_asset_without_method_allocations_returns_400(self):
        from .views import AssetListCreateView

        request = self.factory.post("/assets/items/", {
            "name": "Forklift", "category": self.category.id, "acquisition_type": "new",
            "cost": "500", "acquisition_date": str(timezone.localdate()),
        }, format="json")
        force_authenticate(request, user=self.admin)
        response = AssetListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn("method_allocations", response.data)

    def test_create_new_asset_with_method_allocations_succeeds(self):
        from .views import AssetListCreateView

        request = self.factory.post("/assets/items/", {
            "name": "Forklift", "category": self.category.id, "acquisition_type": "new",
            "cost": "500", "acquisition_date": str(timezone.localdate()),
            "method_allocations": [{"payment_method": self.cash.id, "amount": "500"}],
        }, format="json")
        force_authenticate(request, user=self.admin)
        response = AssetListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["allocations"]), 1)
        self.cash.refresh_from_db()
        self.assertEqual(self.cash.balance, Decimal("999500"))

    def test_create_existing_asset_without_method_allocations_succeeds(self):
        from .views import AssetListCreateView

        request = self.factory.post("/assets/items/", {
            "name": "Shed", "category": self.category.id, "acquisition_type": "existing",
            "cost": "500", "acquisition_date": str(timezone.localdate()),
        }, format="json")
        force_authenticate(request, user=self.admin)
        response = AssetListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["allocations"], [])

    def test_dispose_sold_without_method_allocations_returns_400(self):
        from .views import AssetDisposeView

        asset = create_asset(
            name="Forklift", category_id=self.category.id, acquisition_type="new",
            cost=Decimal("500"), acquisition_date=timezone.localdate(),
            method_allocations=[(self.cash, Decimal("500"))], user=self.admin,
        )
        request = self.factory.post(f"/assets/items/{asset.id}/dispose/", {
            "disposal_type": "sold", "disposal_date": str(timezone.localdate()), "sale_amount": "300",
        }, format="json")
        force_authenticate(request, user=self.admin)
        response = AssetDisposeView.as_view()(request, pk=asset.id)
        self.assertEqual(response.status_code, 400)
        self.assertIn("method_allocations", response.data)

    def test_dispose_scrapped_without_method_allocations_succeeds(self):
        from .views import AssetDisposeView

        asset = create_asset(
            name="Forklift", category_id=self.category.id, acquisition_type="new",
            cost=Decimal("500"), acquisition_date=timezone.localdate(),
            method_allocations=[(self.cash, Decimal("500"))], user=self.admin,
        )
        request = self.factory.post(f"/assets/items/{asset.id}/dispose/", {
            "disposal_type": "scrapped", "disposal_date": str(timezone.localdate()),
        }, format="json")
        force_authenticate(request, user=self.admin)
        response = AssetDisposeView.as_view()(request, pk=asset.id)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["allocations"], [])


class AssetAllocationQueryCountTests(AssetsTestBase):
    """architecture.md's STRICT O(1)-per-page rule — the allocations field
    (Phase 5 Batch C) must not N+1 as row count grows, including when the
    allocations are non-empty (new/sold assets, not just existing ones)."""

    def setUp(self):
        super().setUp()
        self.cash = PaymentMethod.objects.create(name="Cash", balance=Decimal("1000000"))

    def cash_split(self, amount):
        return [(self.cash, Decimal(amount))]

    def count_queries(self, view, url):
        request = self.factory.get(url)
        force_authenticate(request, user=self.admin)
        with CaptureQueriesContext(connection) as ctx:
            response = view(request)
            response.render()
        self.assertEqual(response.status_code, 200)
        return len(ctx.captured_queries)

    def test_asset_list_query_count_flat_with_real_allocations(self):
        view = AssetListCreateView.as_view()
        create_asset(
            name="Gen 1", category_id=self.category.id, acquisition_type="new",
            cost=Decimal("100"), acquisition_date=timezone.localdate(),
            method_allocations=self.cash_split("100"), user=self.admin,
        )
        get_asset_stats()  # stamp the depreciation-catchup marker first — see
        # AssetListQueryStabilityTests above; otherwise the FIRST list() call
        # pays the one-time O(assets-so-far) catch-up sweep and the second
        # doesn't, which has nothing to do with the allocations field this
        # test is actually guarding.
        baseline = self.count_queries(view, "/assets/items/")

        for i in range(4):
            create_asset(
                name=f"Gen {i}", category_id=self.category.id, acquisition_type="new",
                cost=Decimal("100"), acquisition_date=timezone.localdate(),
                method_allocations=self.cash_split("100"), user=self.admin,
            )
        grown = self.count_queries(view, "/assets/items/")
        self.assertEqual(baseline, grown)

    def test_asset_disposal_list_query_count_flat(self):
        view = AssetDisposalListView.as_view()
        assets = [
            create_asset(
                name=f"Disposable {i}", category_id=self.category.id, acquisition_type="new",
                cost=Decimal("100"), acquisition_date=timezone.localdate(),
                method_allocations=self.cash_split("100"), user=self.admin,
            )
            for i in range(5)
        ]
        dispose_asset(
            asset_id=assets[0].id, disposal_type="sold", disposal_date=timezone.localdate(),
            sale_amount=Decimal("50"), method_allocations=self.cash_split("50"), user=self.admin,
        )
        baseline = self.count_queries(view, "/assets/disposals/")

        for a in assets[1:]:
            dispose_asset(
                asset_id=a.id, disposal_type="sold", disposal_date=timezone.localdate(),
                sale_amount=Decimal("50"), method_allocations=self.cash_split("50"), user=self.admin,
            )
        grown = self.count_queries(view, "/assets/disposals/")
        self.assertEqual(baseline, grown)


# ---------------------------------------------------------------------------
# depreciation_rate range validation
# ---------------------------------------------------------------------------
# depreciation_rate is a FRACTION stored as DecimalField(max_digits=5,
# decimal_places=4), so the column physically cannot hold more than 9.9999.
# Only `rate > 0` was validated, so entering 15 for "15%" was written
# successfully and then made EVERY later read of that row raise
# decimal.InvalidOperation — taking down the whole assets app until the row
# was deleted by hand. A silent write that bricks later reads is far worse
# than a rejected write.

class DepreciationRateValidationTests(TestCase):
    def setUp(self):
        self.admin = make_admin("rate-admin@example.com")

    def _create(self, rate):
        return create_asset_category(
            name=f"Cat {rate}", valuation_method="depreciation",
            depreciation_rate=Decimal(rate), user=self.admin,
        )

    def test_whole_number_percent_is_rejected(self):
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError) as ctx:
            self._create("15")
        self.assertIn("depreciation_rate", ctx.exception.detail)

    def test_rate_above_one_is_rejected(self):
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            self._create("1.5")

    def test_zero_and_negative_still_rejected(self):
        from rest_framework.exceptions import ValidationError

        for bad in ("0", "-0.1"):
            with self.assertRaises(ValidationError):
                self._create(bad)

    def test_valid_fraction_is_accepted_and_readable_afterwards(self):
        """The real damage was on READ, not write — so re-read the row."""
        cat = self._create("0.15")
        cat.refresh_from_db()
        self.assertEqual(cat.depreciation_rate, Decimal("0.1500"))
        self.assertEqual(str(cat), str(cat))          # forces field access

    def test_boundary_rate_of_one_is_allowed(self):
        cat = self._create("1")
        self.assertEqual(cat.depreciation_rate, Decimal("1"))

    def test_update_applies_the_same_range_check(self):
        """Both entry points must validate — update_asset_category could
        otherwise poison a row that create refused to."""
        from rest_framework.exceptions import ValidationError

        cat = self._create("0.10")
        with self.assertRaises(ValidationError):
            update_asset_category(pk=cat.id, depreciation_rate=Decimal("15"), user=self.admin)


# ---------------------------------------------------------------------------
# AssetFlow.total_current_worth is a live balance, not a cumulative counter
# ---------------------------------------------------------------------------

class AssetFlowClampTests(TestCase):
    def setUp(self):
        self.admin = make_admin("clamp-admin@example.com")

    def test_total_current_worth_is_not_floored_at_zero(self):
        """
        It used to be max(0, ...), which silently DISCARDED any excess when a
        delta would take it negative — so the total stopped matching
        sum(Asset.current_worth) and every later movement built on the wrong
        base, permanently and with no error. A negative value means the
        depreciation/disposal deltas have outrun what was added, which is a
        real bug worth surfacing rather than hiding.
        """
        from .services import _adjust_asset_flow

        af = AssetFlow.get_instance()
        af.total_current_worth = Decimal("100")
        af.save(update_fields=["total_current_worth"])

        _adjust_asset_flow(total_current_worth_delta=Decimal("-250"), user=self.admin)

        af.refresh_from_db()
        self.assertEqual(
            af.total_current_worth, Decimal("-150"),
            "the 150 overshoot must be retained, not clamped away",
        )

    def test_cumulative_counters_keep_their_floor(self):
        """Guards against over-correcting: the genuinely one-way counters
        should still be floored, since a negative there is meaningless."""
        from .services import _adjust_asset_flow

        af = AssetFlow.get_instance()
        af.total_accumulated_depreciation = Decimal("50")
        af.save(update_fields=["total_accumulated_depreciation"])

        _adjust_asset_flow(
            total_accumulated_depreciation_delta=Decimal("-500"), user=self.admin,
        )

        af.refresh_from_db()
        self.assertEqual(af.total_accumulated_depreciation, Decimal("0"))
