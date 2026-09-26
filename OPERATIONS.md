# OPERATIONS.md — Running a Day at the Bunk

This is the order a petrol bunk actually runs, screen by screen. It is written
for the people who use the system every day — the owner, the manager, the
cashier, the salesman — not for developers. (Developers read `CLAUDE.md` and
`PROJECT_SPEC.md`.)

Every number that ends up on the owner's dashboard at night traces back to
something one of these people typed during the day. Do the steps in this
order and the numbers look after themselves; skip one and the day-end
reconciliation will tell you exactly which one.

---

## Before the first vehicle arrives

### 1. Morning dip and density — `/pump/dip-density`

The **first thing** anyone does each day, before the pumps are switched on.

- **Dip every tank.** Lower the calibrated dip rod, read the fuel level in
  millimetres, and enter it as the **Opening** dip for each tank. The screen
  converts mm to litres itself, through that tank's own calibration chart —
  never type a litre figure, only the millimetre reading you actually saw on
  the rod.
- **Water dip.** If there is any water at the bottom of the tank, dip that
  too. Anything above the alert threshold (25 mm by default) is flagged
  immediately, in red, on this screen and on the owner's dashboard.
- **Density.** Once a shift, or whenever something feels off about a tank,
  take a hydrometer reading: observed density and observed temperature. The
  screen corrects it to density at 15°C and compares it against the density
  on the last invoice for that product. Out-of-band readings turn red — this
  is how a wrong delivery or adulteration gets caught, so don't skip it just
  because "it looked fine."

**Who does this:** the salesman or cashier opening the shift.
**Takes:** under two minutes per tank.

### 2. Rate update — `/inventory/prices` (only when the OMC changes the price)

When the OMC notifies a new pump rate — usually at midnight, sometimes
mid-morning — enter it here with the effective date and time **before** the
first sale at the new rate. If the price changes while a shift is already
open, don't panic: the shift-entry screen splits that shift into rate
segments automatically and prices each nozzle's litres against the rate that
was actually in force at the time, to the minute. You will be prompted for
the meter reading at the exact moment of the changeover.

**Who does this:** the manager or owner, as soon as the OMC message arrives.

---

## Through the shift

### 3. Shift entries — `/pump/shift-entry`

The screen every salesman uses, standing at the pump, most of the day.

For each nozzle:

- **Opening reading is already filled in** — it is carried automatically
  from that nozzle's own closing reading last shift. It cannot be edited.
  If it looks wrong, the previous shift was recorded wrong; fix that shift,
  don't override this one.
- Type only the **closing reading** off the meter. Sale litres and sale
  value calculate live as you type.
- **Testing litres**: if the salesman drew fuel into the 5-litre test measure
  to check the meter and poured it back into the tank, enter that figure
  separately. It comes off the customer's bill but never off the tank's
  stock — the fuel physically went back in.
- **Meter rollover**: if the meter has wrapped past its last digit and the
  closing reading looks *lower* than the opening reading, tick "Meter rolled
  over" rather than trying to force a number in. A manager has to approve
  any shift with a rollover on it before it counts as closed.
- **Allocate each nozzle to the salesman who worked it.** This is what
  drives the settlement screen next and, eventually, payroll's recovery of
  any shortfall.
- If a nozzle goes down mid-shift, tick "Taken out of service" and say why.

The screen is built for one thumb on a phone: large numeric fields, the
number pad comes up automatically, Tab moves in the order you actually work
the pump, Enter advances to the next field, and Ctrl+S saves from anywhere.

**One entry per shift, per date.** The system will not let a second entry be
created for a shift that is already recorded — if you need to correct one,
reopen it rather than creating a duplicate.

---

## When a tanker arrives

### 4. Tanker receipt & decantation — `/pump/decantation`

Do this **before** the fuel goes into the tank, and finish it before the
driver leaves.

1. Record the invoice number, supplier, tanker registration, driver,
   transporter, and — critically — whether the **top and bottom seals were
   intact** on arrival. A broken seal is not a paperwork detail; note it and
   pull a sample before decanting.
2. Dip the tank **before** decanting.
3. Decant.
4. Dip the tank **after** decanting.
5. Enter the invoice quantity, invoice density and temperature, and the
   receipt density and temperature you measured off the tanker.

The screen computes what was actually received from the *before* and *after*
dips (never from the invoice figure), compares it against what the invoice
says was loaded, and shows the transit loss in litres and as a percentage.
A loss beyond the configured allowance (0.20% by default) is flagged red
immediately and lands on the owner's dashboard and in the **Tanker receipt
loss** report (`/pump/tanker-loss`) — which groups losses by tanker, driver
and transporter, so a pattern (the same driver, every time) is visible
rather than buried in single-invoice noise.

A large multi-compartment tanker carrying more than one product is entered
as multiple compartments on one invoice.

**Draw a retained sample** (`/pump/samples`) from every decantation — it is
the outlet's defence if an adulteration or short-supply dispute ever comes
up. Print the sticker, seal the bottle, and hold it for the configured
retention period.

**Who does this:** the manager, or whoever is on duty when the tanker
arrives — never delegate this to the tanker driver's paperwork alone.

---

## End of shift

### 5. Shift cash closing & salesman settlement — `/pump/settlement`

Once a shift is done, **each salesman settles separately**, not as one lump
figure for the shift.

1. Choose the salesman.
2. **Count the cash** and enter it into the denomination grid — how many
   ₹500 notes, ₹200 notes, and so on down to loose coins. The grid totals
   itself.
3. Enter the **declared cash** — what you are actually handing over.

**If the grid total and the declared cash don't match, the system refuses
to save.** This is deliberate. Recount, or if you are certain of the
difference, tick the acknowledgement box and write down why. That
acknowledgement is recorded and audited — it is not a way to skip the count,
it is a way to be honest about a difference you can explain.

4. Enter card and UPI collections with their machine or wallet and
   settlement reference, any credit sales issued (customer, vehicle, slip
   number), own-use or staff-vehicle fuel, and any expense paid out of the
   shift's cash (with the expense head).

The screen totals the salesman's sale value against everything they have
accounted for and shows the **short or excess** prominently. A short posts
straight to that salesman's own ledger as a recoverable amount — it is
never just a number that gets forgotten. It shows up again at month end on
`/payroll/salary-runs` as a deduction against that salesman's pay, and every
outstanding recoverable balance is visible on `/payroll/employee-ledger`.

**Who does this:** the cashier, with each salesman present for their own
count.

---

## Through the day, as it happens

### 6. Credit billing — `/billing/credit`, `/billing/cash`, `/billing/counter`

A regular credit customer's fuel is usually issued against a **credit slip**
at the nozzle during the shift (captured as part of the settlement above)
and converted to a proper bill here, or billed directly if the customer is
at the counter. Cash sales and counter sales (lubricants, AdBlue, and so on)
go through their own screens.

If a customer's outstanding balance would go over their credit limit, the
system either **warns** or **blocks** the bill, according to the outlet's
own setting (`/billing/settings`) — it is never hard-coded. A manager can
override a block, and that override is written to the audit log.

Cash and counter bills print immediately (thermal, A5 or A4, your choice).
Every bill — cash or credit — posts straight to the ledger: the customer's
account or the cash account is debited, and the sales account is credited,
the moment the bill is saved. There is no separate "post to accounts" step.

If the network drops while billing on a phone or tablet
(`/billing/mobile`), the bill queues on the device and syncs the moment the
connection returns — it cannot be created twice by a retry, and it cannot be
lost either.

### 7. Reminders — `/pump/reminders`

Anything with a date — a licence renewal, a calibration due date, an
insurance renewal, a cheque due, a customer to follow up — goes in here as
it comes up, not saved for later. Anything due within 30 days shows on the
owner's dashboard automatically.

---

## Closing the day

### 8. Day-end stock variation — `/pump/variation`

Once every tank has its **closing dip** for the day (step 1's opening dip
for tomorrow), reconcile each tank: opening stock, what was received,
what was sold, book stock, physical (dip) stock, and the variation between
them.

A variation inside the permitted allowance — 0.75% of sales for petrol,
0.50% for diesel, by default, but check the outlet's own configured figures
— is normal evaporation and metering tolerance and needs no action. A
variation **beyond** the allowance is flagged red, valued in rupees at
purchase cost (not selling price — a loss is a loss of cost, not of
margin), and shows on the owner's dashboard immediately. This report, more
than any other, is what catches fuel theft — read it every day, not just
when something feels wrong.

### 9. Daily Sales Report (DSR)

One click from the owner's dashboard ("Daily Sales Report", top right), or
directly at `/api/reports/dsr?date=YYYY-MM-DD`. It is the single sheet
covering the whole day: every nozzle reading, sale by product, every mode of
collection, the dip and density register, the stock variation, and the
day's cash position, with any exception called out at the top in red.
Download it as PDF to print and sign, or as Excel to file.

This is generated **after** steps 1–8 are done for the day — it can only
show what has actually been entered.

---

## The owner's review

### 10. Owner dashboard — `/` (the app's home screen)

Everything above lands here automatically. Open the app and, within a few
seconds:

| What you see | Where it comes from |
|---|---|
| Today's sale in litres and rupees, gross profit, cash in hand, total outstanding, stock value — each with a 30-day trend | Every shift entry and settlement posted so far today |
| Sale by product and how it was collected (cash / card / UPI / credit) | The day's shift settlements |
| **Alerts**, most serious first — cash short, stock variation beyond limit, density out of band, water in a tank, a tank at reorder level, a credit limit breached, overdue bills, a licence or calibration due within 30 days, a shift not yet entered | Every screen above, in one place |
| 30-day and 12-month trend, margin per litre by product | The posted ledger |
| Top ten credit customers by outstanding, and the salesman league table for the month (litres, sale, short/excess, recoverable) | Accounts and payroll |

Click any alert and it takes you straight to the screen that fixes it — a
cash short opens that shift's settlement, a stock variation opens that
tank's reconciliation, an overdue bill opens the ageing report.

A **salesman** who opens the same screen sees only litres, their own
settlement line, and the operational alerts they can act on (stock, water,
density, a pending shift) — never the outlet's cash position, its
outstanding, or another salesman's figures. That is enforced on the server,
not just hidden on the screen.

The date-range picker and outlet switcher at the top control the whole
dashboard, including the DSR button, which always builds for the date
currently selected.

---

## If a number looks wrong

Work backwards through this same order:

1. **Dashboard alert points at a screen** — open it, the detail line says
   exactly what and where.
2. **Cash doesn't tally** — re-open that shift's settlement
   (`/pump/settlement`) and check the denomination grid against what was
   declared.
3. **Stock doesn't tally** — check the day's dip readings
   (`/pump/dip-density`) were taken correctly, and that every nozzle
   reading and tanker receipt for the day is in.
4. **A customer's balance looks wrong** — their statement
   (`/accounts/statements`) lists every bill and receipt in order, running
   balance beside each one.
5. **The books themselves** — `/accounts/trial-balance` shows a loud red
   banner the moment debits and credits disagree by even a paisa; it should
   never happen, and if it does, note the date and stop — do not keep
   posting on top of it.

Nothing in this system is ever silently adjusted. A wrong entry is
corrected by reversing it and posting the right one — the trail always
shows both.
