# Cash In Hand — Sources of Inflow & Outflow

The only code allowed to move `cash_in_hand` is `cash_flow/services.py`'s
`_adjust_cashflow()`. Every source below calls into it through a `sync_*`
function, and is mirrored as one row in the `CashMovement` event table
(the "cash in hand" drawer reads only that table).

## Inflows (cash comes in)

| Source | Trigger |
|---|---|
| Opening cash entry | Data-entry opening balance seed |
| Invoice payment | Customer pays an invoice |
| Advance payment (invoice) | Customer pays before/at confirmation |
| Cash found | Manual adjustment — drawer count exceeds books |
| Investor investment | Investor deposits capital |
| Owner contribution | Owner deposits personal money into the business |
| Asset sold | Disposal of a fixed asset (sold, not scrapped) |

## Outflows (cash goes out)

| Source | Trigger |
|---|---|
| Expense | Recorded business expense |
| Supplier payment | Payment to a supplier against a purchase order |
| Advance payment (supplier) | Advance paid to a supplier before confirmation |
| Tax payment | GST paid to FBR |
| WHT payment | Withholding tax paid to FBR |
| Investor profit payout | Profit distributed/paid to an investor |
| Owner profit payout | Profit distributed/paid to the owner |
| Cash lost | Manual adjustment — drawer count short of books |
| Investor withdrawal | Investor pulls capital out |
| Owner drawing | Owner takes personal money out |
| Recurring expense payment | Rent/salary/utility-type recurring expense paid |
| Asset purchase | New fixed asset bought with cash (existing assets don't move cash) |

## Explicitly NOT cash movements

- Customer/supplier returns — inventory value & COGS only; a refund, if any,
  shows up separately as a normal outflow row above.
- Lost/found inventory — inventory value only.
- Invoice/purchase order confirmation — moves what's owed, not cash, until a
  payment is actually made.

## Method field — current state

Only 2 of the 14 sources (invoice payments, supplier payments) carry a
`method` (cash/jazzcash/easypaisa/bank) at all. The other 12 write no method
and show as "N/A" in the cash-in-hand drawer. As of 2026-08-16 the whole
system runs on cash only, so `normalize_payment_methods_to_cash` (a
management command) backfills every existing row's method to `"cash"`.
Future non-payment movements will still write no method until a mandatory
method selection is added at every inflow/outflow — a planned change, not
yet built.
