# PROJECT_SPEC.md — Petrol Bunk Management System

> **This is the single source of truth for the business domain.**
> Any AI tool or developer opening this repo must read this file **before**
> touching code. Coding rules live in `CLAUDE.md` / `AGENTS.md`.

---

## 1. What this system is

A production-grade management system for an **Indian retail fuel outlet**
("petrol bunk") — the kind of outlet operated by a dealer under an OMC
(IOCL / BPCL / HPCL / Reliance / Nayara / Shell).

### 1.1 The five-second test

The owner opens the app and, **within five seconds and without clicking**,
sees on one screen:

| # | Number | Meaning |
|---|--------|---------|
| 1 | Today's sale — litres and rupees | Per product, and total |
| 2 | Today's gross profit and net profit | Gross = sale − COGS. Net = gross − expenses − salaries + other income |
| 3 | Cash that *should* be in hand vs cash *actually* collected, and the short/excess | Per shift and consolidated for the day |
| 4 | Physical dip stock vs book stock per tank, with the variation valued in rupees | Litres and ₹, colour-coded against the permissible allowance |
| 5 | Total outstanding from credit customers, with the overdue portion split out | Outstanding, overdue, oldest bill age |

**Every feature in this system exists to make those five numbers correct.**
If a feature does not contribute to the accuracy, timeliness or auditability
of those numbers, it does not get built.

### 1.2 Who uses it

| Role | Reality on the ground |
|------|----------------------|
| `OWNER` | Dealer. Checks the dashboard on a phone. Rarely types. Needs to trust the numbers. |
| `MANAGER` | Runs the outlet day to day. Approves shifts, purchases, price changes. |
| `ACCOUNTANT` | Vouchers, reconciliations, GST/VAT returns, customer ledgers. |
| `CASHIER` | Closes shifts, counts cash, enters denominations, settles cards. |
| `SALESMAN` | Pump attendant. Nozzle readings, credit slips. Low literacy assumed — big touch targets, Tamil labels. |
| `AUDITOR` | Read-only across everything, including logs. Cannot write anything, ever. |

---

## 2. Domain vocabulary (use these exact terms in code and UI)

| Term | Meaning |
|------|---------|
| **Outlet / Bunk** | One physical fuel station. The system is multi-outlet from day one. |
| **DU (Dispensing Unit)** | The physical pump machine. Has 1–8 nozzles. |
| **Nozzle** | One delivery point. Belongs to exactly one DU and is fed by exactly one tank. Carries a mechanical/electronic **totaliser**. |
| **Totaliser reading** | Cumulative litres dispensed since installation. Monotonically increasing. Rolls over at the meter digit limit. |
| **Shift** | A named work period (e.g. `SHIFT_1` 06:00–14:00). A day has 1–3 shifts. |
| **Shift entry** | The record of one shift on one date at one outlet: readings, cash, credit, settlements. |
| **Testing litres** | Litres dispensed into the 5-litre measure to prove calibration, then **returned to the tank**. Counted on the totaliser but **not a sale** and **not a stock outflow**. |
| **Dip** | Physical stock measured with a calibrated dip rod, in **millimetres**, converted to litres via the tank calibration chart. |
| **Book stock** | Stock the ledger says should be there. |
| **Variation** | `Dip stock − Book stock`. Negative = loss. |
| **Decantation** | Unloading a tank lorry into the underground tank. |
| **Density** | Measured in **kg/m³** at observed temperature, corrected to 15 °C. Invoice density vs received density is a quality/dilution check. |
| **Credit slip** | Paper chit signed by a credit customer at the nozzle. Converted to a bill later. |
| **DSR** | Daily Sales Report — the day summary the owner signs. |
| **OMC** | Oil Marketing Company — the supplier. |
| **RSP** | Retail Selling Price — the pump rate, tax-inclusive. |
| **Short / Excess** | Cash difference at shift close. Short is recovered from the salesman; excess is booked to a suspense account. |
| **Evaporation allowance** | Permissible stock loss %, set by OMC circular. **Configurable, never hard-coded.** |

---

## 3. Modules and phase plan

| Phase | Module | Contents |
|-------|--------|----------|
| **1** ✅ | **Foundation** | Full Prisma schema for all 7 phases · Auth + session · Permission matrix · Date locks + books-closed · Login log + audit log · App shell |
| **2** ✅ | **Master data** | Outlets, firm/GST, products, price master, tanks, dip calibration charts, dispensing units, nozzles, shifts, customers + vehicles, suppliers, employees, chart of accounts, payment modes, expense heads |
| **3** ✅ | **Pump Operations** | Shift entry with chained totalisers and mid-shift rate splits · testing litres · salesman settlement with denomination count and short/excess posting · dip & density · tanker receipt/decantation · stock variation register · density register · tanker-wise receipt loss · reminders · retained-sample register with QR stickers |
| **4** ✅ | **Billing & Customers** | Cash, credit, counter and mobile/PWA bills · running-short credit with ageing and resolution · immutable printed bills and approved cancellation · credit notes · credit limits/days · consolidated period billing · GST e-invoice v1.1 payload/IRN/QR · SMS/email adapters · bulk thermal/A5/A4 print and PDF/Excel output |
| **5** ✅ | **Accounts** | Full double-entry · vouchers of every type · ledger · trial balance · P&L · balance sheet · cash flow · cash and bank books with reconciliation · statements · debtors · ageing · month-wise periodicals · GSTR-1 and GSTR-3B |
| **6** ✅ | **Inventory, Payroll & User Control** | Stock ledger and live tank status · weighted-average/FIFO product profitability · Phase 3 tank-variation reuse · structured inspections with printable PDF · low-stock reminders · batch/MRP/expiry inventory · attendance · salary structures and editable salary runs deducting the Phase 3 salesman recoverable balance · employee ledgers and payslip PDFs · completed permission, date/screen restriction, login-log and immutable audit-log controls |
| **7** ✅ | **Dashboard & Reports** | Five-second owner dashboard (KPI sparklines, product/payment/shift glance, severity-sorted alerts, 30-day/12-month/margin trends, customer and salesman league tables) · one-click Daily Sales Report (PDF/Excel) · full i18n (English/Tamil) with per-user theme persisted server-side · every screen audited for empty/loading/error states · performance-indexed for sub-2s dashboard render at 90 days of data · 18/18 acceptance suite passing |

The **schema for all seven phases ships in Phase 1**, so no later phase ever
requires a destructive migration.

Phase 6 needed additive columns and child tables for batch inventory,
inspection checklist evidence, salary incentive rates and per-user screen
overrides. The migration is additive and preserves all Phase 1–5 data.

Phase 7 added two indexes only (`vouchers(outletId, status, businessDate)`
and `voucher_lines(outletId, accountId, businessDate)`) to keep the
dashboard's running-balance queries index-only at scale; no other schema
change was needed. See `OPERATIONS.md` for the day-to-day workflow this
phase's screens are built around, and `scripts/acceptance.ts`
(`npm run acceptance`) for the eighteen checks that gate this phase.

---

## 4. Core formulas — authoritative

All arithmetic below is performed in **Decimal**, never floating point.
Rounding is **half-up**, applied only at the final step of a formula.

### 4.1 Nozzle sale

```
sale_litres   = closing_reading − opening_reading − testing_litres
sale_amount   = round2( sale_litres × rate )
```

* `opening_reading` is **never typed**. It is the previous shift
  `closing_reading` for that nozzle, enforced by a database-level chain
  (`NozzleReading.prevReadingId` is `@unique`, forming a strict linked list
  per nozzle).
* **Meter rollover**: if `closing_reading < opening_reading`, the totaliser
  wrapped. `sale_litres = (meter_max + 1 − opening) + closing − testing`,
  where `meter_max` is derived from `Nozzle.meterDigits`.
* `rate` is the RSP effective at the shift start, resolved from
  `PriceHistory`. A mid-shift price change splits the shift entry.

### 4.2 Shift totals

```
shift_sale_amount = Σ nozzle sale_amount
shift_sale_litres = Σ nozzle sale_litres   (per product)
```

### 4.3 Cash reconciliation (the number that gets people fired)

Settlement is **per salesman per shift**, not per shift.

```
total_sale_value  = nozzle sale amounts + lube / counter sales
total_collections = Cash + Card + UPI + Wallets + Credit + Own Use + Expenses
short_excess      = total_collections − total_sale_value
```

* `short_excess < 0` → **SHORT**, shown in red, recoverable from the salesman.
* `short_excess > 0` → **EXCESS**, posted to a cash-excess suspense account.
* Expenses paid out of the salesman's shift cash count as *collected*: the
  money is gone but they have evidenced where it went, exactly like a credit
  slip.
* A tolerance (`cash.shortExcessToleranceAmount`, default **₹20**) below which
  no recovery voucher is auto-raised. **The amount is still recorded** — the
  tolerance suppresses the voucher, never the number.

**The denomination count must agree with the declared cash.**

```
counted = Σ (denomination × count) + loose_coins
```

If `counted ≠ declared_cash` the settlement **will not save**. The user either
recounts or ticks an acknowledgement and records a reason, which is stored on
the settlement and written to `audit_logs`.

**Short and excess post to the ledger as balanced journal lines**, never to a
balance column:

| Case | Debit | Credit |
|------|-------|--------|
| Short | Salesman's ledger (receivable) | Cash in hand |
| Excess | Cash in hand | Cash & excess suspense |

The salesman's **recoverable balance is therefore derived** from their ledger
(`salesmanRecoverable()`), and Phase 7 payroll deducts it. Nothing accumulates
in a column that some other module could overwrite.

### 4.4 Book stock and dip stock

```
book_stock = opening + purchases − sales − own_use − returns
```

where:

* `purchases` is **decanted** litres (dip-verified), never invoice quantity.
* `sales` is metered nozzle litres with **testing litres already excluded** —
  testing turned the meter but went back into the tank.
* `own_use` is fuel issued free of charge and **not** through a metered
  nozzle (drum issues, the generator). Own use dispensed through a nozzle is
  already inside `sales`; counting it twice is a bug, and there is a test that
  fails if it is reintroduced. Retained samples are booked here.
* `returns` is stock returned to the supplier.

`dip_stock` is obtained from the tank **calibration chart**:

```
dip_stock = interpolate( TankCalibration, dip_mm )
```

Linear interpolation between the two nearest chart rows. Charts are
per-tank, supplied by the calibration agency, stored in `tank_calibration`.
Optional water dip is deducted:

```
net_dip_stock = dip_stock(fuel_dip_mm) − dip_stock(water_dip_mm)
```

### 4.5 Stock variation

```
variation_litres  = physical_stock − book_stock          (negative = loss)
variation_pct     = variation_litres / (opening + purchases) × 100
permissible       = sales × allowance_pct / 100
excess_loss       = |variation_litres| − permissible      (floored at zero)
variation_value   = round2( variation_litres × purchase_cost_per_litre )
```

**Note the two different denominators, and keep them different.** The
*percentage* is measured against throughput handled (opening + purchases),
because that is the volume the outlet was responsible for. The *allowance* is
measured against litres actually pumped (sales), because evaporation and
metering tolerance scale with dispensing, not with what sat in the tank.
Implemented in `computeStockVariation()` and covered by a test that asserts
the denominators do not converge.

Defaults for `allowance_pct` (**labelled defaults, editable in Settings —
verify against your current OMC circular**):

| Product | Setting key | Default |
|---------|-------------|---------|
| MS (Petrol) | `stock.allowancePct.MS` | **0.75 %** |
| HSD (Diesel) | `stock.allowancePct.HSD` | **0.50 %** |
| Premium MS/HSD | `stock.allowancePct.PREMIUM` | **0.75 %** |
| Lubricants | `stock.allowancePct.LUBE` | **0.00 %** |

Variation is valued at **weighted average cost**, not selling price — a loss
is a loss of cost, not of margin.

### 4.6 Decantation and transit loss

```
decanted_qty      = dip_after_litres − dip_before_litres    (through the chart)
transit_loss      = invoice_qty − decanted_qty              (positive = loss)
loss_pct          = transit_loss / invoice_qty × 100
allowed_transit   = invoice_qty × stock.transitLossPct / 100   (default 0.20 %)
excess_loss       = transit_loss − allowed_transit          (floored at zero)
density_deviation = receipt_density_15c − invoice_density_15c
```

Temperature correction to 15 °C is applied where the invoice carries a
temperature (`correctVolumeTo15C`), and both the observed and the corrected
figures are stored, never just the corrected one.

Density at 15 °C:

```
density_15c = observed_density + k × (observed_temp − 15)
```

`k` is `quality.densityTempCoefficient`, default **0.65 kg/m³ per °C**. It is
the calibration knob: a real hydrometer and a real OMC conversion table will
disagree slightly with any single coefficient, so tune `k` to match the table
in use rather than editing the formula.

`density_deviation` beyond `quality.densityToleranceKgM3` (default **±3.0
kg/m³**) raises a **quality alert** — it is the protection against an
adulteration allegation and against receiving off-spec product.

VCF (volume correction factor) uses the ASTM D1250 / IS 1448 Table 54B
relationship. Until that table is loaded, the linear approximation is used
and **flagged in the UI**:
`vcf ≈ 1 − 0.00105 × (observed_temp_c − 15)` — configurable coefficient
`quality.vcfLinearCoefficient`.

### 4.7 Profit

```
cogs            = Σ ( sale_litres × weighted_avg_cost_per_litre )
gross_profit    = net_sale_value − cogs
net_profit      = gross_profit
                + other_income
                − operating_expenses
                − salary_cost
                − depreciation
                − finance_cost
```

`net_sale_value` for MS/HSD is the tax-inclusive RSP **minus** the embedded
VAT/state excise, computed from the tax component in `PriceHistory`.
Fuel margin in India is thin (roughly ₹1.5–₹3.5 per litre) — **the system
must never round margin away.** Cost is carried at 4 decimal places
internally for weighted-average purposes and displayed at 2.

### 4.8 Credit and ageing

```
customer_outstanding = Σ credit_bills + Σ credit_slips_unbilled
                     − Σ receipts_allocated
                     − Σ credit_notes

due_date   = bill_date + customer.creditDays
overdue    = Σ outstanding where due_date < today
```

Ageing buckets (configurable, `credit.ageingBuckets`, default
`0-15, 16-30, 31-60, 61-90, 90+` days).
Credit limit breach blocks new credit slips unless a `MANAGER` approves, and
the approval is written to `audit_logs`.

### 4.9 Taxes — all configurable, none hard-coded

| Item | Reality | Setting key | Default |
|------|---------|-------------|---------|
| MS / HSD | **Outside GST.** State VAT + central excise, already inside the RSP. | `tax.fuelRegime` | `VAT_INCLUSIVE` |
| VAT rate per product per state | Varies by state, changes by notification | `products.vatPct` (per-product row) | — |
| Lubricants, AdBlue, services | **Under GST** | `tax.gstPct.lubricant` | 18 % |
| TCS u/s 206C(1H) | 0.1 % on receipts from a buyer above the threshold | `tax.tcsPct` / `tax.tcsThreshold` | 0.10 % / ₹50,00,000 |
| TDS on commission | As applicable | `tax.tdsPct.commission` | 5 % |

**Every one of these is a row in `settings` with a labelled default.
Changing a rate must never require a deployment.**

---

## 5. Accounting model

* The system is a **real double-entry ledger**. There is no "balance" column
  that any module writes to directly.
* Every financial event produces a `Voucher` with two or more `VoucherLine`
  rows whose debits equal credits. This is enforced in a single posting
  service and asserted before commit.
* Account balances are always **derived** from voucher lines (an optional
  periodic snapshot table may exist for speed, never as the source of truth).
* Account groups follow a Tally-like tree so an Indian accountant is
  immediately at home: `Assets → Current Assets → Stock-in-Trade`, etc.

Voucher types: `SALES`, `PURCHASE`, `RECEIPT`, `PAYMENT`, `CONTRA`,
`JOURNAL`, `CREDIT_NOTE`, `DEBIT_NOTE`, `SHIFT_CLOSE`, `STOCK_ADJUSTMENT`,
`SALARY`, `DEPRECIATION`, `OPENING_BALANCE`.

### 5.1 The one door

Everything posts through `postVoucher()` in `src/server/accounts/posting.ts`.
It calls `assertBalanced()` and **throws** before commit if debits do not equal
credits at 2 dp — there is no code path that can leave the ledger out of
balance, and no module writes a balance column.

A posted voucher is never edited or deleted. Correcting one posts its mirror
image (`reverseVoucher`) and then the replacement, so a reader who already
relied on the original can still see what happened.

Derived postings that are rebuilt rather than entered — daily cost of goods
sold, opening balances — carry a `sourceKey`, unique per outlet, so reposting
replaces instead of duplicating.

### 5.2 What each operational event posts

| Event | Posting |
|-------|---------|
| Shift close, per salesman | Dr cash, card, UPI, wallet, customer ledgers, own use, expense heads, and the salesman for a short · Cr fuel sales by product (carrying litres), counter sales, and the suspense account for an excess |
| Cost of goods sold, per day | Dr COGS by product (carrying litres) · Cr stock-in-trade — driven by the stock ledger, so the P&L agrees with physical stock by construction |
| Retained sample drawn | Dr stock loss · Cr stock-in-trade — a sample leaves the tank but was not sold |
| Tanker receipt | Dr stock-in-trade (litres that actually arrived), Dr transit loss (the shortfall), Dr TCS receivable · Cr supplier |
| Approved stock variation | Dr evaporation / stock loss · Cr stock-in-trade (or the reverse for a gain) |
| Opening stock | Dr stock-in-trade · Cr capital — the fuel in the tanks on day one is an asset, not a windfall |

### 5.3 Gross profit

**Gross profit is revenue less cost of goods sold, and nothing else.** Only
the COGS ledgers carry `isDirectCost`. Transit loss and evaporation are real
costs but are *not* costs of sale, so they sit below gross profit — putting
them above it would quietly distort margin per litre, which is the number a
fuel dealer actually watches.

`npm run verify:accounts` proves this against the seeded data: it recomputes
cost independently from `stock_movements` and asserts it equals the P&L
figure.

### 5.4 Ageing

Ageing is derived from the **customer's ledger**, not from `bills`. Fuel sold
on credit at the pump debits the customer through the shift settlement and
never becomes a bill of its own, so ageing that only read `bills` would print
buckets that did not add up to the outstanding beside them. Receipts are
applied **FIFO against the oldest open item**, which is how a credit account
is actually settled, and which makes the buckets total the outstanding
balance exactly.

Buckets: `0-15`, `16-30`, `31-45`, `46-60`, `61-90`, `90+` days past due. An
invoice not yet due stays in `0-15` — it is outstanding, merely current.

### 5.5 Cash flow

Prepared by the **direct method** from the ledger itself: for every voucher
touching cash or bank, the movement is attributed to the cash-flow category of
the ledgers on the other side of the entry, in proportion to their share. The
last attributed line absorbs the rounding residue, so the statement ties to
the cash ledgers to the paisa. A contra between cash and bank nets to nothing
and is excluded.

Canonical postings:

| Event | Debit | Credit |
|-------|-------|--------|
| Cash sale | Cash in hand | Sales (product) |
| Credit sale | Customer | Sales (product) |
| Card/UPI sale | Card receivable / Bank clearing | Sales (product) |
| Receipt from customer | Cash / Bank | Customer |
| Purchase (fuel) | Stock-in-trade | Supplier |
| Decantation shortage | Stock loss (expense) | Stock-in-trade |
| Shift short | Salesman recovery | Cash in hand |
| Shift excess | Cash in hand | Cash excess (suspense) |
| Card settlement | Bank + MDR charges | Card receivable |
| Salary | Salary expense | Salary payable |

---

## 6. Numbering, dates and locks

* **Number series**: every document type (bill, voucher, receipt, purchase…)
  draws from `number_series` — prefix, current number, width, optional
  financial-year reset. Unique on `(outletId, series, number)`.
* **Financial year** is April–March. `settings: org.financialYearStartMonth`
  default **4**.
* **Dates are stored in UTC** and displayed in **Asia/Kolkata**. A "business
  date" is a plain calendar date (`@db.Date`), not a timestamp — a shift
  belongs to a date, not to a moment.
* **Per-user date lock**: `User.lockFromDate` / `User.lockToDate`. Outside
  that window the user cannot create or modify dated entries.
* **Books closed till**: `Outlet.booksClosedTill`. No one may post on or
  before that date. Only `OWNER` may override; **the override is written to
  `audit_logs` with reason, old value, new value, IP and timestamp.**

---

## 7. Security, permissions and audit

* **Roles**: `OWNER`, `MANAGER`, `ACCOUNTANT`, `CASHIER`, `SALESMAN`,
  `AUDITOR`.
* **Permission matrix**: `permissions` maps `role → module →
  {view, add, modify, delete, approve}`. Editable by `OWNER` in a
  checkbox-grid UI.
* **Per-user overrides**: `user_permissions` overrides the role grant for a
  single user and module (tri-state: inherit / grant / revoke).
* **Login log**: user, timestamp, IP, user-agent/device, success or failure,
  failure reason. Failed logins are logged even when the username does not
  exist (stored as typed, never linked to a user row).
* **Audit log**: written on *every* transactional write — table, record id,
  action, **old value JSON**, **new value JSON**, user, timestamp, IP,
  user-agent. Both logs have viewer screens with filters and export.
* `AUDITOR` has `view` on everything and `add/modify/delete/approve` on
  nothing, including the permission matrix itself.

---

## 8. Design direction

**Not a generic admin template.** This is an instrument panel for someone who
reads numbers fast and does not want to be delighted.

**Feel:** calm, dense, industrial-precise. Closer to a trading terminal or a
flight-deck readout than to a SaaS dashboard.

### Colour

* **Foundation: deep slate.** Backgrounds, surfaces and borders are slate
  steps — no pure black, no pure white.
* **One accent colour** — **petrol-teal** (primary) — used *only* for primary
  actions, the active nav item and focus rings. Amber is the sanctioned
  alternative if teal reads too cool against a customer brand; pick one and
  never use both as accents.
* **Red is reserved exclusively for losses and alerts** — negative variation,
  cash short, overdue credit, stock below reorder, expired licences. Red
  never means "delete button" or "cancel".
* Green is used sparingly, for positive variance and paid status only.
* Everything else is greyscale. Chart series use tints of the slate/teal
  ramp, not a rainbow.

### Type

* **Inter** or **Geist**, with `font-variant-numeric: tabular-nums`
  **globally on every numeric cell**. Digits must sit in columns.
* Numbers right-aligned, always. Labels left-aligned, always.
* Indian grouping everywhere: `12,34,567.89`. Never `1,234,567.89`.
* Negative money uses a leading minus in red — minus *or* parentheses, never
  both; the minus is narrower.

### Layout

* Compact **40 px** table rows. No airy padding — density is the point.
* **Sticky headers**, **sticky first column**, and a **frozen totals row on
  every report**. The total is never scrolled off screen.
* Cards show one number large, its unit small, and its comparison smaller
  still. Three levels of hierarchy, no more.
* Dark mode is a first-class citizen, not an afterthought; persisted per user
  in the database, not in localStorage alone.

### Keyboard

The data-entry screens are used by people who never touch the mouse.

* **Tab follows the physical order of work** — nozzle 1 → nozzle 2 → … → dip
  → density → cash. Not DOM order, not visual order. Physical order.
* **Enter advances** to the next field, and on the last field submits.
* **Ctrl+S saves** from anywhere in a form.
* **Esc** cancels, with a confirm if the form is dirty.
* Every action reachable by keyboard; focus ring always visible (it is the
  accent colour, never removed).

### Accessibility

* Minimum contrast 4.5:1 for text, 3:1 for UI borders, in both themes.
* Colour is never the only signal — a loss is red **and** carries a minus
  sign **and** an icon.
* Tamil (`ta`) strings ship alongside English (`en`) from Phase 1. English is
  the default. Numbers stay in Latin digits in both locales.

---

## 9. Non-negotiable engineering conventions

Restated in full in `CLAUDE.md` / `AGENTS.md` and binding:

1. **Decimal everywhere near money.** Prisma `Decimal` / `decimal.js`. Float
   is forbidden for money, litres, density, rates, percentages.
   Litres 2 dp · rates 2 dp · density 1 dp · amounts 2 dp · internal cost 4 dp.
2. **Indian number format** everywhere: `12,34,567.89`.
3. **No module writes a balance.** Everything posts balanced double-entry
   journal lines.
4. **No hard deletes** on transactional tables — `status` / `isCancelled`
   flags only.
5. **No statutory rate is hard-coded.** GST, VAT, evaporation allowance,
   transit loss, TCS, TDS, permissible variation, ageing buckets — all
   configurable settings with a labelled default.
6. **Every transactional table carries `outletId`** and is indexed on
   `(outletId, date)`.
7. **No placeholder screens, no mock data, no TODOs** in a delivered phase.

---

## 10. Setting keys seeded on every outlet

The authoritative catalogue is `SETTING_DEFINITIONS` in `src/lib/settings.ts`;
`ensureSettingsSeeded()` writes any missing row with its labelled default and
never overwrites a value an outlet has deliberately changed.

| Key | Default | Notes |
|-----|---------|-------|
| `org.financialYearStartMonth` | `4` | April |
| `org.timezone` | `Asia/Kolkata` | Display only; storage is UTC |
| `org.locale` | `en` | `ta` available |
| `stock.allowancePct.MS` | `0.75` | Verify with OMC circular |
| `stock.allowancePct.HSD` | `0.50` | Verify with OMC circular |
| `stock.allowancePct.PREMIUM` | `0.75` | |
| `stock.allowancePct.LUBE` | `0.00` | |
| `stock.transitLossPct` | `0.20` | Decantation |
| `stock.reorderDaysCover` | `2` | Days of cover before alert |
| `stock.waterDipAlertMm` | `25` | Water above this raises a dashboard alert |
| `stock.saleSpikeMultiple` | `3` | Warn above this × the nozzle's 30-day average |
| `quality.densityToleranceKgM3` | `3.0` | ± from invoice density at 15 °C |
| `quality.densityTempCoefficient` | `0.65` | kg/m³ per °C — calibrate to your OMC table |
| `quality.vcfLinearCoefficient` | `0.00105` | Until ASTM table loaded |
| `quality.sampleRetentionDays` | `30` | Retained-sample expiry alert |
| `reminder.defaultAlertBeforeDays` | `30` | Reminder lead time |
| `reminder.stickerSheetRows` / `.stickerSheetColumns` | `5` / `2` | Sample sticker sheet layout on A4 |
| `cash.shortExcessToleranceAmount` | `20.00` | No auto-recovery below this |
| `cash.denominations` | `[500,200,100,50,20,10,5,2,1]` | Counting grid |
| `credit.ageingBuckets` | `[15,30,60,90]` | Day boundaries |
| `credit.blockOnLimitBreach` | `true` | Manager may override |
| `credit.blockOnOverdue` | `false` | Warn by default; optionally block |
| `billing.defaultPrintLayout` | `A5` | `THERMAL_80MM`, `A5` or `A4` |
| `billing.autoRoundOff` | `true` | Round only after line tax totals |
| `notification.sms.provider` / `.endpoint` / `.apiKey` / `.sender` | `CONSOLE` / blank / blank / `FUELBUNK` | Pluggable SMS adapter |
| `notification.email.provider` / `.endpoint` / `.apiKey` / `.from` | `CONSOLE` / blank / blank / `billing@example.invalid` | Pluggable email adapter |
| `tax.fuelRegime` | `VAT_INCLUSIVE` | MS/HSD outside GST |
| `tax.gstPct.lubricant` | `18.00` | |
| `tax.tcsPct` | `0.10` | 206C(1H) |
| `tax.tcsThreshold` | `5000000.00` | |
| `tax.tdsPct.commission` | `5.00` | |
| `security.sessionIdleMinutes` | `60` | |
| `security.maxFailedLogins` | `5` | Then lock |
| `security.lockoutMinutes` | `15` | |

---

## 11. What "done" means for a phase

A phase is delivered only when:

* Every screen in it works against real data — no stubs, no mocks.
* A migration exists and `prisma migrate deploy` runs clean from zero.
* Every money/litre path uses Decimal and has at least one test that fails if
  the arithmetic breaks.
* Every write is audited.
* Permissions are enforced **server-side**, not only in the UI.
* The five-second numbers are still correct.
