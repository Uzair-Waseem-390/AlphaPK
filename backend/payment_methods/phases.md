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
`cash_flow/services.py`'s `_adjust_cashflow` +
`record_cash_movement`/`refresh_cash_movement`/`reverse_cash_movement`
pattern exactly (same `source` object → `_source_label(source)` +
`source.pk` convention), so it fits how the rest of the codebase already
works. Lives in `payment_methods/services.py`, alongside the Phase 1
method CRUD functions.

### `record_allocations(source, *, direction, splits, total_amount, date, user)`

The ONLY function allowed to write `PaymentAllocation` rows and adjust
`PaymentMethod.balance`. `source` is the model instance that caused the
transaction (an `Expense`, a `Payment`, ...) — same object every
`sync_*`/`record_cash_movement` call already receives. `splits` is
`[(payment_method, amount), ...]` — resolved `PaymentMethod` instances,
not raw IDs (the caller's serializer resolves them first, same as
`InvestorTransactionWriteSerializer.investor` already does).

Validation, in order, all inside one `@transaction.atomic` block:
1. `total_amount > 0`, `splits` non-empty, every leg `amount > 0`.
2. No method repeated across legs.
3. `sum(leg amounts) == total_amount` exactly (Decimal equality — no
   rounding slack).
4. Lock every distinct `PaymentMethod` touched in one query —
   `select_for_update().filter(pk__in=...).order_by("pk")` — the `order_by`
   is deliberate: every caller locks methods in the same pk order, so two
   concurrent multi-method transactions can never deadlock on each other.
5. **Outflow only**: for every leg, check `amount <= method.balance`.
   Collect *every* shortfall found, not just the first — the error the
   user sees lists every method that's short, not one at a time.
6. If step 5 found any shortfall: raise
   `rest_framework.exceptions.ValidationError` (matches this codebase's
   existing convention — `cash_management`/`cash_flow`/`billing` services
   all raise this directly, no dedicated exception class) with one message
   per method, e.g. `"JazzCash only has Rs. 150.00, this outflow needs Rs.
   600.00 from it."` Nothing is written — the `@transaction.atomic` wrapper
   plus the exception means the whole call rolls back, never a
   partially-applied split.
7. Otherwise: create one `PaymentAllocation` row per leg, and adjust each
   locked `PaymentMethod.balance` (`+=` for inflow, `-=` for outflow) —
   **not floored at 0**, deliberately, mirroring `_adjust_cashflow`'s own
   documented reasoning: outflow legs are already balance-checked in step
   5 so a fresh outflow can never push a method negative on its own, but a
   *reversal* of a past inflow (see below) legitimately can, and that's
   real information worth seeing, not something to silently clamp away.

Returns the list of created `PaymentAllocation` rows.

### `reverse_allocations(source)`

Mirrors a source's soft-delete — finds every active `PaymentAllocation`
for `(source_model, source_id)`, locks their methods (same ordered-lock
rule as above), undoes each leg's balance effect (an inflow reversal
subtracts, an outflow reversal adds back), and soft-deletes the allocation
rows. No insufficient-balance check here — reversing an inflow is allowed
to take a method negative (that negative balance is the honest signal that
the money was already spent elsewhere before the original entry got
deleted; same "don't clamp, don't hide" philosophy `_adjust_cashflow`
already uses for `cash_in_hand`). No-op if no allocations exist for that
source.

### `refresh_allocations(source, *, direction, splits, total_amount, date, user)`

For edits that change the split (e.g. an advance capped at confirmation —
the exact scenario the billing advance-cap fix already handles for
`cash_in_hand`). Implemented as `reverse_allocations(source)` followed by
`record_allocations(source, ...)` inside one atomic block — reversing
first means the new split's balance check runs fairly (the old legs'
money is already back before the new legs are validated against it).

### Explicitly NOT in Phase 2

- No app is wired to call this engine yet (Phase 3+) — it exists and is
  fully tested in isolation, nothing creates real `splits` from a live
  form yet.
- No transfer function — `AccountTransfer`'s balance-moving logic is
  Phase 6, a sibling function with its own two-method lock, not part of
  this engine.

### Tests

- Single-method inflow and outflow, balance moves correctly.
- Split inflow across 2+ methods — every method's balance updates by its
  own leg, not the total.
- Split outflow where one leg is short — the whole call raises, **zero**
  methods' balances change (verified via `refresh_from_db`), and the error
  message names the specific short method and both numbers.
- Split outflow where *two* legs are short — both show up in the one
  error, not just the first.
- `sum(splits) != total_amount` rejected.
- Same method repeated across two legs rejected.
- `reverse_allocations` undoes a multi-method split correctly, including
  the case where reversing an inflow leg is allowed to take that method
  negative (asserted as allowed, not raised).
- `refresh_allocations` moving a split (e.g. 400 Cash + 600 JazzCash → 300
  Cash + 700 JazzCash) leaves both methods at the exactly-right new
  balance, and still enforces the balance check on the new split.
- Locking order: a regression test asserting `record_allocations` always
  issues its `select_for_update` sorted by method pk regardless of the
  order methods appear in `splits` (guards the deadlock-avoidance
  guarantee, not just the balance math).

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
