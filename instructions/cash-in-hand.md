# New cash-touching feature → wire THREE places, same pass

1. Live sync function in `cash_flow/services.py`. (This ensures the number moves in real time)
2. Line item in `get_cash_in_hand_breakdown()` (`cash_flow/selectors.py`). (This ensures the number moves in real time)
3. `backfill_cashflow.py`. (Otherwise re-running it silently undoes the deduction/addition.)
