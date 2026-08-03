from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from users.models import User

from .models import CashManagementFlow, Investor, InvestorValuationEntry
from .selectors import get_all_investors, get_cash_management_stats
from .services import (
    _add_months, create_investor, create_investor_transaction, delete_investor,
)


def make_admin(email="admin@example.com"):
    return User.objects.create_user(
        email=email, password="Adm1n-secret!", first_name="Admin",
        last_name="User", is_staff=True,
    )


class InvestorGrowthCatchUpTests(TestCase):
    """The month-marker gate must skip work when current and post the exact
    same compounded entries as the old per-request loop when stale."""

    def setUp(self):
        self.admin = make_admin()
        from data_entry.services import create_opening_cash
        create_opening_cash(amount=Decimal("50000"), user=self.admin)

        # 12%/year → 1%/month, invested 1000.
        self.investor = create_investor(name="Bilal", growth_rate=Decimal("0.12"), user=self.admin)
        create_investor_transaction(
            investor_id=self.investor.id, transaction_type="investment",
            amount=Decimal("1000"), transaction_date=timezone.now().date(), user=self.admin,
        )

    def _backdate_two_months_and_reset_marker(self):
        today = timezone.localdate()
        y, m = _add_months(today.year, today.month, -2)
        Investor.objects.filter(pk=self.investor.pk).update(
            created_at=timezone.now().replace(year=y, month=m, day=1),
        )
        CashManagementFlow.objects.filter(pk=1).update(growth_caught_up_through="")

    def test_stale_marker_posts_compounded_months_then_goes_idle(self):
        self._backdate_two_months_and_reset_marker()

        get_cash_management_stats()

        # Two elapsed months at 1%: 1000 → 1010 → 1020.10, one entry each.
        entries = InvestorValuationEntry.objects.filter(investor=self.investor).order_by("period")
        self.assertEqual(entries.count(), 2)
        self.assertEqual(entries[0].amount, Decimal("10.0000"))
        self.assertEqual(entries[1].amount, Decimal("10.1000"))
        self.investor.refresh_from_db()
        self.assertEqual(self.investor.current_worth, Decimal("1020.1000"))

        # Marker stamped with the current month → subsequent reads post nothing.
        today = timezone.localdate()
        cmf = CashManagementFlow.get_instance()
        self.assertEqual(cmf.growth_caught_up_through, f"{today.year:04d}-{today.month:02d}")
        get_cash_management_stats()
        get_all_investors()
        self.assertEqual(InvestorValuationEntry.objects.filter(investor=self.investor).count(), 2)

    def test_duplicate_month_posting_is_impossible(self):
        self._backdate_two_months_and_reset_marker()
        get_cash_management_stats()
        entry = InvestorValuationEntry.objects.filter(investor=self.investor).first()

        # uniq_investor_valuation_period — the DB refuses a second row for
        # the same investor+month, so concurrent catch-ups can't double-post.
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                InvestorValuationEntry.objects.create(
                    investor=self.investor, period=entry.period,
                    rate_applied=entry.rate_applied, worth_before=0, worth_after=0, amount=0,
                )


class DeleteInvestorGuardTests(TestCase):
    def test_delete_blocked_with_transactions_allowed_without(self):
        admin = make_admin()
        from data_entry.services import create_opening_cash
        create_opening_cash(amount=Decimal("10000"), user=admin)

        investor = create_investor(name="Bilal", user=admin)
        create_investor_transaction(
            investor_id=investor.id, transaction_type="investment",
            amount=Decimal("500"), transaction_date=timezone.now().date(), user=admin,
        )
        with self.assertRaises(ValidationError):
            delete_investor(pk=investor.pk, user=admin)

        empty = create_investor(name="Sara", user=admin)
        delete_investor(pk=empty.pk, user=admin)
        empty.refresh_from_db()
        self.assertTrue(empty.is_deleted)


class SearchTests(TestCase):
    def test_investor_search_via_search_q(self):
        admin = make_admin()
        create_investor(name="Bilal Ahmed", email="bilal@x.com", user=admin)
        create_investor(name="Sara Khan", contact_number="0300-1234567", user=admin)

        self.assertEqual([i.name for i in get_all_investors(search="BILAL")], ["Bilal Ahmed"])
        self.assertEqual([i.name for i in get_all_investors(search="1234")], ["Sara Khan"])
        self.assertEqual(list(get_all_investors(search="nomatch")), [])
