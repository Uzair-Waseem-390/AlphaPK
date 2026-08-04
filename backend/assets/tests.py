from datetime import date
from decimal import Decimal

from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from users.models import User

from .models import AssetFlow, AssetValuationEntry
from .selectors import get_all_assets, get_asset_stats
from .services import _add_months, create_asset, create_asset_category, update_asset_category
from .views import AssetListCreateView


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
