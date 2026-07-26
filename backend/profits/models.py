from django.db import models  # noqa: F401

# No models in this app. Every figure business-worth needs is already an
# O(1) singleton field on another app's Flow model (CashFlow, AssetFlow,
# TaxFlow, CashManagementFlow, RecurringExpenseFlow) or a bounded live
# computation (Inventory Valuation — cost scales with today's distinct
# product count, not history size, same reasoning as the existing report).
# See profits.selectors for the read-time aggregation.
