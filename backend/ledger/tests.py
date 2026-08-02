from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from purchases.models import PurchaseOrder, SupplierPayment
from purchases.services import create_supplier
from users.models import User

from .models import SupplierLedgerSnapshot
from .services import (
    add_payment_entry, add_purchase_entry, remove_ledger_entry_for_payment,
)
from .views import SupplierLedgerDetailView, SupplierLedgerListView


def make_admin(email="admin@example.com"):
    return User.objects.create_user(
        email=email, password="Adm1n-secret!", first_name="Admin",
        last_name="User", is_staff=True,
    )


def make_normal_user(email="normal@example.com"):
    return User.objects.create_user(
        email=email, password="N0rmal-secret!", first_name="Normal", last_name="User",
    )


class LedgerTestBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = make_admin()
        # Through the service so the ledger is auto-created.
        self.supplier = create_supplier(name="Ali Traders", code="ALI", user=self.admin)
        self.ledger = self.supplier.ledger

    def add_purchase(self, amount, on_date, order_number="PO-2026-0001"):
        order = PurchaseOrder.objects.create(order_number=order_number, supplier=self.supplier)
        return add_purchase_entry(
            supplier=self.supplier, purchase_order=order,
            amount=Decimal(amount), date=on_date, user=self.admin,
        )

    def add_payment(self, amount, on_date, reference="SPY-2026-0001", order_number="PO-2026-0900"):
        order = PurchaseOrder.objects.create(order_number=order_number, supplier=self.supplier)
        payment = SupplierPayment.objects.create(
            order=order, reference_number=reference,
            amount=Decimal(amount), method="cash", payment_date=on_date,
        )
        return add_payment_entry(
            supplier=self.supplier, supplier_payment=payment,
            amount=Decimal(amount), date=on_date, user=self.admin,
        )

    def snapshot(self, year_month):
        return SupplierLedgerSnapshot.objects.get(ledger=self.ledger, year_month=year_month)


class SnapshotCorrectnessTests(LedgerTestBase):
    def test_single_month_snapshot(self):
        self.add_purchase("1000", date(2026, 6, 5))
        self.add_payment("400", date(2026, 6, 20))
        self.assertEqual(self.snapshot("2026-06").closing_balance, Decimal("600"))

    def test_backdated_entry_recalculates_later_months(self):
        self.add_purchase("1000", date(2026, 6, 5))
        self.add_payment("400", date(2026, 7, 10))
        self.assertEqual(self.snapshot("2026-06").closing_balance, Decimal("1000"))
        self.assertEqual(self.snapshot("2026-07").closing_balance, Decimal("600"))

        # Backdated June payment must ripple through July's snapshot too.
        self.add_payment("200", date(2026, 6, 25), reference="SPY-2026-0002", order_number="PO-2026-0901")
        self.assertEqual(self.snapshot("2026-06").closing_balance, Decimal("800"))
        self.assertEqual(self.snapshot("2026-07").closing_balance, Decimal("400"))

    def test_month_boundaries_land_in_correct_snapshots(self):
        # date__startswith → range rewrite must keep exact month boundaries:
        # Aug 31 belongs to August, Sep 1 to September.
        self.add_purchase("100", date(2026, 8, 31))
        self.add_purchase("50", date(2026, 9, 1), order_number="PO-2026-0002")
        self.assertEqual(self.snapshot("2026-08").closing_balance, Decimal("100"))
        self.assertEqual(self.snapshot("2026-09").closing_balance, Decimal("150"))

    def test_removing_payment_entry_recalculates(self):
        self.add_purchase("1000", date(2026, 6, 5))
        entry = self.add_payment("400", date(2026, 6, 20))
        remove_ledger_entry_for_payment(supplier_payment=entry.supplier_payment)
        self.assertEqual(self.snapshot("2026-06").closing_balance, Decimal("1000"))


class LedgerDetailViewTests(LedgerTestBase):
    def get_detail(self, **params):
        request = self.factory.get(f"/ledger/{self.ledger.pk}/", params)
        force_authenticate(request, user=self.admin)
        return SupplierLedgerDetailView.as_view()(request, pk=self.ledger.pk)

    def test_running_balance_full_history(self):
        self.add_purchase("1000", date(2026, 6, 5))
        self.add_payment("400", date(2026, 7, 10))

        response = self.get_detail()
        self.assertEqual(response.status_code, 200)
        balances = [r["balance"] for r in response.data["results"]]
        self.assertEqual(balances, ["1000.0000", "600.0000"])
        self.assertEqual(response.data["closing_balance"], Decimal("600"))

    def test_date_from_string_param_uses_snapshot_opening_balance(self):
        # date_from arrives as a raw query-param STRING — this path used to
        # crash on .strftime before reaching the snapshot logic.
        self.add_purchase("1000", date(2026, 6, 5))
        self.add_payment("400", date(2026, 7, 10))

        response = self.get_detail(date_from="2026-07-01")
        self.assertEqual(response.status_code, 200)
        # Only July's payment is shown, with the June closing balance
        # (1000) carried in — so its running balance is 600.
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["balance"], "600.0000")
        self.assertEqual(response.data["closing_balance"], Decimal("600"))

    def test_entry_type_filter_keeps_full_history_balances(self):
        self.add_purchase("1000", date(2026, 6, 5))
        self.add_payment("400", date(2026, 7, 10))

        response = self.get_detail(entry_type="payment")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        # The payment's balance still reflects the full history (1000 - 400).
        self.assertEqual(response.data["results"][0]["balance"], "600.0000")


class LedgerPermissionTests(LedgerTestBase):
    def test_normal_user_cannot_list_ledgers(self):
        request = self.factory.get("/ledger/")
        force_authenticate(request, user=make_normal_user())
        response = SupplierLedgerListView.as_view()(request)
        self.assertEqual(response.status_code, 403)

    def test_search_by_name_still_works(self):
        request = self.factory.get("/ledger/", {"search": "ali"})
        force_authenticate(request, user=self.admin)
        response = SupplierLedgerListView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["supplier_code"], "ALI")
