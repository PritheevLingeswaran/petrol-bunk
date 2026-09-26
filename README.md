# Petrol Bunk Management System

Management system for Indian retail fuel outlets. **Read `PROJECT_SPEC.md`
before changing anything** — it holds the business domain and every formula.
Coding rules are in `CLAUDE.md` (= `AGENTS.md`).

Delivered: **Phase 1** foundation · **Phase 2** master data · **Phase 3** pump
operations · **Phase 4** billing · **Phase 5** accounts · **Phase 6** inventory,
payroll and user control · **Phase 7** owner dashboard, DSR and reports. All
seven phases are complete. **See `OPERATIONS.md` for the daily workflow.**

## Setup

```bash
npm install

# Postgres 14+ must be reachable at DATABASE_URL.
# Locally:  docker run -d --name pb-postgres -p 5432:5432 \
#             -e POSTGRES_USER=u -e POSTGRES_PASSWORD=p -e POSTGRES_DB=petrolbunk \
#             postgres:16-alpine

npx prisma migrate deploy     # apply the committed migrations
npx prisma generate
npm run db:seed               # masters + 90 days of history

npm run dev                   # http://localhost:3000
```

Sign in as `owner` / `ChangeMe123!` (the account is flagged to change its
password on first login).

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | yes in production | Session signing key (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | yes in production | Public base URL of the app |

`.env` example:

```
DATABASE_URL="postgresql://u:p@localhost:5432/petrolbunk?schema=public"
NEXTAUTH_SECRET="replace-me"
NEXTAUTH_URL="http://localhost:3000"
```

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Vitest — the business arithmetic |
| `npm run db:seed` | Masters, settings and 90 days of history, posted to the ledger (idempotent) |
| `npm run verify:accounts` | Proves the trial balance is zero, gross profit ties to the stock ledger, and credit ages and clears correctly |
| `npm run acceptance` | The full Phase 7 acceptance suite — all 18 checks, including that the dashboard withholds money from a SALESMAN at the server |
| `npx prisma migrate dev --name <change>` | New migration after a schema edit |
| `npx prisma studio` | Inspect the database |

## What the seed creates

Two outlets (`MAIN`, `NORTH`) with products, tanks and calibration charts,
dispensing units, nozzles, shifts, 25 credit customers, employees, suppliers,
a chart of accounts, payment modes and expense heads — plus, for `MAIN`,
**90 days of operating history**: three shifts a day with chained nozzle
readings, weekly tanker receipts, daily dips and salesman settlements.

Two anomalies are planted on purpose so the alerts are visibly working:

| Anomaly | Where to see it |
|---------|-----------------|
| Cash short on the morning shift, 17 days ago | Shift cash closing · the salesman's recoverable balance |
| Tanker `TN 23 BZ 9041` (Velan Carriers) losing ~180 L, 24 days ago | Tanker-wise receipt loss · density register |

The seed is idempotent — masters upsert, and history is skipped if the outlet
already has shift entries.

## Where the arithmetic lives

Every formula is a pure function in [`src/lib/pump.ts`](src/lib/pump.ts) with
no database, clock or I/O, tested directly in
[`tests/pump.test.ts`](tests/pump.test.ts). Server actions wire the database to
those functions; they never compute inline.

## The books

Phase 5 makes the system a real double-entry ledger. Every transaction any
module writes — a shift close, a tanker receipt, a bill, a stock variation —
posts balanced journal lines through `postVoucher()`. No module writes a
balance; every figure on every report is derived from `voucher_lines`.

```bash
npm run verify:accounts
```

checks, against the seeded 90 days:

| Check | What it proves |
|-------|----------------|
| Trial balance | Debits equal credits, on the closing date and on every individual day |
| Gross profit | Equals revenue less a cost of goods sold recomputed independently from `stock_movements` |
| Credit cycle | A credit bill raises outstanding, lands in the right ageing bucket, and is cleared exactly by a receipt |
| Exports | All 13 Excel workbooks and every PDF report render |

Reports live under **Accounts** in the sidebar: vouchers, ledger, trial
balance, P&L, balance sheet, cash flow, cash and bank books with
reconciliation, debtors, ageing, customer statements, month-wise summary and
GST returns. Each one exports to Excel and PDF and has a print stylesheet.
