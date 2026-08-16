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

### Models (`payment_methods/models.py`)

Follows this codebase's standard pattern: soft-delete `AuditMixin`
(created_by/updated_by/deleted_by, timestamps, is_deleted,
SoftDeleteManager/AllObjectsManager — copied into this app the same way
billing/purchases each keep their own copy), and a stored, service-updated
running balance (same shape as `cash_management.Investor.net_stake` /
`CashFlow.cash_in_hand` — never recomputed at read time).

```python
class PaymentMethod(AuditMixin):
    name           = CharField(max_length=100, unique=True)
    account_number = CharField(max_length=100, blank=True, default="")
    balance        = DecimalField(max_digits=20, decimal_places=4, default=0,
                          help_text="Running balance for this method. Only ever "
                          "written by payment_methods.services — never at read time.")
    is_protected   = BooleanField(default=False,
                          help_text="True only on the seeded Cash row. Blocks "
                          "rename, is_protected changes, and delete at the service layer.")

    class Meta:
        ordering = ["name"]
```

```python
class PaymentAllocation(models.Model):
    payment_method = ForeignKey(PaymentMethod, on_delete=PROTECT, related_name="allocations")
    source_model   = CharField(max_length=60)   # "billing.payment", "cash_flow.expense", ...
    source_id      = BigIntegerField()
    direction      = CharField(max_length=10, choices=[("inflow","Inflow"),("outflow","Outflow")])
    amount         = DecimalField(max_digits=20, decimal_places=4)
    date           = DateField()
    is_deleted     = BooleanField(default=False, db_index=True)
    created_at     = DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["source_model", "source_id"], name="idx_alloc_source"),
            models.Index(fields=["payment_method", "is_deleted"], name="idx_alloc_method_active"),
        ]
```

No `UniqueConstraint(source_model, source_id)` here (unlike `CashMovement`)
— a split source legitimately produces multiple rows sharing that pair.

```python
class AccountTransfer(AuditMixin):
    from_method = ForeignKey(PaymentMethod, on_delete=PROTECT, related_name="transfers_out")
    to_method   = ForeignKey(PaymentMethod, on_delete=PROTECT, related_name="transfers_in")
    amount      = DecimalField(max_digits=20, decimal_places=4)
    date        = DateField()
    note        = CharField(max_length=255, blank=True, default="")
```

Model built in Phase 1; its create/list/detail API and balance-moving
logic are Phase 6 — kept out of scope here so Phase 1 stays reviewable on
its own.

### Migrations

1. `0001_initial` — the three tables above.
2. A management command (not a baked-in data migration, matching this
   codebase's convention — `backfill_cashflow`, `backfill_cash_movements`
   are commands, not migrations, because their output depends on live
   data, not schema): `seed_and_backfill_payment_methods.py`.
   - Idempotent, safe to re-run: `get_or_create`s the protected `Cash` row
     (`is_protected=True`) rather than failing if it already exists.
   - Sets `Cash.balance = CashFlow.get_instance().cash_in_hand`.
   - For every active `CashMovement` row, `get_or_create`s one matching
     `PaymentAllocation` (`payment_method=Cash`, mirrored
     amount/direction/source_model/source_id/date) — `get_or_create`
     keyed on `(source_model, source_id, payment_method)` makes re-runs a
     no-op instead of duplicating rows.
   - Prints the three numbers side by side for manual verification:
     `Cash.balance`, `CashFlow.cash_in_hand`, `sum(active PaymentAllocation
     for Cash)` — build isn't done until all three agree.

### Services (`payment_methods/services.py`) — Phase 1 scope only

- `create_method(name, account_number, user)` — rejects duplicate names.
- `update_method(method, name=None, account_number=None, user=None)` —
  raises if `method.is_protected`.
- `soft_delete_method(method, user)` — raises if `method.is_protected`,
  raises if `method.balance != 0`.
- No balance-moving logic yet (that's the Phase 2 allocation engine and
  Phase 6 transfer service) — Phase 1 only creates/edits/deletes the
  method rows themselves and runs the backfill.

### API

- `PaymentMethodViewSet` (list/retrieve/create/update/soft-delete),
  `IsAdminOrSuperuser` (matches `cash_management`'s permission pattern —
  accounts are an admin-level concern like Investors).
- Detail serializer includes the method's own transaction history by
  joining its active `PaymentAllocation` rows (read-only in Phase 1 —
  nothing writes new allocations yet outside the backfill).
- `admin.py` registration for both models (ops visibility / manual
  inspection, matching every other app in this codebase).

### Explicitly NOT in Phase 1

- No allocation-writing engine yet (Phase 2).
- No other app (billing, purchases, expenses, ...) wired in — they keep
  working exactly as today.
- No transfer API (model exists, endpoints don't yet).
- `cash_in_hand` computation completely untouched.

### Tests

- `PaymentMethod`: unique name constraint, protected-row rename/delete
  blocked, delete blocked while `balance != 0`, delete allowed at exactly
  `balance == 0`.
- Backfill command: creates exactly one `Cash` row on first run, is a
  no-op on a second run (row counts unchanged), the three-way balance
  cross-check passes against a seeded local dataset.
- API: non-admin roles get 403; admin can create/edit/delete methods
  through the normal flow; protected-row edit/delete attempts return a
  clean 400, not a 500.

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
