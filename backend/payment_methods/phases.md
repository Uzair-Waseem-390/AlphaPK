# Payment Methods (Accounts) — Build Phases

Goal: replace the predefined method labels (cash/jazzcash/easypaisa/bank)
with a real accounts system — user-defined `PaymentMethod` rows, each with
its own running balance, mandatory selection (with splits) on every
inflow/outflow, insufficient-balance rejection, and transfers between
methods. `cash_in_hand` (`CashFlow`/`CashMovement`) keeps working exactly
as it does today — this is a new, separate dimension recorded alongside it,
not a replacement for it. Full source list: `cash_flow/cash.md`.

Each phase below is its own plan-approval-build-verify cycle — nothing in
a later phase starts until the current one is confirmed working. Phase 0
(this file + app scaffold) is done.

---

## Phase 0 — Scaffold (done)

- `payment_methods` Django app created, registered in `INSTALLED_APPS`.
- This file.

---

## Phase 1 — Core models + CRUD + existing-data backfill

**Models** (`payment_methods/models.py`):
- `PaymentMethod` — `name` (unique, editable), `account_number` (optional),
  `balance` (O(1) running total, same pattern as `CashFlow.cash_in_hand`),
  `is_protected` (True only on the seeded `Cash` row — blocks rename/
  delete), soft-delete fields, audit fields (created_by/updated_by/
  deleted_by, timestamps).
- `PaymentAllocation` — `payment_method` (FK, PROTECT), `source_model`,
  `source_id`, `direction` (inflow/outflow), `amount`, `date`, `is_deleted`.
  One row per method used in a transaction — a split payment produces 2+
  rows sharing the same `(source_model, source_id)`.
- `AccountTransfer` — `from_method`, `to_method` (FK, PROTECT), `amount`,
  `date`, `note`, `created_by`, soft-delete. Moves balance between two
  methods only; never touches `cash_in_hand`.

**Migrations**: standard schema migration, plus a data migration (or
management command — following this codebase's convention of using
management commands for anything derived from live data, not baked into
a migration) that:
1. Seeds the protected `Cash` `PaymentMethod` row.
2. Sets `Cash.balance = CashFlow.get_instance().cash_in_hand` (already
   accurate — `normalize_payment_methods_to_cash` already put every
   historical payment on `"cash"`).
3. Backfills one `PaymentAllocation` per active `CashMovement` row,
   pointing at `Cash`, mirroring its `amount`/`direction`/`source_model`/
   `source_id` — so historical transactions are itemized, not left as an
   unexplained lump sum.
4. Prints a verification line: `Cash.balance == cash_in_hand == sum(Cash's
   PaymentAllocation rows)` — all three must agree, same cross-check
   pattern `CashFlow`/`CashMovement` already use.

**API**: CRUD for `PaymentMethod` only (create, edit name/account_number,
soft-delete). Delete blocked unless `balance == 0`; always blocked on the
protected `Cash` row. List/detail endpoints (detail includes the method's
own transaction history via its `PaymentAllocation` rows).

**Not in scope yet**: no other app wired in. Billing/purchases/etc. keep
working exactly as they do today — no mandatory method selection anywhere
yet. `cash_in_hand` computation untouched.

**Tests**: model constraints, soft-delete-only-if-zero-balance, protected
`Cash` immutability (can't rename/delete/edit `is_protected`), backfill
idempotency (safe to re-run), the three-way balance cross-check.

---

## Phase 2 — Allocation engine (the atomic core)

The single choke point every future phase calls into — mirrors
`cash_flow/services.py`'s `_adjust_cashflow`/`record_cash_movement` pattern
exactly, so it fits how the rest of the codebase already works:

- `record_allocations(source, direction, splits, date, user)` — the ONLY
  function allowed to write `PaymentAllocation` rows and adjust
  `PaymentMethod.balance`. Takes `splits` as `[(method, amount), ...]`.
  `select_for_update()`s every `PaymentMethod` row touched, validates
  `sum(splits) == total amount` and — for outflows — that every leg's
  amount doesn't exceed that method's current balance, all inside one
  transaction. Any single leg failing aborts the whole write — never a
  partially-applied split.
- `reverse_allocations(source)` — mirrors a source's soft-delete (undoes
  every leg's balance effect).
- `refresh_allocations(source, new_splits)` — mirrors an edit that changes
  the split (e.g. advance amount capped at confirmation).
- A dedicated exception (e.g. `InsufficientMethodBalanceError`) carrying
  which method and by how much it's short, so the API layer can surface
  "JazzCash only has Rs. 150, you tried to take Rs. 600" instead of a
  generic 500/constraint error.

**Tests**: split validation (over/under-allocated totals rejected),
insufficient-funds abort-all-or-nothing, reversal, refresh-on-edit, the
`select_for_update` race can't double-spend a method's balance under
concurrent requests.

---

## Phase 3 — Wire into Billing + Purchases

The two sources that already have a method concept, and the highest-value
real transactions:

- `billing.Payment` (invoice payments, advances) and
  `purchases.SupplierPayment` (supplier payments, advances) creation now
  requires `method_allocations: [{method_id, amount}, ...]` instead of a
  single `method` string — mandatory, no default, split allowed.
- Decision to make in this phase's detailed plan: what happens to the
  existing `method` CharField on these two models now that a payment can
  span methods (keep as a derived display value — `"cash"` if one leg,
  `"multiple"` if more than one — vs. deprecate it). Flagged now so it
  isn't a surprise mid-build.
- Insufficient-balance rejection at confirm time via the Phase 2 engine.
- Frontend: multi-row method+amount picker on the payment form, running
  "remaining to allocate" total, submit disabled until it matches the
  payment amount exactly.

---

## Phase 4 — Profit settlement exception

- **Give (payout)** — mandatory method selection (split allowed), same as
  any other outflow, through the Phase 2 engine.
- **Reinvest** — both legs (the payout-out, the investment-in) are forced
  to `Cash` automatically, no picker shown to the user, per your
  instruction — no real money crosses accounts here, it's a bookkeeping
  swap of equity. Still goes through the Phase 2 engine internally so
  `Cash.balance` and the allocation ledger stay accurate.

---

## Phase 5 — Remaining 9 source models

The rest of `cash_flow/cash.md`'s 14 source models not yet covered:
opening cash entry, expense, tax payment, WHT payment, cash lost/found
(`CashAdjustment`), investor/owner transaction, asset purchase/sale,
recurring expense payment. Same mandatory-selection treatment as Phase 3,
rolled out a few models at a time (own sub-approval per batch — this spans
6 different apps).

---

## Phase 6 — Transfers

- `AccountTransfer` create/list/detail API (model already exists from
  Phase 1) — atomic balance move via the Phase 2 engine's sibling function,
  validates `from_method` has enough balance, blocked between a method and
  itself.
- Frontend: dedicated transfer action/page ("move 100 from Cash to
  JazzCash").

---

## Phase 7 — Frontend completion

- Method management page: create/edit/soft-delete `PaymentMethod` rows,
  each showing its balance and transaction history.
- Every remaining inflow/outflow entry form across the app gets its
  dropdown (the forms wired server-side in Phases 3–5 get their UI here if
  not already done alongside).
- Transfers page.

---

## Phase 8 — Verification & cleanup

- Full regression: billing, purchases, cash_flow, accounting, profits,
  assets, cash_management, taxes, recurring_expenses test suites.
- New standing invariant check: `cash_in_hand == sum(all PaymentMethod
  balances)`, always — add this as an automated check alongside the
  existing Balance Sheet `is_balanced` check.
- Update `instructions/cash-in-hand.md`: add a step to the existing
  "wire FIVE places" checklist — any new cash-touching feature must also
  call the Phase 2 allocation engine on create/edit/delete, same as it
  already must wire `CashMovement`.
- Update `cash_flow/cash.md`'s "Planned: real accounts" section from
  design-stage language to describe the live system.
