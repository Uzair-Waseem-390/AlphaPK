# Inventory Valuation Report — Average Cost Fix (2026-09-14)

Applies to both **AlphaPK** and its sibling project **alfa**

---

## 1. The bug we found

**Reported behavior**: accepting a return — on the purchase side (returning goods to a supplier) or the sales side (a customer returning goods) — changed the product's **average/weighted cost price** shown on the Inventory Valuation Report. Business requirement: a return must change *quantity*, never the *average cost*.

**Where it lived**: `reports.selectors.get_inventory_valuation_report_data()`. The average was a **live recompute on every single read** — never a stored figure:

```
total_value = Σ (remaining_batch_quantity × remaining_batch_cost)   — across every purchase batch still holding stock
avg_unit_cost = total_value / quantity_on_hand
```

**Why it moved (root cause)**: a return always adjusts **one specific batch** — the exact batch it was purchased in (purchase return) or the exact batch(es) the original sale consumed, newest-first (sales return via FIFO reversal). It is never a proportional slice across every batch. Mathematically, a weighted average only stays put if you remove/add units at *exactly the current average cost*. A return removes/adds units at *that one batch's own cost* instead — so unless that batch's cost happened to exactly equal the average already, the average shifted toward or away from it. This is inherent to "average = a live function of whatever batches currently remain" — not a coding mistake in the return logic itself (both return paths were correctly adjusting the right batch, for correct FIFO/COGS reasons).

We confirmed this against real numbers before touching any code: no product in production had 2+ outstanding batches to observe it passively, so we built a deliberate local test scenario (two purchases at different costs, then a partial return) and showed the average visibly shift under the old code.

---

## 2. The plan we made to fix it

Two options were on the table:

- **Option A** — patch the live recompute to exclude the returned batch's own cost. Worked out mathematically to be a dead end: to keep the average unchanged you'd need to know what the average *was right before* the return, which the live batches alone can't tell you anymore *after* the return — you'd need to have stored it already, which is Option B by another name.
- **Option B (chosen)** — a **stored, frozen moving-average field**, updated **only** by real purchases:
  - New `Inventory.avg_unit_cost` field.
  - `purchases.services.sync_inventory()` gets an optional `unit_cost` argument — supplying it applies the standard moving-average-cost formula (`new_avg = (old_avg×old_qty + batch_qty×batch_cost) / (old_qty+batch_qty)`) in the same row lock as the quantity update. Only the two call sites that represent a genuine new purchase (`confirm_purchase_order`, `create_opening_stock_order`) pass it. Every other call site (sales, purchase returns, sales returns, lost/found inventory) passes nothing — so the average is untouched by construction, not by remembering to guard each call site individually.
  - Existing data needed a **true historical replay**, not a snapshot seed: `backfill_inventory_avg_cost` walks every purchase, sale, purchase return, sales return, lost-inventory, and recovered-inventory event in the order it actually happened, recalculating the average only at purchase events using the real quantity-on-hand at that moment. A naive "just freeze today's live number" was rejected — for any product that already had a return before this fix, today's live snapshot is *already* wrong, so freezing it would have permanently locked in the very distortion being removed.

This was implemented, tested (189 tests across both codebases, an independent audit agent, byte-for-byte parity check between AlphaPK and alfa), and deployed:
- **AlphaPK production**: 0 products currently in stock, so the backfill changed nothing (0 impact) — but the mechanism is live going forward.
- **alfa production**: 170 in-stock products reconstructed. Only **1** actually changed (PVC TAN 3", −Rs. 101.50 in total value) — traced and confirmed: the 3 real purchase returns on that database all happened to touch products whose every batch was bought at the *same* price (a weighted average of identical numbers can't move regardless of which units you remove), so they were mathematically inert. The one product that did change diverged from ordinary FIFO sales depletion between two differently-priced purchases, not from a return at all.

---

## 3. The new bug we found: the Balance Sheet started drifting

While deciding what the report's **`total_value`** figure (not `avg_unit_cost`) should be, you asked for one consistent number everywhere, so `total_value` was also switched to `avg_unit_cost × quantity_on_hand`.

Right after deploying that to alfa's production, a routine check of `accounting.selectors.get_balance_sheet_live()` showed:
- `is_balanced: False`
- `balance_check: -101.4960` — almost exactly the same Rs. 101.50 the average-cost fix had just changed on that one product (the extra 0.004 was the same tiny pre-existing legacy rounding drift AlphaPK already has, confirming the rest was new).

**Why it drifted (root cause)**: the Balance Sheet computes its two sides from genuinely independent sources:
- **Assets** include `inventory_value` — now on a **Weighted-Average-Cost** basis (the frozen `avg_unit_cost`).
- **Equity**'s `retained_earnings` is built from **COGS recognized at each sale** — which has always used, and still uses, **true FIFO batch cost** (`FIFOLedger`), completely untouched by this fix.

`Assets = Liabilities + Equity` only holds when both sides value the same goods on the *same* costing method. The moment `inventory_value` (WAC) and the true FIFO cost of what's actually left diverge — which happens for exactly the one product whose average and true cost now differ — the two independently-computed sides stop reconciling by that exact amount. This wasn't a coding bug in the Balance Sheet; it was a direct, structural consequence of putting a *different* costing method into the asset side than the one already driving the equity side.

---

## 4. How we fixed it

Asked directly: *"can you just not reduce the inventory value, so the balance sheet stays balanced?"* — and confirmed the Balance Sheet is fully **live/real-time** (recomputed on every read, no cache), so the fix takes effect immediately once applied.

**Resolution — decouple the two figures, on purpose**:
- **`avg_unit_cost`** stays exactly as built: frozen, purchase-driven, immune to returns. This was always correct and untouched.
- **`total_value`** reverted to the **true live FIFO batch-walk** — its original, always-correct calculation, unchanged from before any of this work started. This isn't really a new fix; it's un-doing the one change (making `total_value` WAC-derived) that didn't need to happen and was the actual cause of the imbalance.

Confirmed explicitly with you: yes, a purchase return correctly *decreases* `total_value` (goods physically left, at that batch's real cost); yes, a sales return correctly *increases* it (goods physically came back, at their real original cost). That's desired — `total_value` is meant to reflect the real, current physical value of what's on hand, and it's supposed to move with every quantity change. Only the *average* needed to stay still.

The two numbers (`avg_unit_cost` and `total_value`) can now legitimately disagree sometimes (they do, for that one product on alfa) — intentional, not a bug: they answer two different questions ("what do we usually pay" vs. "what is this stock actually worth right now").

**Verified after the revert, on alfa's live production**:
- `is_balanced: True`
- `balance_check: 0.0040` — back to exactly the same pre-existing legacy drift as before any of today's work.
- Report and Business Worth still show the same `total_value` as each other (both read the one selector) — and now that number also matches what the Balance Sheet's equity side expects.

Full regression re-run on both codebases after the revert: **179/179 tests passing** on each.
