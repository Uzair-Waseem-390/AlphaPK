# Taxes — How This Works

This document explains, in plain terms, how the system tracks the store's
sales tax and withholding tax position. It's written so an accountant can
read it and understand exactly what each number means and where it comes
from — and so the store owner (a developer, not an accountant) can follow
the reasoning too.

**Important disclaimer up front:** the store is not currently registered
with FBR for Sales Tax. Everything in this module is an internal estimate/
management tool built on the real Sales Tax Act, 1990 mechanics, using tax
figures already recorded on every purchase and sale. It is **not** a
substitute for a qualified tax consultant or accountant, and should be
reviewed against actual FBR filings before being relied on for anything
official.

---

## 1. The two taxes this system tracks, and why they're kept separate

Pakistani law actually has two completely different taxes hiding under one
word ("tax" on your invoices), and this module deliberately keeps them
apart because mixing them would produce a number that doesn't mean anything
to FBR:

### Sales Tax (GST) — the tax that can be netted

This is the tax you see as "GST" on purchase and sale documents (currently
18% standard rate on most goods, though stationery items were moved to a
reduced rate under the Finance Act 2024 — rates change almost every year,
which is why this system never hardcodes a rate; you enter the actual GST%
on each purchase/invoice line, same as before this feature existed).

**The core rule (Sales Tax Act, 1990, Section 7):** a sales-tax-registered
business does not simply hand over every rupee of GST it charges customers.
It's allowed to subtract the GST it already paid to its own suppliers
first, and only pay FBR the **difference**. This is exactly what the store
owner asked this module to calculate:

```
Net Sales Tax Payable = Output Tax (charged to customers)
                       − Input Tax (paid to suppliers)
```

- If this number is **positive**, the store technically owes FBR that
  amount for the period.
- If this number is **negative** (which is what this store's real data
  currently shows — see "Current position" below), the store has paid more
  GST to its suppliers than it has collected from customers. Under FBR
  rules, excess input tax is either refunded (for exporters/zero-rated
  sales) or carried forward to offset future periods — it is never treated
  as an amount the store owes.

### Withholding Tax (WHT) — a completely different regime, not netted

WHT (Income Tax Ordinance, 2001, Section 153) is **not** sales tax. It's an
advance payment against annual income tax, and it flows in one direction
per transaction, not two sides of the same ledger:

- **WHT withheld from suppliers**: when the store (as the buyer) pays a
  supplier, it may be required to deduct WHT from that payment and deposit
  it with FBR on the supplier's behalf. This is real cash the store has
  already deducted and is holding — a genuine liability to FBR.
- **WHT withheld by customers**: when a customer pays the store, *they* may
  deduct WHT from what they owe and deposit it with FBR directly, on the
  store's behalf. The store never touches this money. It's not income the
  store lost — it's a **credit** the store can claim against its own annual
  income tax return.

These two numbers cannot be netted against each other, and neither can be
netted against Sales Tax — they belong to a different tax law entirely.
That's why this module shows them as two separate, read-only figures with
no "amount to pay" calculated from them (see "What's intentionally missing
in v1" below).

---

## 2. What each field on the Tax Flow record actually means

The system keeps one live record (like a running balance sheet) that
updates itself automatically every time a purchase or sale is confirmed —
nothing here is calculated on the fly when you open the page; it's kept
up to date in the background so it stays fast no matter how much history
builds up.

| Field | Accountant meaning | Updates when... |
|---|---|---|
| **Input Tax Paid** | Total GST paid to suppliers, all-time | A purchase order is confirmed |
| **Output Tax Collected** | Total GST charged to customers, all-time | An invoice is confirmed |
| **Net Sales Tax Payable** | Output − Input. What you'd owe FBR today if registered and filing right now | Recalculated every time either total above changes |
| **Sales Tax Paid** | Total GST actually paid to FBR, all-time | A "Tax Payment" is recorded |
| **Sales Tax Outstanding** | Net Payable − Sales Tax Paid, never shown below zero | Recalculated every time either total above changes |
| **WHT Withheld from Suppliers** | Tax deducted from supplier payments — a real liability to FBR, informational only in v1 | A purchase order is confirmed |
| **WHT Withheld by Customers** | Tax customers deducted from what they paid you — a credit for your annual return, informational only | An invoice is confirmed |

A separate ledger, **Tax Payments**, records every actual payment made to
FBR (amount, date, note). Recording one immediately reduces Cash in Hand on
the main dashboard, exactly the same way recording an Expense does — it's
real money leaving the till.

---

## 3. Current position (as of the last backfill)

```
Input Tax Paid (to suppliers)     : Rs 1,002,348.00
Output Tax Collected (from customers): Rs    11,241.00
Net Sales Tax Payable             : Rs  -991,107.00   (you're in an excess-credit position, not owing)
Sales Tax Outstanding             : Rs         0.00
WHT Withheld from Suppliers       : Rs    55,686.00   (real FBR liability if/when registered)
WHT Withheld by Customers         : Rs       624.22   (informational credit only)
```

**Why Output Tax is so much smaller than Input Tax:** this almost certainly
means most of the store's confirmed invoices currently have 0% GST entered
on them, while most purchases do carry GST. Worth double-checking with
whoever enters invoice line items — if customers genuinely aren't being
charged GST (e.g. informal retail sales), this is expected and correct.
If GST should be on more invoices and simply isn't being entered, that's a
data-entry gap, not a bug in this module.

---

## 4. What's intentionally missing in v1 (and why)

This module was built deliberately narrow for a first version. Nothing
below is an oversight — each is a documented decision, made with the store
owner, and can be added later without reworking what's already here:

1. **Returns don't reduce these totals.** If a purchase or a sale is later
   returned, the GST/WHT already recorded against it stays on the books.
   This matches how every other running total in this system already works
   (lost inventory, purchase/customer returns, revenue) — nothing was
   singled out to behave differently. If your accountant needs returns
   reflected, that's a defined follow-up, not a redesign.

2. **No 90%-of-output-tax cap (Section 8B).** FBR limits how much input tax
   can be claimed in a single period to 90% of that period's output tax,
   carrying the rest forward. v1 shows the raw, uncapped difference so the
   core numbers can be verified as correct first — the 90% rule adds
   period-by-period carry-forward tracking, which is meaningfully more
   complex and is planned as a v2 addition once this foundation is trusted.

3. **No payment tracking for WHT.** Only Sales Tax (GST) has a "Tax
   Payments" ledger and an outstanding balance in v1. WHT withheld from
   suppliers is shown as an informational running total only — recording
   an actual WHT deposit to FBR isn't tracked yet.

4. **No period grouping.** Figures are all-time running totals, not broken
   down by FBR's monthly filing calendar. Since the store isn't currently
   registered/filing, this wasn't needed yet.

5. **No frontend yet.** This is backend-only for now — API endpoints exist
   and are verified, but there's no UI page to view or manage this from.

6. **Input tax assumes every supplier is GST-registered.** Legally, input
   tax is only claimable on purchases from suppliers who are themselves
   sales-tax-registered and issue a valid tax invoice. This system doesn't
   currently track supplier registration status, so every GST amount
   recorded on a purchase is treated as claimable. If some suppliers are
   unregistered, the true claimable input tax is lower than what's shown
   here.

---

## 5. Future plans (in rough priority order, not committed dates)

1. Add supplier GST-registration status, so Input Tax Paid can split into
   "claimable" vs "not legally creditable."
2. Add the Section 8B 90%-cap + carry-forward logic once the store
   registers with FBR (or earlier, if useful for planning ahead).
3. Add return-reversal logic for GST/WHT totals, matching whatever
   convention gets adopted for the rest of the system's running totals.
4. Add WHT payment tracking (an FBR deposit ledger, same shape as the
   existing Tax Payments ledger for GST).
5. Add a monthly tax-period view once the store is registered and needs to
   match its actual filing calendar.
6. Build the frontend: a Taxes page (stats + Tax Payments list/create/
   delete), and optionally a dashboard summary card.

---

## 6. API reference (for developers)

All endpoints require an authenticated admin or superuser (`is_staff=True`
or superuser) — normal users get a 403.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/taxes/stats/` | Current tax position (all 7 fields above) |
| GET | `/api/taxes/payments/` | List tax payments (filters: `search`, `date_from`, `date_to`, `min_amount`, `max_amount`) |
| POST | `/api/taxes/payments/` | Record a new GST payment to FBR — deducts Cash in Hand |
| GET | `/api/taxes/payments/<id>/` | Retrieve a single tax payment |
| DELETE | `/api/taxes/payments/<id>/` | Soft-delete a tax payment — restores Cash in Hand |

Run `python manage.py backfill_taxflow` any time to recompute the Tax Flow
singleton from scratch off existing confirmed purchases/invoices/payments —
safe to re-run, always lands on the correct absolute value.
