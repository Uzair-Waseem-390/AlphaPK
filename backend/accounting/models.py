from django.db import models  # noqa: F401

# Phase 1 (A/R aging, A/P aging, Fixed Asset Register) is entirely read-only —
# every figure is derived live from billing/purchases/assets, bounded to rows
# with a nonzero outstanding balance or active status (same "live snapshot
# report" exception architecture.md carves out for Inventory Valuation), so
# no models are needed yet. Income Statement / Balance Sheet / Cash Flow
# Statement (phase 2) will add frozen per-finished-month snapshot models
# here, mirroring profits.MonthlyProfit.
