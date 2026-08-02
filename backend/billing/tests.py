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
)
from rates.services import create_rate
from users.models import User

from .models import Invoice, Payment
from .services import (
    accept_return, confirm_invoice, create_customer, create_invoice,
    create_payment, create_return, delete_payment,
)
from .views import DraftInvoiceListView, InvoiceConfirmView, InvoiceListCreateView


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
            name=name, code=code, category=self.category, shelf=self.shelf,
        )
        create_rate(product_id=product.id, selling_price=Decimal(selling_price), user=self.admin)
        order = create_purchase_order(
            supplier_id=self.supplier.id,
            items=[{"product_id": product.id, "quantity": stock, "unit_price": Decimal(unit_cost)}],
            user=self.admin,
        )
        confirm_purchase_order(order_id=order.id, user=self.admin)
        return product

    def make_confirmed_invoice(self, product, quantity=4):
        invoice = create_invoice(
            customer_id=self.customer.id,
            items=[{"product_id": product.id, "quantity": quantity}],
            user=self.admin,
        )
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
