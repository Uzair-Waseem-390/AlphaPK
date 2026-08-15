# New cash-touching feature → wire FIVE places, same pass

1. Live sync function in `cash_flow/services.py`. (This ensures the number moves in real time)
2. A payload builder in `cash_flow/services.py`'s `_MOVEMENT_BUILDERS` map, plus
   `record_cash_movement(source)` at the create site and
   `reverse_cash_movement(source)` at the delete/reversal site (and
   `refresh_cash_movement(source)` if the source's amount/display fields are
   editable). This is what makes the row appear in the cash-in-hand drawer —
   the drawer reads ONLY the `CashMovement` event table now.
3. The same source loop in `management/commands/backfill_cash_movements.py`.
   (Otherwise re-running the rebuild silently drops those rows.)
4. Line item in `get_cash_in_hand_breakdown_from_sources()`
   (`cash_flow/selectors.py`) — the consistency oracle tests compare the
   event table against.
5. `backfill_cashflow.py`. (Otherwise re-running it silently undoes the
   deduction/addition.)
6. Classify the new `movement_type` in `accounting/selectors.py`'s
   `OPERATING_MOVEMENT_TYPES` / `INVESTING_MOVEMENT_TYPES` /
   `FINANCING_MOVEMENT_TYPES` sets, and give it a human label in
   `_MOVEMENT_TYPE_LABELS`. Skipping this does NOT just omit a line from the
   Cash Flow Statement — `net_change_in_cash` is summed from those buckets
   and `opening_cash` is derived as `closing_cash - net_change`, so an
   unclassified type makes both totals wrong. Since 2026-08-15 an unmapped
   type falls into Operating labelled `"Unclassified — <movement_type>"`
   rather than being dropped, so the totals stay correct and the gap is
   visible on the statement — but that's a safety net, not a substitute for
   classifying it properly here.

Events are written in the SAME transaction as the CashFlow adjustment —
never record an event without its cash sync or vice versa.
