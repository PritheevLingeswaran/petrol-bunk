# CLAUDE.md / AGENTS.md — Engineering Rules

> ## Read `PROJECT_SPEC.md` before any work.
> It holds the business domain, the formulas, the module list and the design
> direction. This file holds only *how* to write the code. If the two ever
> disagree, `PROJECT_SPEC.md` wins on domain and this file wins on style.
>
> `CLAUDE.md` and `AGENTS.md` are byte-identical copies. Edit one, copy to
> the other.

---

## 0. Project in one line

Multi-outlet management system for Indian retail fuel outlets (petrol bunks):
pump operations, billing, double-entry accounts, inventory, payroll, user
control, dashboard and reports. Built in 7 phases. See `PROJECT_SPEC.md § 3`
for what is in each phase and which phase we are in.

**Delivered: Phases 1–7** (foundation, master data, pump operations, billing,
accounts, inventory, payroll, user control, dashboard and reports). All seven
phases are now built; see `PROJECT_SPEC.md § 3` for what each one contains
and `OPERATIONS.md` for how a bunk actually uses them day to day.

### Where the arithmetic lives

Every formula the business depends on is a **pure function** in
`src/lib/pump.ts` or `src/lib/billing.ts` — no database, no clock, no I/O — so
it can be tested directly. Server actions wire the database to those functions
and back; they never do arithmetic inline. `tests/pump.test.ts` and
`tests/billing.test.ts` cover them.

### The ledger

`src/server/accounts/posting.ts` is the **only** door into the books. Every
financial effect — from any module — calls `postVoucher()`, which throws
before commit unless debits equal credits. Nothing anywhere writes a balance
column; every balance in the system is derived from `voucher_lines`.

A posted voucher is never edited or deleted: correcting one posts its
reversal and then the replacement.

Run `npm run verify:accounts` after touching anything that posts. It proves,
against the seeded 90 days, that the trial balance is zero, that gross profit
equals revenue less a cost recomputed independently from the stock ledger, and
that a credit bill ages and clears correctly.

Run `npm run acceptance` after touching anything the dashboard or a report
reads. It is the full Phase 7 acceptance suite — eighteen checks, including
that the dashboard withholds every rupee figure from a SALESMAN **at the
query layer**, not just in the component: a viewer that cannot see money is
never handed the data to hide, so nothing can leak through the RSC payload.

### Four traps that are already fixed and must not be reintroduced

1. **`decimal.js` stores zero with a positive sign.** `isPositive()` is `true`
   for `0` and `isNegative()` is `false` for it. Use `lt(0)` / `gt(0)` /
   `lte(0)` for any strict comparison — `isPositive()` on a balanced shift
   reports a cash excess.
2. **Testing litres reduce the sale but never the tank stock.** They turned the
   meter and went back into the tank. Deducting them from stock loses ~5 L per
   shift, about 5,000 L a year.
3. **A business date is UTC midnight of the calendar day**, built by
   `businessDateFromInput`. Never build one with `fromZonedTime` — that gives
   18:30 UTC of the *previous* day, which makes every `lte` range filter
   silently drop the final day and writes dated rows one day early. Only real
   moments (a price effective-from, a shift open time) are timezone-converted.
4. **Gross profit is revenue less cost of goods *sold*.** Only the COGS
   ledgers carry `isDirectCost`. Stock and transit losses belong below gross
   profit; moving them above it quietly distorts margin per litre.

---

## 1. Stack — fixed, do not substitute

| Concern | Choice |
|---------|--------|
| Framework | **Next.js 14+ App Router**, React Server Components by default |
| Language | **TypeScript**, `strict: true`, no `any` in committed code |
| Styling | **Tailwind CSS** + **shadcn/ui** (components vendored into `src/components/ui`) |
| Database | **PostgreSQL** via **Prisma**, real migrations (`prisma migrate dev`), never `db push` on anything shared |
| Auth | **NextAuth v5 (Auth.js)**, Credentials provider, JWT session |
| Charts | **Recharts** |
| Tables | **TanStack Table v8** |
| Forms | **react-hook-form** + **zod** (one zod schema per form, shared client/server) |
| Dates | **date-fns** + `date-fns-tz`. Store UTC, display `Asia/Kolkata` |
| Money | **Prisma Decimal** / **decimal.js** |
| Excel | **ExcelJS** |
| PDF | Server-side rendering (`@react-pdf/renderer` or Puppeteer) — never client-only |
| i18n | Lightweight dictionary (`src/i18n/en.ts`, `src/i18n/ta.ts`) — no heavy runtime |
| PWA | Manifest + service worker; app must install and shell-load offline |

Adding a dependency requires a reason written in the PR/commit message. Prefer
the platform, then what is already installed, then a new package.

---

## 2. The seven non-negotiables

1. **Decimal for every money, litre, rate, density and percentage value.**
   Prisma `Decimal` in the schema, `decimal.js` in code. `number` may not
   appear in any arithmetic that reaches a rupee or a litre. No `parseFloat`,
   no `+`, no `toFixed` on money. Precision: litres 2 dp · rates 2 dp ·
   density 1 dp · amounts 2 dp · internal weighted-average cost 4 dp.
   Round **half-up**, and only at the last step.
2. **Indian number format everywhere**: `12,34,567.89`. Never
   `1,234,567.89`. One formatter, `src/lib/format.ts`, used by everything.
3. **No module writes a balance.** Every financial effect goes through
   `postVoucher()` as balanced double-entry lines. Debits must equal credits
   or the transaction throws before commit.
4. **No hard deletes on transactional tables.** Cancel/void with a status
   flag, a reason, a user and a timestamp. `DELETE` is allowed only on
   configuration rows that have never been referenced.
5. **No statutory rate is hard-coded.** GST, VAT, evaporation allowance,
   transit loss, TCS, TDS, permissible variation, ageing buckets, cash
   tolerance — all come from `settings` with a labelled default. A grep for a
   hard-coded `0.18` or `0.75` in business logic is a bug.
6. **Every transactional table carries `outletId`** and is indexed on
   `(outletId, <businessDate>)`. Every query filters by outlet. There is no
   "current outlet" global — it comes from the session and is passed down.
7. **No placeholder screens, no mock data, no TODOs** in a delivered phase.
   If it ships, it works against real data.

---

## 3. Folder structure

```
/
├─ PROJECT_SPEC.md            ← domain truth. Read first.
├─ CLAUDE.md / AGENTS.md      ← this file (identical copies)
├─ README.md                  ← setup, env vars, commands
├─ prisma/
│  ├─ schema.prisma           ← ALL tables for all 7 phases
│  ├─ migrations/             ← real, committed, never edited after apply
│  └─ seed.ts                 ← idempotent seed
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/
│  │  ├─ (app)/               ← authenticated shell: sidebar + header
│  │  │  ├─ pump/             ← Phase 3: shift-entry, settlement, dip-density,
│  │  │  │                       decantation, variation, density-register,
│  │  │  │                       tanker-loss, samples, reminders + hardware masters
│  │  │  ├─ billing/          ← Phase 4
│  │  │  ├─ inventory/        ← prices, calibration, suppliers
│  │  │  ├─ accounts/         ← Phase 5
│  │  │  ├─ payroll/          ← Phase 6
│  │  │  ├─ reports/          ← Phase 7
│  │  │  └─ admin/            ← users, roles, permissions, settings, logs
│  │  └─ api/                 ← only where a route handler is genuinely needed
│  ├─ components/
│  │  ├─ ui/                  ← shadcn primitives, unmodified where possible
│  │  ├─ shell/               ← sidebar, header, outlet switcher, theme, date range
│  │  └─ data/                ← DataTable, NumberCell, MoneyCell, TotalsRow
│  ├─ server/
│  │  ├─ auth.ts              ← NextAuth config
│  │  ├─ db.ts                ← Prisma client singleton
│  │  ├─ guard.ts             ← requirePermission / requireUnlockedDate
│  │  ├─ audit.ts             ← withAudit() wrapper
│  │  └─ <module>/            ← actions + services per module
│  ├─ lib/
│  │  ├─ money.ts             ← Decimal helpers, round2, round4
│  │  ├─ pump.ts              ← EVERY business formula, pure, testable
│  │  ├─ dip.ts               ← calibration-chart interpolation
│  │  ├─ format.ts            ← Indian grouping, litres, density, dates
│  │  ├─ date.ts              ← UTC ↔ Asia/Kolkata, business date
│  │  └─ settings.ts          ← setting catalogue + labelled defaults
│  ├─ i18n/                   ← en.ts (default), ta.ts
│  └─ types/
└─ tests/
```

Rules:
* **Server Components by default.** `"use client"` only for interactivity,
  and as deep in the tree as possible.
* **Server Actions for writes.** Every write action begins with
  `requirePermission(module, 'add'|'modify'|'delete'|'approve')` and
  `requireUnlockedDate(date)`, and ends inside `withAudit()`.
* One module = one folder under `src/server/`. Cross-module calls go through
  the module service, never straight to another module's Prisma models.

---

## 4. Money and numbers

```ts
// src/lib/money.ts
import { Decimal } from "decimal.js";
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
```

* Prisma returns `Decimal`. Keep it a `Decimal` all the way to the formatter.
* Never send `Decimal` across the Server → Client boundary as an object;
  serialise with `.toFixed(dp)` (a string) and format on the client.
* `formatINR(value, dp)` is the only place grouping logic lives:
  `12,34,567.89`. Implemented with `Intl.NumberFormat("en-IN")` and verified
  by a test, not assumed.
* Negative money renders red with a leading minus. Zero renders as `0.00`,
  never as a blank or a dash.
* Every numeric table cell: right-aligned, `tabular-nums`, fixed decimals.

---

## 5. Dates

* Persist timestamps as UTC `DateTime`. Persist business dates as
  `@db.Date` — a shift belongs to a calendar date, not to a moment.
* All display and all date pickers operate in `Asia/Kolkata`.
* Never build a date from a string without a timezone. Never use
  `new Date(y, m, d)` for a business date.
* Two locks apply to every dated write, in this order:
  1. `Outlet.booksClosedTill` — nobody posts on or before it, except `OWNER`
     with an explicit override that is written to `audit_logs`.
  2. `User.lockFromDate` / `User.lockToDate` — the user's own window.

---

## 6. Permissions

* Modules are the enum `ModuleName` in the schema. Actions are
  `view | add | modify | delete | approve`.
* Effective permission = role grant from `permissions`, overridden by
  `user_permissions` when that row sets an explicit grant/revoke.
* **Enforced server-side in `requirePermission()`.** Hiding a button is a
  courtesy, not a control.
* `AUDITOR` can never be granted a write action; the matrix UI and the server
  both refuse it.
* `OWNER` is the only role that can edit the matrix, override the books-close
  date, or change a user's date lock.

---

## 7. Auditing

Every transactional write passes through:

```ts
withAudit({ table, recordId, action, oldValue, newValue }, fn)
```

which records the old JSON, the new JSON, the user, the timestamp, the IP and
the user-agent in the same transaction as the write. A write that cannot be
audited does not happen.

Login attempts — success and failure — are written to `login_logs` with IP
and device, including attempts for usernames that do not exist.

---

## 8. UI rules (short form — full direction in `PROJECT_SPEC.md § 8`)

* Deep slate foundation, **one** accent (petrol-teal) for primary actions
  only. **Red exclusively for losses and alerts.**
* Inter/Geist, tabular figures, numeric columns right-aligned.
* 40 px rows, sticky header, sticky first column, **frozen totals row on
  every report**.
* Keyboard: Tab follows the physical order of work, Enter advances, Ctrl+S
  saves, Esc cancels with a dirty-check.
* Dark/light toggle persisted on the user row.
* All user-facing strings go through the i18n dictionary. English default,
  Tamil shipped.

---

## 9. Validation and errors

* One zod schema per form, exported from the module and used by **both** the
  client form and the server action. No duplicated validation.
* Server actions return `{ ok: true, data }` or `{ ok: false, error, fieldErrors }`.
  Never throw raw errors to the client.
* Validate at the trust boundary always — a server action never trusts a
  client-supplied `outletId`, `userId`, amount or date.

---

## 10. Testing

* Every non-trivial money/litre/stock formula gets a test that fails if the
  arithmetic breaks. Shift sale, cash reconciliation, book stock, dip
  interpolation, variation, ageing, voucher balancing — all covered.
* Meter rollover, mid-shift price change, zero-sale shift, cancelled bill and
  credit-limit breach are the edge cases that must have tests.
* No framework ceremony beyond what is needed to run those tests.

---

## 11. Migrations

* Real migrations only, committed to the repo.
* The Phase 1 schema covers all 7 phases, so later phases should be additive.
* Never edit an applied migration. Never `migrate reset` against anything but
  a local dev database.

---

## 12. Commit / session hygiene

* At the end of a phase, update `PROJECT_SPEC.md § 3` to mark it delivered and
  note anything discovered about the domain.
* If a decision contradicts this file, change this file in the same commit —
  the next session reads it, not the chat history.
