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

## Note on profit settlement (Investor/Owner profit payout)

A monthly profit settlement has two distinct actions, and they move cash
differently:

- **Give (payout)** — real cash leaves the business into the investor's/
  owner's pocket. One outflow only. This is a real method-bearing
  transaction — once mandatory method selection exists (see below), the
  user must pick the method(s) here.
- **Reinvest** — the profit never physically leaves; it's booked out as a
  payout and immediately back in as fresh capital (investor investment /
  owner contribution) in the same action. Both legs already net to zero on
  `cash_in_hand`. Once mandatory method selection exists, reinvest must NOT
  prompt the user — both legs default silently to the `Cash` method, since
  no real money moved between real-world accounts.

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

## Planned: real accounts (2026-08-16, design stage, not built)

The predefined method choices (jazzcash/easypaisa/bank as free-text labels)
are being replaced with a proper `PaymentMethod` model — user-defined
accounts (Cash, JazzCash, Easypaisa, Bank, or anything else they add), each
with its own running balance. `Cash` ships as a protected, undeletable,
unrenamable seed row. Every inflow and outflow will require selecting one
or more methods (split allowed — e.g. an invoice payment of 1000 as 400
Cash + 600 JazzCash), an outflow will be rejected if any selected method's
balance can't cover its share, and transfers between methods (e.g. move
100 from Cash to JazzCash) will be supported. `cash_in_hand` itself keeps
computing exactly as it does today (unaffected) — the per-method balances
are a new, separate dimension recorded alongside it. See the architecture
plan under discussion for the model design and rollout phasing.
