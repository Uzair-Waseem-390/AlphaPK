# Profit Calculation Deep Dive — AlphaPK

## The Big Picture Formula

For every finalized month, the net profit is calculated as:

```
Net Profit =
    net_gross_profit          ← Sales Revenue - COGS, adjusted for returns
  - expenses_paid             ← Regular expenses dated THIS month
  - recurring_expenses_paid   ← Recurring expense payments dated THIS month
  - gst_paid                  ← GST paid to FBR dated THIS month
  - wht_paid                  ← WHT deposited to FBR dated THIS month
  - lost_inventory_net        ← Lost inventory CREATED THIS month (net of found)
  - lost_cash_net             ← Lost cash dated THIS month (net of found)
  - depreciation              ← Depreciation entries FOR THIS month's period
  + disposal_gain_loss        ← Asset disposal gain/loss dated THIS month
```

> [!IMPORTANT]
> **Every single deduction below is scoped ONLY to that specific month's date range (`first_day` → `last_day`).
> Nothing is accumulated "from start to today". Each month is its own independent slice.**

---

## Component-by-Component Breakdown

---

### 1. `net_gross_profit` (starting point)

**Source:** `get_gross_profit_trend()` in `cash_flow/selectors.py`

**How it works:**
- Queries all **confirmed, non-data-entry invoices** with `confirmed_at` falling within this month
- Sums: `grand_total` → gross revenue, `total_cogs` → gross COGS, `gross_profit`
- Separately queries **accepted customer returns** with `accepted_at` falling within this month
- Then computes:
  ```
  net_revenue      = revenue      - return_value   (return recognized in the month it was ACCEPTED)
  net_cogs         = cogs         - return_cogs
  net_gross_profit = net_revenue  - net_cogs
  ```

> [!NOTE]
> A return accepted in July always reduces July's profit — even if the original sale was in June. The return is recognized when it's accepted, not when the sale was made.

---

### 2. `expenses_paid`

**Source:** `_compute_expenses_paid()` — queries `Expense` model

**Scope:** Only expenses whose `expense_date` falls within this month.

✅ **Month-specific only.**

---

### 3. `recurring_expenses_paid`

**Source:** `_compute_recurring_expenses_paid()` — queries `RecurringExpenseAssignmentPayment`

**Scope:** Only recurring expense payments whose `payment_date` falls within this month.

✅ **Month-specific only.**

---

### 4. `gst_paid`

**Source:** `_compute_gst_paid()` — queries `TaxPayment`

**Scope:** Only GST payments to FBR whose `payment_date` falls within this month.

✅ **Month-specific only.**

---

### 5. `wht_paid`

**Source:** `_compute_wht_paid()` — queries `WHTPayment`

**Scope:** Only WHT deposits whose `payment_date` falls within this month.

✅ **Month-specific only.**

---

### 6. 🔴 `lost_inventory_net`

**Source:** `_compute_lost_inventory_net()` — queries `LostInventoryRecord`

**Scope:** Only `LostInventoryRecord` rows whose `created_at__date` falls within this month.

**How `net_amount` is calculated per item:**
```
net_amount = total_cost - recovered_amount
           = total_cost - (unit_cost × found_quantity)
```

> [!WARNING]
> **Known Limitation:** The `found_quantity` used is the CURRENT live value at the moment the month is finalized (i.e., when you first view that month's data after the month is over).
>
> Example: A record was created in June. June finalizes. At finalization, found_quantity = 0, so the full loss is recorded in June. If you later mark some units as "found" in July, June's stored number **does NOT change** (months are frozen once finalized). The recovery will instead show up as a reduction in July's `lost_inventory_net`.

✅ **Month-specific (creation date) — but with the above caveat.**

---

### 7. 🔴 `lost_cash_net`

**Source:** `_compute_lost_cash_net()` — queries `CashAdjustment`

**Scope:** Only cash lost/found records whose `adjustment_date` falls within this month.

```
lost_cash_net = total LOST this month - total FOUND this month
```

✅ **Month-specific only. No accumulation.**

---

### 8. 🔴 `depreciation`

**Source:** `_compute_depreciation()` — queries `AssetValuationEntry`

**Scope:** Only `AssetValuationEntry` rows where `period = "YYYY-MM"` (the exact period being calculated).

**Important detail:** Before profit catch-up runs, `assets.selectors.get_asset_stats()` is called first (line ~301 in services.py) to ensure asset depreciation entries are written for all past periods. Then the depreciation query picks up only this month's entries.

✅ **Month-specific only. Each month gets its own depreciation entry.**

---

### 9. 🔴 `disposal_gain_loss`

**Source:** `_compute_disposal_gain_loss()` — queries `AssetDisposal`

**Scope:** Only disposed assets (type=SOLD) whose `disposal_date` falls within this month.

This is **added** (not subtracted) because a gain is positive, a loss is negative (stored as a negative `gain_loss` value on the model).

✅ **Month-specific only.**

---

## Summary Table

| Component | Scope | Accumulates? |
|---|---|---|
| `net_gross_profit` | Invoices confirmed THIS month, returns accepted THIS month | ❌ No |
| `expenses_paid` | `expense_date` in THIS month | ❌ No |
| `recurring_expenses_paid` | `payment_date` in THIS month | ❌ No |
| `gst_paid` | `payment_date` in THIS month | ❌ No |
| `wht_paid` | `payment_date` in THIS month | ❌ No |
| `lost_inventory_net` | Records **created** in THIS month (net of current found_qty) | ⚠️ Caveat above |
| `lost_cash_net` | `adjustment_date` in THIS month | ❌ No |
| `depreciation` | `period == THIS month` | ❌ No |
| `disposal_gain_loss` | `disposal_date` in THIS month | ❌ No |

> [!IMPORTANT]
> **Finalized months are frozen forever.** Once a past month is finalized (you view it after that month ends), the `MonthlyProfit` row is written once and never recomputed. Only the current still-open month is a live, provisional calculation.
