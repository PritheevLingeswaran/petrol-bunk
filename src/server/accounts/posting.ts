/**
 * The single door every financial effect goes through.
 *
 * No module anywhere may write a balance. Everything posts balanced journal
 * lines here, and every balance in the system is derived from `voucher_lines`.
 */
import { Prisma, type InstrumentType, type VoucherType } from "@prisma/client";
import { Decimal, round2 } from "@/lib/money";
import { assertBalanced, compactLines, openingBalanceLine, reverseLines, type JournalLine } from "@/lib/accounts";
import { db } from "@/server/db";
import { issueNumber } from "@/server/numbering";

export type Tx = Prisma.TransactionClient;
export { UnbalancedVoucherError } from "@/lib/accounts";
export type { JournalLine } from "@/lib/accounts";

export type PostVoucherInput = {
  outletId: string;
  type: VoucherType;
  businessDate: Date;
  narration?: string;
  lines: (JournalLine | null | undefined)[];
  createdById?: string;
  instrumentType?: InstrumentType;
  instrumentNo?: string;
  instrumentDate?: Date;
  bankName?: string;
  partyAccountId?: string;
  reversesVoucherId?: string;
  /// Idempotency key for derived postings (daily COGS, opening balances).
  sourceKey?: string;
  financialYearStartMonth?: number;
  /** Pre-allocated number, for bulk seeding that bypasses the series counter. */
  number?: { seriesCode: string; seriesNumber: number; docNumber: string };
  // ---- Source document: exactly one, or none for a manual journal ---------
  shiftEntryId?: string;
  shiftSettlementId?: string;
  purchaseId?: string;
  billId?: string;
  receiptId?: string;
  paymentId?: string;
  expenseId?: string;
  stockVariationId?: string;
  cardSettlementId?: string;
  salaryRunId?: string;
};

/**
 * Writes a voucher and its lines. Debits must equal credits or the whole
 * transaction throws before commit — there is no path that leaves the ledger
 * out of balance.
 */
export async function postVoucher(tx: Tx, input: PostVoucherInput) {
  const lines = compactLines(input.lines);
  const { totalDebit, totalCredit } = assertBalanced(lines);

  const number = input.number ?? (await issueNumber(tx, input.outletId, `VOUCHER_${input.type}`, input.businessDate, input.financialYearStartMonth));

  return tx.voucher.create({
    data: {
      outletId: input.outletId,
      type: input.type,
      businessDate: input.businessDate,
      narration: input.narration,
      totalDebit,
      totalCredit,
      seriesCode: number.seriesCode,
      seriesNumber: number.seriesNumber,
      docNumber: number.docNumber,
      createdById: input.createdById,
      instrumentType: input.instrumentType ?? "CASH",
      instrumentNo: input.instrumentNo,
      instrumentDate: input.instrumentDate,
      bankName: input.bankName,
      partyAccountId: input.partyAccountId,
      reversesVoucherId: input.reversesVoucherId,
      sourceKey: input.sourceKey,
      shiftEntryId: input.shiftEntryId,
      shiftSettlementId: input.shiftSettlementId,
      purchaseId: input.purchaseId,
      billId: input.billId,
      receiptId: input.receiptId,
      paymentId: input.paymentId,
      expenseId: input.expenseId,
      stockVariationId: input.stockVariationId,
      cardSettlementId: input.cardSettlementId,
      salaryRunId: input.salaryRunId,
      lines: {
        create: lines.map((line, index) => ({
          outletId: input.outletId,
          accountId: line.accountId,
          businessDate: input.businessDate,
          debit: new Decimal(line.debit ?? 0),
          credit: new Decimal(line.credit ?? 0),
          narration: line.narration,
          productId: line.productId,
          employeeId: line.employeeId,
          quantity: line.quantity === undefined ? null : new Decimal(line.quantity),
          lineNo: index + 1,
        })),
      },
    },
  });
}

/**
 * Cancels a voucher by posting its mirror image rather than deleting it.
 * No hard deletes on transactional tables (CLAUDE.md § 2.4).
 */
export async function reverseVoucher(tx: Tx, voucherId: string, reason: string, userId?: string) {
  const original = await tx.voucher.findUniqueOrThrow({ where: { id: voucherId }, include: { lines: true } });
  if (original.status === "CANCELLED") throw new Error("That voucher has already been cancelled");
  const existing = await tx.voucher.findUnique({ where: { reversesVoucherId: voucherId } });
  if (existing) throw new Error(`Already reversed by ${existing.docNumber}`);

  const reversal = await postVoucher(tx, {
    outletId: original.outletId,
    type: original.type,
    businessDate: original.businessDate,
    narration: `Reversal of ${original.docNumber} — ${reason}`,
    createdById: userId,
    reversesVoucherId: original.id,
    partyAccountId: original.partyAccountId ?? undefined,
    lines: reverseLines(
      original.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
        productId: line.productId ?? undefined,
        employeeId: line.employeeId ?? undefined,
        quantity: line.quantity?.toString(),
      })),
      `Reverse ${original.docNumber}`,
    ),
  });

  await tx.voucher.update({
    where: { id: original.id },
    data: { status: "CANCELLED", cancelledById: userId, cancelledAt: new Date(), cancelReason: reason },
  });
  return reversal;
}

/**
 * Removes a previously posted voucher for a source document so it can be
 * reposted. Used when a draft document is edited before approval; a posted
 * document that has been seen by anyone is reversed instead.
 */
export async function discardVoucherFor(tx: Tx, where: Prisma.VoucherWhereInput) {
  const existing = await tx.voucher.findFirst({ where });
  if (!existing) return null;
  await tx.voucherLine.deleteMany({ where: { voucherId: existing.id } });
  await tx.voucher.delete({ where: { id: existing.id } });
  return existing.id;
}

// ---------------------------------------------------------------------------
// Account resolution
// ---------------------------------------------------------------------------

/** Resolves a system ledger by key, so posting code never hard-codes an id. */
export async function systemAccount(tx: Tx, outletId: string, systemKey: string) {
  const account = await tx.account.findUnique({ where: { outletId_systemKey: { outletId, systemKey } } });
  if (!account) throw new Error(`System ledger "${systemKey}" is not set up for this outlet. Seed the chart of accounts first.`);
  return account;
}

/** System ledger by key, falling back to a plain code, then to a default key. */
export async function resolveAccount(tx: Tx, outletId: string, systemKey: string, fallbackCode?: string) {
  const bySystem = await tx.account.findUnique({ where: { outletId_systemKey: { outletId, systemKey } } });
  if (bySystem) return bySystem;
  if (fallbackCode) {
    const byCode = await tx.account.findUnique({ where: { outletId_code: { outletId, code: fallbackCode } } });
    if (byCode) return byCode;
  }
  throw new Error(`Ledger "${systemKey}" is not set up for this outlet. Run the chart-of-accounts seed.`);
}

/** Every customer has a ledger; it is created on first use, never assumed. */
export async function ensureCustomerLedger(tx: Tx, outletId: string, customerId: string) {
  const customer = await tx.customer.findFirstOrThrow({ where: { id: customerId, outletId } });
  if (customer.accountId) return tx.account.findUniqueOrThrow({ where: { id: customer.accountId } });
  const group = await tx.accountGroup.findFirstOrThrow({ where: { outletId, code: "RECEIVABLE" } });
  const account = await tx.account.upsert({
    where: { outletId_code: { outletId, code: `CUST-${customer.code}` } },
    create: { outletId, groupId: group.id, code: `CUST-${customer.code}`, name: customer.name, nature: "ASSET", normalBalance: "DEBIT" },
    update: { name: customer.name, isActive: true },
  });
  await tx.customer.update({ where: { id: customer.id }, data: { accountId: account.id } });
  return account;
}

export async function ensureSupplierLedger(tx: Tx, outletId: string, supplierId: string) {
  const supplier = await tx.supplier.findFirstOrThrow({ where: { id: supplierId, outletId } });
  if (supplier.accountId) return tx.account.findUniqueOrThrow({ where: { id: supplier.accountId } });
  const group = await tx.accountGroup.findFirstOrThrow({ where: { outletId, code: "CURRENT_LIABILITY" } });
  const account = await tx.account.upsert({
    where: { outletId_code: { outletId, code: `SUPP-${supplier.code}` } },
    create: { outletId, groupId: group.id, code: `SUPP-${supplier.code}`, name: supplier.name, nature: "LIABILITY", normalBalance: "CREDIT" },
    update: { name: supplier.name, isActive: true },
  });
  await tx.supplier.update({ where: { id: supplier.id }, data: { accountId: account.id } });
  return account;
}

export async function ensureEmployeeLedger(tx: Tx, outletId: string, employeeId: string) {
  const employee = await tx.employee.findFirstOrThrow({ where: { id: employeeId, outletId } });
  if (employee.accountId) return tx.account.findUniqueOrThrow({ where: { id: employee.accountId } });
  const group = await tx.accountGroup.findFirstOrThrow({ where: { outletId, code: "RECEIVABLE" } });
  const account = await tx.account.upsert({
    where: { outletId_code: { outletId, code: `EMP-${employee.code}` } },
    create: { outletId, groupId: group.id, code: `EMP-${employee.code}`, name: `${employee.name} (staff)`, nature: "ASSET", normalBalance: "DEBIT" },
    update: { name: `${employee.name} (staff)`, isActive: true },
  });
  await tx.employee.update({ where: { id: employee.id }, data: { accountId: account.id } });
  return account;
}

/** Direct-cost ledger for a product, so gross profit separates by product. */
export async function cogsAccountFor(tx: Tx, outletId: string, isFuel: boolean) {
  return resolveAccount(tx, outletId, isFuel ? "COGS_FUEL" : "COGS_LUBE", isFuel ? "COGS_FUEL" : "COGS_LUBE");
}

// ---------------------------------------------------------------------------
// Opening balances
// ---------------------------------------------------------------------------

/**
 * Converts every stored opening balance into a real OPENING_BALANCE voucher,
 * so that no report ever has to read a balance column. The contra is the
 * capital account, which is what makes an opening trial balance balance.
 *
 * Idempotent: it is skipped once an opening voucher exists for the outlet.
 */
export async function postOpeningBalances(tx: Tx, outletId: string, asOn: Date, createdById?: string) {
  const already = await tx.voucher.findFirst({ where: { outletId, type: "OPENING_BALANCE", status: "POSTED" } });
  if (already) return null;

  const accounts = await tx.account.findMany({ where: { outletId, isActive: true } });
  const lines = accounts
    .map((account) => openingBalanceLine(account.id, account.openingBalance.toString(), account.openingBalanceType, `Opening balance — ${account.name}`))
    .filter((line): line is JournalLine => line !== null);

  if (lines.length === 0) return null;

  // Whatever the opening balances do not settle between themselves is capital.
  let debit = new Decimal(0);
  let credit = new Decimal(0);
  for (const line of lines) {
    debit = debit.plus(new Decimal(line.debit ?? 0));
    credit = credit.plus(new Decimal(line.credit ?? 0));
  }
  const difference = round2(debit.minus(credit));
  if (!difference.isZero()) {
    const capital = await resolveAccount(tx, outletId, "CAPITAL", "CAPITAL");
    lines.push(
      difference.gt(0)
        ? { accountId: capital.id, credit: difference, narration: "Opening balance contra" }
        : { accountId: capital.id, debit: difference.abs(), narration: "Opening balance contra" },
    );
  }

  return postVoucher(tx, { outletId, type: "OPENING_BALANCE", businessDate: asOn, narration: "Opening balances", createdById, lines });
}

// ---------------------------------------------------------------------------
// Derived balances — never stored
// ---------------------------------------------------------------------------

export async function accountBalance(outletId: string, accountId: string, asOf?: Date, client: Tx | typeof db = db): Promise<Decimal> {
  const totals = await client.voucherLine.aggregate({
    where: { outletId, accountId, voucher: { status: "POSTED" }, ...(asOf ? { businessDate: { lte: asOf } } : {}) },
    _sum: { debit: true, credit: true },
  });
  return round2(new Decimal(totals._sum.debit?.toString() ?? "0").minus(new Decimal(totals._sum.credit?.toString() ?? "0")));
}

/** Outstanding for a customer, derived purely from their ledger. */
export async function customerOutstanding(outletId: string, customerId: string, asOf: Date, client: Tx | typeof db = db): Promise<Decimal> {
  const customer = await client.customer.findFirstOrThrow({ where: { id: customerId, outletId }, select: { accountId: true } });
  if (!customer.accountId) return new Decimal(0);
  return accountBalance(outletId, customer.accountId, asOf, client);
}
