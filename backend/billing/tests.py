from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from purchases.models import Category, Inventory, Product, PurchaseReturn, Shelf
from purchases.services import (
    confirm_purchase_order, create_purchase_order, create_supplier,
    set_purchase_item_shelf_allocations,
)
from rates.services import create_rate
from users.models import User

from .models import Invoice, Payment, Return
from .services import (
    DEFAULT_DUE_DATE_DAYS, accept_return, cancel_return, confirm_invoice,
    create_customer, create_invoice, create_payment, create_return,
    delete_invoice, delete_payment, set_invoice_item_shelf_allocations,
    set_return_item_shelf_allocations, update_invoice_due_date,
    update_invoice_items, update_return_items,
)
from .views import (
    CustomerListCreateView, DraftInvoiceListView, DueInvoiceListView,
    InvoiceConfirmView, InvoiceDueDateUpdateView, InvoiceListCreateView,
    ReturnRetrieveUpdateDestroyView,
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


class BillingTestBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = make_admin()
        self.category = Category.objects.create(name="Cat A")
        self.shelf = Shelf.objects.create(name="Shelf A")
        self.supplier = create_supplier(name="Ali Traders", code="ALI", user=self.admin)
        self.customer = create_customer(
            name="Big Mart", code="BM", address="Main St", user=self.admin,
        )

    def make_stocked_product(self, code="P001", name="Product 1", *, stock=10,
                             unit_cost="50", selling_price="100"):
        """Product with a rate and a confirmed PO providing FIFO stock."""
        product = Product.objects.create(
            name=name, code=code, category=self.category,
        )
        create_rate(product_id=product.id, selling_price=Decimal(selling_price), user=self.admin)
        order = create_purchase_order(
            supplier_id=self.supplier.id,
            items=[{"product_id": product.id, "quantity": stock, "unit_price": Decimal(unit_cost)}],
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

    def allocate_invoice_items(self, invoice):
        for item in invoice.items.all():
            set_invoice_item_shelf_allocations(
                invoice_item_id=item.id,
                allocations=[{"shelf_id": self.shelf.id, "quantity": item.quantity}],
                user=self.admin,
            )

    def allocate_return_items(self, return_record):
        for return_item in return_record.items.all():
            set_return_item_shelf_allocations(
                return_item_id=return_item.id,
                allocations=[{"shelf_id": self.shelf.id, "quantity": return_item.quantity}],
                user=self.admin,
            )

    def make_confirmed_invoice(self, product, quantity=4):
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": quantity}],
            user=self.admin,
        )
        self.allocate_invoice_items(invoice)
        return confirm_invoice(invoice_id=invoice.id, user=self.admin)


class BillingReferenceTests(BillingTestBase):
    def test_sequential_bill_numbers(self):
        product = self.make_stocked_product()
        year = timezone.now().year
        i1 = create_invoice(customer_id=self.customer.id,
                            items=[{"product_id": product.id, "quantity": 1}], user=self.admin)
        i2 = create_invoice(customer_id=self.customer.id,
                            items=[{"product_id": product.id, "quantity": 1}], user=self.admin)
        self.assertEqual(i1.bill_number, f"BILL-{year}-0001")
        self.assertEqual(i2.bill_number, f"BILL-{year}-0002")

    def test_soft_deleted_payment_reference_never_collides(self):
        # The old generator queried through the soft-delete manager, so a
        # soft-deleted payment holding the max reference caused the next
        # create to collide with its unique reference (500).
        product = self.make_stocked_product()
        invoice = self.make_confirmed_invoice(product, quantity=4)
        year = timezone.now().year
        # Legacy soft-deleted payment holds PAY-…-0007, invisible to the
        # soft-delete manager — the counter must still seed past it.
        Payment.all_objects.create(
            invoice=invoice, reference_number=f"PAY-{year}-0007",
            amount=Decimal("10"), method="cash",
            payment_date=timezone.now().date(), is_deleted=True,
        )
        payment = create_payment(
            invoice_id=invoice.id, amount=Decimal("50"), method="cash",
            payment_date=timezone.now().date(), user=self.admin,
        )
        self.assertEqual(payment.reference_number, f"PAY-{year}-0008")

    def test_billing_return_sequence_independent_from_purchase_returns(self):
        # Both apps format returns as RTN-<year>-#### (unique per table);
        # billing's counter must not be seeded or advanced by purchase returns.
        year = timezone.now().year
        from purchases.models import PurchaseOrder
        order = PurchaseOrder.objects.create(order_number=f"PO-{year}-0999", supplier=self.supplier)
        PurchaseReturn.objects.create(order=order, reference_number=f"RTN-{year}-0005")

        product = self.make_stocked_product()
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()
        billing_return = create_return(
            invoice_id=invoice.id,
            items=[{"invoice_item_id": item.id, "quantity": 1}],
            user=self.admin,
        )
        self.assertEqual(billing_return.reference_number, f"RTN-{year}-0001")


class InvoiceLifecycleTests(BillingTestBase):
    def test_confirm_snapshots_prices_fifo_and_inventory(self):
        product = self.make_stocked_product(stock=10, unit_cost="50", selling_price="100")
        invoice = self.make_confirmed_invoice(product, quantity=4)

        item = invoice.items.first()
        self.assertEqual(item.selling_price, Decimal("100"))
        self.assertEqual(item.cogs_per_unit, Decimal("50"))
        self.assertEqual(item.line_total, Decimal("400"))
        self.assertEqual(item.line_cogs, Decimal("200"))
        self.assertEqual(invoice.grand_total, Decimal("400"))
        self.assertEqual(invoice.credit_outstanding, Decimal("400"))
        self.assertEqual(Inventory.objects.get(product=product).quantity, 6)

    def test_payment_updates_summary_and_blocks_overpayment(self):
        product = self.make_stocked_product()
        invoice = self.make_confirmed_invoice(product, quantity=4)  # grand 400

        create_payment(invoice_id=invoice.id, amount=Decimal("150"), method="cash",
                       payment_date=timezone.now().date(), user=self.admin)
        invoice.refresh_from_db()
        self.assertEqual(invoice.cash_received, Decimal("150"))
        self.assertEqual(invoice.credit_outstanding, Decimal("250"))
        self.assertEqual(invoice.payment_status, Invoice.PaymentStatus.PARTIAL)

        with self.assertRaises(ValidationError):
            create_payment(invoice_id=invoice.id, amount=Decimal("1000"), method="cash",
                           payment_date=timezone.now().date(), user=self.admin)

    def test_return_restores_stock_and_credits_customer(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)  # inventory 6
        item = invoice.items.first()

        ret = create_return(invoice_id=invoice.id,
                            items=[{"invoice_item_id": item.id, "quantity": 2}],
                            user=self.admin)
        self.allocate_return_items(ret)
        accept_return(return_id=ret.id, user=self.admin)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PARTIAL)
        # credit note of 200 (2 × 100) reduces outstanding: 400 - 200
        self.assertEqual(invoice.credit_outstanding, Decimal("200"))
        self.assertEqual(Inventory.objects.get(product=product).quantity, 8)

    def test_delete_payment_resyncs_summary(self):
        product = self.make_stocked_product()
        invoice = self.make_confirmed_invoice(product, quantity=4)
        payment = create_payment(invoice_id=invoice.id, amount=Decimal("150"), method="cash",
                                 payment_date=timezone.now().date(), user=self.admin)
        delete_payment(payment_id=payment.id, user=self.admin)
        invoice.refresh_from_db()
        self.assertEqual(invoice.cash_received, Decimal("0"))
        self.assertEqual(invoice.credit_outstanding, Decimal("400"))
        self.assertEqual(invoice.payment_status, Invoice.PaymentStatus.UNPAID)


class ReturnEditCancelTests(BillingTestBase):
    """
    A pending return has zero side effects until accepted, so editing or
    cancelling one should be free of any inventory/FIFO/payment
    consequence, and should never block creating further returns against
    the same invoice — whether the prior return was cancelled or already
    accepted.
    """

    def test_edit_replaces_items_and_resets_allocations(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()

        ret = create_return(invoice_id=invoice.id,
                             items=[{"invoice_item_id": item.id, "quantity": 2}],
                             user=self.admin)
        self.allocate_return_items(ret)
        self.assertEqual(ret.items.first().allocated_quantity, 2)

        updated = update_return_items(
            return_id=ret.id,
            items=[{"invoice_item_id": item.id, "quantity": 3}],
            note="revised",
            user=self.admin,
        )

        self.assertEqual(updated.items.count(), 1)
        new_item = updated.items.first()
        self.assertEqual(new_item.quantity, 3)
        self.assertEqual(new_item.allocated_quantity, 0)  # old allocations cascaded away
        self.assertEqual(updated.note, "revised")

    def test_edit_revalidates_against_current_returnable_quantity(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()

        ret = create_return(invoice_id=invoice.id,
                             items=[{"invoice_item_id": item.id, "quantity": 2}],
                             user=self.admin)

        with self.assertRaises(ValidationError):
            update_return_items(
                return_id=ret.id,
                items=[{"invoice_item_id": item.id, "quantity": 999}],
                user=self.admin,
            )

    def test_edit_blocked_once_accepted(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()
        ret = create_return(invoice_id=invoice.id,
                             items=[{"invoice_item_id": item.id, "quantity": 2}],
                             user=self.admin)
        self.allocate_return_items(ret)
        accept_return(return_id=ret.id, user=self.admin)

        with self.assertRaises(ValidationError):
            update_return_items(
                return_id=ret.id,
                items=[{"invoice_item_id": item.id, "quantity": 1}],
                user=self.admin,
            )

    def test_cancel_soft_deletes_and_disappears_from_list(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()
        ret = create_return(invoice_id=invoice.id,
                             items=[{"invoice_item_id": item.id, "quantity": 2}],
                             user=self.admin)

        cancel_return(return_id=ret.id, user=self.admin)

        self.assertFalse(Return.objects.filter(id=ret.id).exists())
        self.assertTrue(Return.all_objects.get(id=ret.id).is_deleted)
        # Invoice and inventory are untouched — a pending return never had
        # any side effect to reverse.
        invoice.refresh_from_db()
        self.assertEqual(invoice.credit_outstanding, Decimal("400"))
        self.assertEqual(Inventory.objects.get(product=product).quantity, 6)

    def test_cancel_blocked_once_accepted(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()
        ret = create_return(invoice_id=invoice.id,
                             items=[{"invoice_item_id": item.id, "quantity": 2}],
                             user=self.admin)
        self.allocate_return_items(ret)
        accept_return(return_id=ret.id, user=self.admin)

        with self.assertRaises(ValidationError):
            cancel_return(return_id=ret.id, user=self.admin)

    def test_can_create_another_return_after_cancelling(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()

        ret_a = create_return(invoice_id=invoice.id,
                               items=[{"invoice_item_id": item.id, "quantity": 2}],
                               user=self.admin)
        cancel_return(return_id=ret_a.id, user=self.admin)

        ret_b = create_return(invoice_id=invoice.id,
                               items=[{"invoice_item_id": item.id, "quantity": 2}],
                               user=self.admin)
        self.assertEqual(ret_b.items.first().quantity, 2)

    def test_can_create_another_return_after_accepting(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()

        ret_a = create_return(invoice_id=invoice.id,
                               items=[{"invoice_item_id": item.id, "quantity": 2}],
                               user=self.admin)
        self.allocate_return_items(ret_a)
        accept_return(return_id=ret_a.id, user=self.admin)

        item.refresh_from_db()
        self.assertEqual(item.returnable_quantity, 2)

        ret_b = create_return(invoice_id=invoice.id,
                               items=[{"invoice_item_id": item.id, "quantity": 2}],
                               user=self.admin)
        self.assertEqual(ret_b.items.first().quantity, 2)

    def test_non_admin_can_edit_and_cancel_own_pending_return(self):
        # Return create/edit/cancel are IsAuthenticated (same level as
        # create) — only accept is admin-gated.
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()
        ret = create_return(invoice_id=invoice.id,
                             items=[{"invoice_item_id": item.id, "quantity": 2}],
                             user=self.admin)

        normal = make_normal_user()
        view = ReturnRetrieveUpdateDestroyView.as_view()

        patch_request = self.factory.patch(
            f"/billing/returns/{ret.id}/",
            {"items": [{"invoice_item_id": item.id, "quantity": 1}]},
            format="json",
        )
        force_authenticate(patch_request, user=normal)
        patch_response = view(patch_request, pk=ret.id)
        self.assertEqual(patch_response.status_code, 200)

        delete_request = self.factory.delete(f"/billing/returns/{ret.id}/")
        force_authenticate(delete_request, user=normal)
        delete_response = view(delete_request, pk=ret.id)
        self.assertEqual(delete_response.status_code, 200)

    def test_unauthenticated_gets_401_on_update_and_cancel(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()
        ret = create_return(invoice_id=invoice.id,
                             items=[{"invoice_item_id": item.id, "quantity": 2}],
                             user=self.admin)

        view = ReturnRetrieveUpdateDestroyView.as_view()

        patch_request = self.factory.patch(
            f"/billing/returns/{ret.id}/",
            {"items": [{"invoice_item_id": item.id, "quantity": 1}]},
            format="json",
        )
        patch_response = view(patch_request, pk=ret.id)
        self.assertEqual(patch_response.status_code, 401)

        delete_request = self.factory.delete(f"/billing/returns/{ret.id}/")
        delete_response = view(delete_request, pk=ret.id)
        self.assertEqual(delete_response.status_code, 401)

    def test_update_and_cancel_query_counts(self):
        product = self.make_stocked_product(stock=10)
        invoice = self.make_confirmed_invoice(product, quantity=4)
        item = invoice.items.first()
        ret = create_return(invoice_id=invoice.id,
                             items=[{"invoice_item_id": item.id, "quantity": 2}],
                             user=self.admin)

        view = ReturnRetrieveUpdateDestroyView.as_view()

        with CaptureQueriesContext(connection) as ctx:
            patch_request = self.factory.patch(
                f"/billing/returns/{ret.id}/",
                {"items": [{"invoice_item_id": item.id, "quantity": 1}]},
                format="json",
            )
            force_authenticate(patch_request, user=self.admin)
            response = view(patch_request, pk=ret.id)
            self.assertEqual(response.status_code, 200)
        self.assertLess(len(ctx.captured_queries), 20)

        with CaptureQueriesContext(connection) as ctx:
            delete_request = self.factory.delete(f"/billing/returns/{ret.id}/")
            force_authenticate(delete_request, user=self.admin)
            response = view(delete_request, pk=ret.id)
            self.assertEqual(response.status_code, 200)
        self.assertLess(len(ctx.captured_queries), 12)


class PaymentAtomicityTests(BillingTestBase):
    def test_payment_rolls_back_if_cashflow_sync_fails(self):
        product = self.make_stocked_product()
        invoice = self.make_confirmed_invoice(product, quantity=4)

        with patch("cash_flow.services.sync_invoice_payment_received",
                   side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                create_payment(invoice_id=invoice.id, amount=Decimal("150"), method="cash",
                               payment_date=timezone.now().date(), user=self.admin)

        self.assertFalse(Payment.objects.filter(invoice=invoice).exists())
        invoice.refresh_from_db()
        self.assertEqual(invoice.cash_received, Decimal("0"))
        self.assertEqual(invoice.payment_status, Invoice.PaymentStatus.UNPAID)


class InvoiceQueryCountTests(BillingTestBase):
    def count_queries(self, view, url):
        request = self.factory.get(url)
        force_authenticate(request, user=self.admin)
        with CaptureQueriesContext(connection) as ctx:
            response = view(request)
            response.render()
        self.assertEqual(response.status_code, 200)
        return len(ctx.captured_queries)

    def test_confirmed_invoice_list_query_count_is_flat(self):
        view = InvoiceListCreateView.as_view()
        p1 = self.make_stocked_product("P001")
        self.make_confirmed_invoice(p1, quantity=2)
        baseline = self.count_queries(view, "/billing/invoices/")

        for i in range(3):
            p = self.make_stocked_product(f"P10{i}", f"Product 10{i}")
            self.make_confirmed_invoice(p, quantity=2)
        grown = self.count_queries(view, "/billing/invoices/")
        self.assertEqual(baseline, grown)

    def test_draft_preview_query_count_flat_in_item_count(self):
        # The preview needs one batches query per DRAFT (not per item) —
        # more line items must not add queries.
        view = DraftInvoiceListView.as_view()
        p1 = self.make_stocked_product("P001")
        create_invoice(customer_id=self.customer.id,
                       items=[{"product_id": p1.id, "quantity": 1}], user=self.admin)
        baseline = self.count_queries(view, "/billing/invoices/drafts/")

        # Replace the single draft with one holding 4 items.
        Invoice.all_objects.all().delete()
        products = [p1] + [
            self.make_stocked_product(f"P20{i}", f"Product 20{i}") for i in range(3)
        ]
        create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": p.id, "quantity": 1} for p in products],
            user=self.admin,
        )
        grown = self.count_queries(view, "/billing/invoices/drafts/")
        self.assertEqual(baseline, grown)


class InvoiceDateFilterTests(BillingTestBase):
    def setUp(self):
        super().setUp()
        product = self.make_stocked_product()
        self.old_invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}], user=self.admin,
        )
        self.new_invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}], user=self.admin,
        )
        Invoice.all_objects.filter(pk=self.old_invoice.pk).update(
            created_at=timezone.now() - timedelta(days=10),
        )

    def bill_numbers(self, **params):
        request = self.factory.get("/billing/invoices/", params)
        force_authenticate(request, user=self.admin)
        response = InvoiceListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        return {r["bill_number"] for r in response.data["results"]}

    def test_date_range_filters(self):
        today = timezone.localtime(timezone.now()).date().isoformat()
        cutoff = (timezone.localtime(timezone.now()).date() - timedelta(days=5)).isoformat()
        self.assertEqual(self.bill_numbers(date_from=today), {self.new_invoice.bill_number})
        self.assertEqual(self.bill_numbers(date_to=cutoff), {self.old_invoice.bill_number})
        self.assertEqual(self.bill_numbers(date=today), {self.new_invoice.bill_number})


class BillingPermissionTests(BillingTestBase):
    def test_normal_user_cannot_confirm_invoice(self):
        product = self.make_stocked_product()
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}], user=self.admin,
        )
        request = self.factory.post(f"/billing/invoices/{invoice.id}/confirm/")
        force_authenticate(request, user=make_normal_user())
        response = InvoiceConfirmView.as_view()(request, pk=invoice.id)
        self.assertEqual(response.status_code, 403)


class InvoiceAdvancePaymentTests(BillingTestBase):
    """Mirrors purchases.tests's advance-payment coverage for PurchaseOrder."""

    def test_advance_added_to_cash_in_hand_immediately_on_draft(self):
        from cash_flow.models import CashFlow

        product = self.make_stocked_product()
        cash_before = CashFlow.objects.get(pk=1).cash_in_hand

        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_type="advance", advance_amount=Decimal("300"),
            user=self.admin,
        )
        self.assertEqual(invoice.payment_type, "advance")
        self.assertEqual(invoice.advance_amount, Decimal("300"))

        cash_after = CashFlow.objects.get(pk=1).cash_in_hand
        self.assertEqual(cash_after, cash_before + Decimal("300"))

        adv_payment = Payment.objects.get(invoice=invoice)
        self.assertTrue(adv_payment.note.startswith("Advance payment"))
        self.assertEqual(adv_payment.amount, Decimal("300"))

    def test_advance_amount_edit_on_draft_adjusts_cash_by_delta(self):
        from cash_flow.models import CashFlow

        product = self.make_stocked_product()
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_type="advance", advance_amount=Decimal("300"),
            user=self.admin,
        )
        cash_after_create = CashFlow.objects.get(pk=1).cash_in_hand

        update_invoice_items(
            invoice_id=invoice.id,
            items=[{"product_id": product.id, "quantity": 1}],
            advance_amount=Decimal("500"), user=self.admin,
        )
        self.assertEqual(CashFlow.objects.get(pk=1).cash_in_hand, cash_after_create + Decimal("200"))
        invoice.refresh_from_db()
        self.assertEqual(invoice.advance_amount, Decimal("500"))

        # Exactly one advance Payment row must exist (updated in place, not duplicated).
        self.assertEqual(
            Payment.objects.filter(invoice=invoice, note__startswith="Advance payment").count(), 1,
        )

    def test_switch_from_advance_to_after_delivery_refunds_cash(self):
        from cash_flow.models import CashFlow

        product = self.make_stocked_product()
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_type="advance", advance_amount=Decimal("300"),
            user=self.admin,
        )
        cash_before_switch = CashFlow.objects.get(pk=1).cash_in_hand

        update_invoice_items(
            invoice_id=invoice.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_type="after_delivery", user=self.admin,
        )
        self.assertEqual(CashFlow.objects.get(pk=1).cash_in_hand, cash_before_switch - Decimal("300"))
        invoice.refresh_from_db()
        self.assertEqual(invoice.advance_amount, Decimal("0"))
        self.assertFalse(
            Payment.objects.filter(invoice=invoice, note__startswith="Advance payment", is_deleted=False).exists(),
        )

    def test_confirm_advance_invoice_reduces_credit_outstanding_by_advance(self):
        product = self.make_stocked_product(stock=10, unit_cost="50", selling_price="100")
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 4}],  # grand_total 400
            payment_type="advance", advance_amount=Decimal("150"),
            user=self.admin,
        )
        self.allocate_invoice_items(invoice)
        invoice = confirm_invoice(invoice_id=invoice.id, user=self.admin)

        self.assertEqual(invoice.grand_total, Decimal("400"))
        self.assertEqual(invoice.cash_received, Decimal("150"))
        self.assertEqual(invoice.total_paid, Decimal("150"))
        self.assertEqual(invoice.credit_outstanding, Decimal("250"))
        self.assertEqual(invoice.remaining_amount, Decimal("250"))
        self.assertEqual(invoice.payment_status, Invoice.PaymentStatus.PARTIAL)

    def test_confirm_caps_advance_exceeding_grand_total(self):
        from cash_flow.models import CashFlow

        product = self.make_stocked_product(stock=10, unit_cost="50", selling_price="100")
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],  # grand_total 100
            payment_type="advance", advance_amount=Decimal("100"),
            user=self.admin,
        )
        # Simulate the advance having been recorded before line items grew smaller
        # than the advance — directly shrink grand_total's future value by using
        # a 1-quantity item with a 100 advance is already exactly at the edge, so
        # bump the advance past what confirm will compute.
        Invoice.objects.filter(pk=invoice.pk).update(advance_amount=Decimal("500"))
        Payment.objects.filter(invoice=invoice).update(amount=Decimal("500"))

        self.allocate_invoice_items(invoice)
        cash_before_confirm = CashFlow.objects.get(pk=1).cash_in_hand
        invoice = confirm_invoice(invoice_id=invoice.id, user=self.admin)

        self.assertEqual(invoice.grand_total, Decimal("100"))
        self.assertEqual(invoice.advance_amount, Decimal("100"))  # capped
        self.assertEqual(invoice.credit_outstanding, Decimal("0"))
        self.assertEqual(invoice.payment_status, Invoice.PaymentStatus.PAID)
        # Confirming never moves cash_in_hand — only draft-creation/delete/edit do.
        self.assertEqual(CashFlow.objects.get(pk=1).cash_in_hand, cash_before_confirm)

        # The underlying advance Payment row must be capped too, or a later
        # _sync_invoice_payment_summary call would sum the uncapped amount.
        adv_payment = Payment.objects.get(invoice=invoice)
        self.assertEqual(adv_payment.amount, Decimal("100"))

    def test_delete_draft_advance_invoice_refunds_cash_and_soft_deletes_payment(self):
        from cash_flow.models import CashFlow

        product = self.make_stocked_product()
        cash_before = CashFlow.objects.get(pk=1).cash_in_hand
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_type="advance", advance_amount=Decimal("300"),
            user=self.admin,
        )
        self.assertEqual(CashFlow.objects.get(pk=1).cash_in_hand, cash_before + Decimal("300"))

        delete_invoice(invoice_id=invoice.id, user=self.admin)

        self.assertEqual(CashFlow.objects.get(pk=1).cash_in_hand, cash_before)
        invoice.refresh_from_db()
        self.assertTrue(invoice.is_deleted)
        adv_payment = Payment.all_objects.get(invoice=invoice)
        self.assertTrue(adv_payment.is_deleted)

    def test_cash_movement_recorded_for_advance_on_draft_invoice(self):
        from cash_flow.models import CashMovement

        product = self.make_stocked_product()
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_type="advance", advance_amount=Decimal("300"),
            user=self.admin,
        )
        payment = Payment.objects.get(invoice=invoice)
        movement = CashMovement.objects.get(source_model="billing.payment", source_id=payment.id)
        self.assertEqual(movement.movement_type, "advance_payment")
        self.assertEqual(movement.direction, "inflow")
        self.assertEqual(movement.amount, Decimal("300"))

    def test_backfill_cashflow_idempotent_with_draft_advance_invoice(self):
        from django.core.management import call_command
        from cash_flow.models import CashFlow

        product = self.make_stocked_product()
        create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_type="advance", advance_amount=Decimal("300"),
            user=self.admin,
        )
        call_command("backfill_cashflow", verbosity=0)
        first_run_cash = CashFlow.objects.get(pk=1).cash_in_hand

        call_command("backfill_cashflow", verbosity=0)
        second_run_cash = CashFlow.objects.get(pk=1).cash_in_hand

        self.assertEqual(first_run_cash, second_run_cash)


class InvoiceDueDateTests(BillingTestBase):
    def test_due_date_defaults_to_today_plus_7_when_omitted(self):
        product = self.make_stocked_product()
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}], user=self.admin,
        )
        expected = timezone.localtime(timezone.now()).date() + timedelta(days=DEFAULT_DUE_DATE_DAYS)
        self.assertEqual(invoice.payment_due_date, expected)

    def test_due_date_respects_explicit_value_on_create(self):
        product = self.make_stocked_product()
        explicit_date = timezone.localtime(timezone.now()).date() + timedelta(days=30)
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_due_date=explicit_date, user=self.admin,
        )
        self.assertEqual(invoice.payment_due_date, explicit_date)

    def test_due_date_editable_while_draft(self):
        product = self.make_stocked_product()
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}], user=self.admin,
        )
        new_date = timezone.localtime(timezone.now()).date() + timedelta(days=45)
        updated = update_invoice_items(
            invoice_id=invoice.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_due_date=new_date, user=self.admin,
        )
        self.assertEqual(updated.payment_due_date, new_date)

    def test_due_invoices_view_lists_only_overdue_outstanding_non_draft(self):
        product = self.make_stocked_product(stock=10)
        past_date = timezone.localtime(timezone.now()).date() - timedelta(days=1)
        future_date = timezone.localtime(timezone.now()).date() + timedelta(days=10)

        overdue_invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_due_date=past_date, user=self.admin,
        )
        self.allocate_invoice_items(overdue_invoice)
        confirm_invoice(invoice_id=overdue_invoice.id, user=self.admin)

        not_yet_due_invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_due_date=future_date, user=self.admin,
        )
        self.allocate_invoice_items(not_yet_due_invoice)
        confirm_invoice(invoice_id=not_yet_due_invoice.id, user=self.admin)

        # A draft with a past due date must never appear (drafts carry no
        # real outstanding balance yet).
        create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_due_date=past_date, user=self.admin,
        )

        request = self.factory.get("/billing/invoices/due/")
        force_authenticate(request, user=self.admin)
        response = DueInvoiceListView.as_view()(request)
        bill_numbers = {r["bill_number"] for r in response.data["results"]}

        self.assertEqual(bill_numbers, {overdue_invoice.bill_number})

    def test_partially_returned_invoice_still_counts_as_due(self):
        product = self.make_stocked_product(stock=10, unit_cost="50", selling_price="100")
        past_date = timezone.localtime(timezone.now()).date() - timedelta(days=1)
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 4}],
            payment_due_date=past_date, user=self.admin,
        )
        self.allocate_invoice_items(invoice)
        invoice = confirm_invoice(invoice_id=invoice.id, user=self.admin)
        item = invoice.items.first()

        ret = create_return(invoice_id=invoice.id,
                            items=[{"invoice_item_id": item.id, "quantity": 1}],
                            user=self.admin)
        self.allocate_return_items(ret)
        accept_return(return_id=ret.id, user=self.admin)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PARTIAL)
        self.assertGreater(invoice.credit_outstanding, Decimal("0"))

        request = self.factory.get("/billing/invoices/due/")
        force_authenticate(request, user=self.admin)
        response = DueInvoiceListView.as_view()(request)
        bill_numbers = {r["bill_number"] for r in response.data["results"]}
        self.assertIn(invoice.bill_number, bill_numbers)

    def test_update_invoice_due_date_rejects_draft(self):
        product = self.make_stocked_product()
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}], user=self.admin,
        )
        with self.assertRaises(ValidationError):
            update_invoice_due_date(
                invoice_id=invoice.id,
                new_due_date=timezone.localtime(timezone.now()).date() + timedelta(days=1),
                user=self.admin,
            )

    def test_extend_due_date_removes_invoice_from_due_list(self):
        product = self.make_stocked_product()
        past_date = timezone.localtime(timezone.now()).date() - timedelta(days=1)
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_due_date=past_date, user=self.admin,
        )
        self.allocate_invoice_items(invoice)
        invoice = confirm_invoice(invoice_id=invoice.id, user=self.admin)

        future_date = timezone.localtime(timezone.now()).date() + timedelta(days=10)
        update_invoice_due_date(invoice_id=invoice.id, new_due_date=future_date, user=self.admin)

        request = self.factory.get("/billing/invoices/due/")
        force_authenticate(request, user=self.admin)
        response = DueInvoiceListView.as_view()(request)
        bill_numbers = {r["bill_number"] for r in response.data["results"]}
        self.assertNotIn(invoice.bill_number, bill_numbers)

    def test_normal_user_cannot_extend_due_date(self):
        product = self.make_stocked_product()
        past_date = timezone.localtime(timezone.now()).date() - timedelta(days=1)
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": 1}],
            payment_due_date=past_date, user=self.admin,
        )
        self.allocate_invoice_items(invoice)
        invoice = confirm_invoice(invoice_id=invoice.id, user=self.admin)

        request = self.factory.patch(
            f"/billing/invoices/{invoice.id}/due-date/",
            {"payment_due_date": "2030-01-01"}, format="json",
        )
        force_authenticate(request, user=make_normal_user())
        response = InvoiceDueDateUpdateView.as_view()(request, pk=invoice.id)
        self.assertEqual(response.status_code, 403)


class CustomerTierFilterTests(BillingTestBase):
    def test_customer_list_filters_by_tier(self):
        from credit_score.models import CustomerCreditScore, ScoreTier

        good_customer = create_customer(
            name="Good Co", code="GOOD1", address="X", user=self.admin,
        )
        CustomerCreditScore.objects.filter(customer=good_customer).update(
            score=85, tier=ScoreTier.GOOD,
        )
        # self.customer (from BillingTestBase) stays at baseline AVERAGE.

        request = self.factory.get("/billing/customers/", {"tier": "good"})
        force_authenticate(request, user=self.admin)
        response = CustomerListCreateView.as_view()(request)
        codes = {c["code"] for c in response.data["results"]}

        self.assertEqual(codes, {"GOOD1"})

    def test_customer_list_unfiltered_includes_all_tiers(self):
        request = self.factory.get("/billing/customers/")
        force_authenticate(request, user=self.admin)
        response = CustomerListCreateView.as_view()(request)
        codes = {c["code"] for c in response.data["results"]}

        self.assertIn(self.customer.code, codes)
