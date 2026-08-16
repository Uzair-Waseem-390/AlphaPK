from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from users.models import User

from .models import PaymentAllocation, PaymentMethod
from .services import create_method, soft_delete_method, update_method
from .views import PaymentMethodListCreateView, PaymentMethodRetrieveUpdateDestroyView


def make_admin(email="admin@example.com"):
    return User.objects.create_user(
        email=email, password="Adm1n-secret!", first_name="Admin",
        last_name="User", is_staff=True,
    )


def make_normal_user(email="normal@example.com"):
    return User.objects.create_user(
        email=email, password="N0rmal-secret!", first_name="Normal", last_name="User",
    )


# ---------------------------------------------------------------------------
# Model / service tests
# ---------------------------------------------------------------------------

class PaymentMethodServiceTests(TestCase):
    def setUp(self):
        self.admin = make_admin()

    def test_create_method(self):
        m = create_method(name="JazzCash", account_number="0300-1234567", user=self.admin)
        self.assertEqual(m.name, "JazzCash")
        self.assertEqual(m.balance, Decimal("0"))
        self.assertFalse(m.is_protected)

    def test_duplicate_name_rejected_case_insensitive(self):
        create_method(name="JazzCash", user=self.admin)
        with self.assertRaises(ValidationError):
            create_method(name="jazzcash", user=self.admin)

    def test_blank_name_rejected(self):
        with self.assertRaises(ValidationError):
            create_method(name="   ", user=self.admin)

    def test_update_method_renames(self):
        m = create_method(name="Easypaisa", user=self.admin)
        updated = update_method(pk=m.pk, name="EasyPaisa Business", user=self.admin)
        self.assertEqual(updated.name, "EasyPaisa Business")

    def test_update_rejects_duplicate_name(self):
        create_method(name="Bank A", user=self.admin)
        m2 = create_method(name="Bank B", user=self.admin)
        with self.assertRaises(ValidationError):
            update_method(pk=m2.pk, name="Bank A", user=self.admin)

    def test_protected_method_cannot_be_renamed(self):
        cash = PaymentMethod.objects.create(name="Cash", is_protected=True)
        with self.assertRaises(ValidationError):
            update_method(pk=cash.pk, name="Not Cash", user=self.admin)

    def test_protected_method_cannot_be_deleted(self):
        cash = PaymentMethod.objects.create(name="Cash", is_protected=True)
        with self.assertRaises(ValidationError):
            soft_delete_method(pk=cash.pk, user=self.admin)

    def test_delete_blocked_while_balance_nonzero(self):
        m = PaymentMethod.objects.create(name="JazzCash", balance=Decimal("500"))
        with self.assertRaises(ValidationError):
            soft_delete_method(pk=m.pk, user=self.admin)
        m.refresh_from_db()
        self.assertFalse(m.is_deleted)

    def test_delete_allowed_at_exactly_zero_balance(self):
        m = PaymentMethod.objects.create(name="JazzCash", balance=Decimal("0"))
        soft_delete_method(pk=m.pk, user=self.admin)
        m.refresh_from_db()
        self.assertTrue(m.is_deleted)

    def test_soft_deleted_method_excluded_from_default_manager(self):
        m = PaymentMethod.objects.create(name="JazzCash", balance=Decimal("0"))
        soft_delete_method(pk=m.pk, user=self.admin)
        self.assertFalse(PaymentMethod.objects.filter(pk=m.pk).exists())
        self.assertTrue(PaymentMethod.all_objects.filter(pk=m.pk).exists())


# ---------------------------------------------------------------------------
# Backfill command tests
# ---------------------------------------------------------------------------

class SeedAndBackfillCommandTests(TestCase):
    def setUp(self):
        self.admin = make_admin()

    def test_creates_protected_cash_row_with_matching_balance(self):
        from data_entry.services import create_opening_cash
        create_opening_cash(amount=Decimal("10000"), user=self.admin)

        call_command("seed_and_backfill_payment_methods")

        cash = PaymentMethod.objects.get(name="Cash")
        self.assertTrue(cash.is_protected)
        self.assertEqual(cash.balance, Decimal("10000.0000"))

        from cash_flow.models import CashFlow
        self.assertEqual(cash.balance, CashFlow.get_instance().cash_in_hand)

    def test_backfills_one_allocation_per_active_cash_movement(self):
        from cash_flow.models import CashMovement
        from data_entry.services import create_opening_cash

        create_opening_cash(amount=Decimal("5000"), user=self.admin)
        expected_movements = CashMovement.objects.filter(is_deleted=False).count()

        call_command("seed_and_backfill_payment_methods")

        cash = PaymentMethod.objects.get(name="Cash")
        self.assertEqual(
            PaymentAllocation.objects.filter(payment_method=cash, is_deleted=False).count(),
            expected_movements,
        )

    def test_rerun_is_idempotent(self):
        from data_entry.services import create_opening_cash
        create_opening_cash(amount=Decimal("5000"), user=self.admin)

        call_command("seed_and_backfill_payment_methods")
        first_count = PaymentAllocation.objects.count()
        first_method_count = PaymentMethod.objects.count()

        call_command("seed_and_backfill_payment_methods")

        self.assertEqual(PaymentMethod.objects.count(), first_method_count)
        self.assertEqual(PaymentAllocation.objects.count(), first_count)

    def test_three_way_balance_cross_check(self):
        from django.db.models import Sum

        from data_entry.services import create_opening_cash
        from cash_flow.models import CashFlow
        from cash_management.services import create_investor, create_investor_transaction

        create_opening_cash(amount=Decimal("20000"), user=self.admin)
        investor = create_investor(name="Bilal", user=self.admin)
        create_investor_transaction(
            investor_id=investor.id, transaction_type="investment",
            amount=Decimal("3000"), transaction_date="2026-01-01", user=self.admin,
        )

        call_command("seed_and_backfill_payment_methods")

        cash = PaymentMethod.objects.get(name="Cash")
        cash_in_hand = CashFlow.get_instance().cash_in_hand

        inflow = PaymentAllocation.objects.filter(
            payment_method=cash, is_deleted=False, direction=PaymentAllocation.Direction.INFLOW,
        ).aggregate(t=Sum("amount"))["t"] or Decimal("0")
        outflow = PaymentAllocation.objects.filter(
            payment_method=cash, is_deleted=False, direction=PaymentAllocation.Direction.OUTFLOW,
        ).aggregate(t=Sum("amount"))["t"] or Decimal("0")

        self.assertEqual(cash.balance, cash_in_hand)
        self.assertEqual(inflow - outflow, cash_in_hand)


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

class PaymentMethodAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = make_admin()
        self.normal = make_normal_user()

    def test_non_admin_gets_403_on_create(self):
        request = self.factory.post("/payment-methods/", {"name": "JazzCash"}, format="json")
        force_authenticate(request, user=self.normal)
        response = PaymentMethodListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_list_and_update(self):
        create_request = self.factory.post("/payment-methods/", {"name": "JazzCash"}, format="json")
        force_authenticate(create_request, user=self.admin)
        create_response = PaymentMethodListCreateView.as_view()(create_request)
        self.assertEqual(create_response.status_code, 201)
        method_id = create_response.data["id"]

        list_request = self.factory.get("/payment-methods/")
        force_authenticate(list_request, user=self.admin)
        list_response = PaymentMethodListCreateView.as_view()(list_request)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data["count"], 1)
        self.assertEqual(len(list_response.data["results"]), 1)

        patch_request = self.factory.patch(
            f"/payment-methods/{method_id}/", {"name": "JazzCash Business"}, format="json",
        )
        force_authenticate(patch_request, user=self.admin)
        patch_response = PaymentMethodRetrieveUpdateDestroyView.as_view()(patch_request, pk=method_id)
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data["name"], "JazzCash Business")

    def test_protected_row_edit_and_delete_return_clean_400_not_500(self):
        cash = PaymentMethod.objects.create(name="Cash", is_protected=True)

        patch_request = self.factory.patch(
            f"/payment-methods/{cash.pk}/", {"name": "Not Cash"}, format="json",
        )
        force_authenticate(patch_request, user=self.admin)
        patch_response = PaymentMethodRetrieveUpdateDestroyView.as_view()(patch_request, pk=cash.pk)
        self.assertEqual(patch_response.status_code, 400)

        delete_request = self.factory.delete(f"/payment-methods/{cash.pk}/")
        force_authenticate(delete_request, user=self.admin)
        delete_response = PaymentMethodRetrieveUpdateDestroyView.as_view()(delete_request, pk=cash.pk)
        self.assertEqual(delete_response.status_code, 400)

    def test_delete_blocked_while_balance_nonzero_returns_400(self):
        m = PaymentMethod.objects.create(name="JazzCash", balance=Decimal("100"))
        delete_request = self.factory.delete(f"/payment-methods/{m.pk}/")
        force_authenticate(delete_request, user=self.admin)
        response = PaymentMethodRetrieveUpdateDestroyView.as_view()(delete_request, pk=m.pk)
        self.assertEqual(response.status_code, 400)
