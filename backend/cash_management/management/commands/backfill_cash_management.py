from decimal import Decimal

from django.core.management.base import BaseCommand

from cash_management.models import CashAdjustment, CashManagementFlow, Investor, InvestorTransaction


class Command(BaseCommand):
    help = "Backfills the CashManagementFlow singleton and every Investor's stored totals from existing records."

    def handle(self, *args, **kwargs):
        self.stdout.write("Starting CashManagement backfill...\n")

        # Reset singleton — EVERY field this command touches must be reset here.
        # A backfill command must be idempotent (safe to re-run, always lands
        # on the correct absolute value); any field summed further down but
        # left out of this reset silently compounds on every re-run instead.
        cmf, _ = CashManagementFlow.objects.get_or_create(pk=1)
        cmf.total_cash_lost           = Decimal("0")
        cmf.total_cash_recovered      = Decimal("0")
        cmf.total_investor_capital    = Decimal("0")
        cmf.total_investor_withdrawn  = Decimal("0")
        cmf.save()

        # 1. Cash lost/recovered = sum over non-deleted CashAdjustment rows
        for a in CashAdjustment.objects.filter(is_deleted=False):
            if a.adjustment_type == CashAdjustment.AdjustmentType.LOST:
                cmf.total_cash_lost += a.amount
            else:
                cmf.total_cash_recovered += a.amount
        self.stdout.write(f"  total_cash_lost: {cmf.total_cash_lost}")
        self.stdout.write(f"  total_cash_recovered: {cmf.total_cash_recovered}")

        # 2. Investor totals — recompute each investor's stored fields from
        #    scratch (same idempotency discipline as the singleton reset above).
        for investor in Investor.objects.filter(is_deleted=False):
            investor.total_invested = Decimal("0")
            investor.total_withdrawn = Decimal("0")
            for t in InvestorTransaction.objects.filter(is_deleted=False, investor=investor):
                if t.transaction_type == InvestorTransaction.TransactionType.INVESTMENT:
                    investor.total_invested += t.amount
                else:
                    investor.total_withdrawn += t.amount
            investor.net_stake = investor.total_invested - investor.total_withdrawn
            investor.save(update_fields=["total_invested", "total_withdrawn", "net_stake"])

            cmf.total_investor_capital   += investor.total_invested
            cmf.total_investor_withdrawn += investor.total_withdrawn

        self.stdout.write(f"  total_investor_capital: {cmf.total_investor_capital}")
        self.stdout.write(f"  total_investor_withdrawn: {cmf.total_investor_withdrawn}")

        # Derived fields — same recompute-and-store discipline as the live sync path.
        cmf.net_cash_lost = max(Decimal("0"), cmf.total_cash_lost - cmf.total_cash_recovered)
        cmf.net_investor_capital = cmf.total_investor_capital - cmf.total_investor_withdrawn

        cmf.save()
        self.stdout.write(self.style.SUCCESS("\nCashManagement backfill complete."))
        self.stdout.write(f"""
Final CashManagementFlow state:
  total_cash_lost           : {cmf.total_cash_lost}
  total_cash_recovered      : {cmf.total_cash_recovered}
  net_cash_lost              : {cmf.net_cash_lost}
  total_investor_capital    : {cmf.total_investor_capital}
  total_investor_withdrawn  : {cmf.total_investor_withdrawn}
  net_investor_capital       : {cmf.net_investor_capital}
""")
