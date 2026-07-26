# New cash-touching feature → wire THREE places, same pass

1. Live sync function in `cash_flow/services.py`.
2. Line item in `get_cash_in_hand_breakdown()` (`cash_flow/selectors.py`).
3. `backfill_cashflow.py` — otherwise re-running it silently undoes the deduction/addition.
