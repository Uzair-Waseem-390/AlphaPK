from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from billing.models import Customer, Invoice
from billing.services import DEFAULT_DUE_DATE_DAYS
from credit_score.models import CustomerCreditScore
from credit_score.services import initialize_credit_score, recalculate_credit_score


class Command(BaseCommand):
    help = (
        "Backfills payment_due_date on existing invoices missing it, then "
        "creates/recalculates a CustomerCreditScore for every customer from "
        "their real invoice/payment/return history. Idempotent — safe to re-run."
    )

    def handle(self, *args, **kwargs):
        self.stdout.write("Starting credit_score backfill...\n")

        # 1. Backfill payment_due_date on existing non-draft invoices that
        #    predate this feature — same +7-day default used for new invoices.
        missing_due_date = Invoice.objects.filter(
            is_deleted=False, payment_due_date__isnull=True,
        ).exclude(status="draft")
        updated = 0
        for invoice in missing_due_date:
            anchor = invoice.confirmed_at or invoice.created_at
            invoice.payment_due_date = timezone.localtime(anchor).date() + timedelta(days=DEFAULT_DUE_DATE_DAYS)
            invoice.save(update_fields=["payment_due_date"])
            updated += 1
        self.stdout.write(f"  payment_due_date backfilled on {updated} invoices")

        # 2. Every customer gets a CustomerCreditScore row — baseline first
        #    via the same service the live create_customer path uses (writes
        #    the "customer_created" history entry, idempotent), then
        #    immediately recalculated from their real history so an existing
        #    customer with years of on-time payments doesn't start back at
        #    neutral 50 forever.
        customers = Customer.objects.filter(is_deleted=False)
        created_count = CustomerCreditScore.objects.count()
        for customer in customers:
            initialize_credit_score(customer, user=None)
            recalculate_credit_score(
                customer_id=customer.id, user=None, trigger="backfill",
                reference="backfill_credit_scores",
            )
        created_count = CustomerCreditScore.objects.count() - created_count

        self.stdout.write(f"  customers processed: {customers.count()}")
        self.stdout.write(f"  new credit score rows created: {created_count}")
        self.stdout.write(self.style.SUCCESS("\ncredit_score backfill complete."))
