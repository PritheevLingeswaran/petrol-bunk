import { Prisma, type NotificationChannel } from "@prisma/client";
import { Decimal, round2 } from "@/lib/money";
import { validateEInvoice } from "@/lib/billing";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";

export type BillingTx = Prisma.TransactionClient;

export async function customerOutstanding(outletId: string, customerId: string, asOf: Date, client: BillingTx | typeof db = db) {
  const customer = await client.customer.findFirstOrThrow({ where: { id: customerId, outletId }, select: { accountId: true, openingBalance: true, openingBalanceType: true } });
  let outstanding = new Decimal(customer.openingBalance.toString());
  if (customer.openingBalanceType === "CREDIT") outstanding = outstanding.negated();
  if (customer.accountId) {
    const aggregate = await client.voucherLine.aggregate({ where: { outletId, accountId: customer.accountId, businessDate: { lte: asOf }, voucher: { status: "POSTED" } }, _sum: { debit: true, credit: true } });
    outstanding = outstanding.plus(new Decimal(aggregate._sum.debit?.toString() ?? "0")).minus(new Decimal(aggregate._sum.credit?.toString() ?? "0"));
  }
  const overdueBills = await client.bill.findMany({ where: { outletId, customerId, type: { in: ["CREDIT", "CONSOLIDATED"] }, status: "POSTED", dueDate: { lt: asOf } }, select: { totalAmount: true, paidAmount: true } });
  const overdue = overdueBills.reduce((total, bill) => total.plus(new Decimal(bill.totalAmount.toString()).minus(new Decimal(bill.paidAmount.toString()))), new Decimal(0));
  return { outstanding: round2(outstanding), overdue: round2(overdue) };
}

export async function ensureCustomerLedger(tx: BillingTx, outletId: string, customerId: string) {
  const customer = await tx.customer.findFirstOrThrow({ where: { id: customerId, outletId } });
  if (customer.accountId) return tx.account.findUniqueOrThrow({ where: { id: customer.accountId } });
  const group = await tx.accountGroup.findFirstOrThrow({ where: { outletId, code: "RECEIVABLE" } });
  const account = await tx.account.upsert({
    where: { outletId_code: { outletId, code: `CUST-${customer.code}` } },
    create: { outletId, groupId: group.id, code: `CUST-${customer.code}`, name: customer.name, nature: "ASSET", normalBalance: "DEBIT", openingBalance: new Decimal(0), openingBalanceType: "DEBIT" },
    update: { name: customer.name, isActive: true },
  });
  await tx.customer.update({ where: { id: customer.id }, data: { accountId: account.id } });
  return account;
}

export type EInvoicePayload = {
  Version: "1.1";
  TranDtls: { TaxSch: "GST"; SupTyp: "B2B" | "B2C"; RegRev: "N"; IgstOnIntra: "N" };
  DocDtls: { Typ: "INV" | "CRN"; No: string; Dt: string };
  SellerDtls: { Gstin: string; LglNm: string; Addr1: string; Loc: string; Pin: number; Stcd: string };
  BuyerDtls: { Gstin: string; LglNm: string; Pos: string; Addr1: string; Loc: string; Pin: number; Stcd: string };
  ItemList: { SlNo: string; PrdDesc: string; IsServc: "N"; HsnCd: string; Qty: number; Unit: string; UnitPrice: number; TotAmt: number; Discount: number; AssAmt: number; GstRt: number; IgstAmt: number; CgstAmt: number; SgstAmt: number; CesRt: number; CesAmt: number; TotItemVal: number }[];
  ValDtls: { AssVal: number; CgstVal: number; SgstVal: number; IgstVal: number; CesVal: number; Discount: number; OthChrg: number; RndOffAmt: number; TotInvVal: number };
};

const eDate = (date: Date) => `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;

export async function buildEInvoice(outletId: string, billId: string): Promise<{ payload: EInvoicePayload | null; missing: string[] }> {
  const bill = await db.bill.findFirstOrThrow({ where: { id: billId, outletId }, include: { outlet: { include: { firm: true } }, customer: true, lines: { include: { product: true }, orderBy: { lineNo: "asc" } } } });
  const firm = bill.outlet.firm;
  const customer = bill.customer;
  const supplierAddress = [firm?.addressLine1, firm?.addressLine2].filter(Boolean).join(", ");
  const buyerAddress = [customer?.addressLine1, customer?.addressLine2].filter(Boolean).join(", ");
  const missing = validateEInvoice({
    supplierGstin: firm?.gstin,
    supplierLegalName: firm?.legalName ?? firm?.name,
    supplierAddress,
    supplierLocation: firm?.city,
    supplierPincode: firm?.pincode,
    supplierStateCode: firm?.stateCode,
    documentNumber: bill.docNumber,
    documentDate: eDate(bill.businessDate),
    buyerGstin: customer?.gstin,
    buyerLegalName: customer?.name,
    buyerAddress,
    buyerLocation: customer?.city,
    buyerPincode: customer?.pincode,
    buyerStateCode: customer?.gstin?.slice(0, 2),
    lines: bill.lines.map((line) => ({ hsnCode: line.hsnCode ?? line.product.hsnCode, quantity: line.quantity.toString(), taxableValue: line.taxableValue.toString(), gstPct: line.gstPct?.toString() ?? "0" })),
  });
  if (missing.length) return { payload: null, missing };
  const payload: EInvoicePayload = {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: customer?.gstin ? "B2B" : "B2C", RegRev: "N", IgstOnIntra: "N" },
    DocDtls: { Typ: bill.type === "CREDIT_NOTE" ? "CRN" : "INV", No: bill.docNumber, Dt: eDate(bill.businessDate) },
    SellerDtls: { Gstin: firm!.gstin!, LglNm: firm!.legalName ?? firm!.name, Addr1: supplierAddress, Loc: firm!.city ?? "", Pin: Number(firm!.pincode), Stcd: firm!.stateCode! },
    BuyerDtls: { Gstin: customer!.gstin!, LglNm: customer!.name, Pos: customer!.gstin!.slice(0, 2), Addr1: buyerAddress, Loc: customer!.city ?? "", Pin: Number(customer!.pincode), Stcd: customer!.gstin!.slice(0, 2) },
    ItemList: bill.lines.map((line, index) => ({ SlNo: String(index + 1), PrdDesc: line.description ?? line.product.name, IsServc: "N", HsnCd: line.hsnCode ?? line.product.hsnCode!, Qty: Number(line.quantity.toString()), Unit: line.unit === "LITRE" ? "LTR" : "NOS", UnitPrice: Number(line.rate.toString()), TotAmt: Number(new Decimal(line.quantity.toString()).mul(line.rate.toString()).toFixed(2)), Discount: Number(line.discount.toString()), AssAmt: Number(line.taxableValue.toString()), GstRt: Number(line.gstPct?.toString() ?? "0"), IgstAmt: Number(line.igstAmount.toString()), CgstAmt: Number(line.cgstAmount.toString()), SgstAmt: Number(line.sgstAmount.toString()), CesRt: Number(line.cessPct?.toString() ?? "0"), CesAmt: Number(line.cessAmount.toString()), TotItemVal: Number(line.amount.toString()) })),
    ValDtls: { AssVal: Number(bill.taxableValue.toString()), CgstVal: Number(bill.cgstAmount.toString()), SgstVal: Number(bill.sgstAmount.toString()), IgstVal: Number(bill.igstAmount.toString()), CesVal: Number(bill.cessAmount.toString()), Discount: Number(bill.discount.toString()), OthChrg: 0, RndOffAmt: Number(bill.roundOff.toString()), TotInvVal: Number(bill.totalAmount.toString()) },
  };
  return { payload, missing: [] };
}

type Delivery = { messageId?: string };
type NotificationProvider = { name: string; send(channel: NotificationChannel, recipient: string, subject: string, body: string): Promise<Delivery> };

class ConsoleProvider implements NotificationProvider {
  name = "CONSOLE";
  async send(channel: NotificationChannel, recipient: string, subject: string, body: string): Promise<Delivery> {
    console.info(`[billing:${channel}] ${recipient} | ${subject} | ${body}`);
    return { messageId: `console-${Date.now()}` };
  }
}

class GenericJsonProvider implements NotificationProvider {
  name = "GENERIC_JSON";
  constructor(private endpoint: string, private apiKey: string, private sender: string) {}
  async send(channel: NotificationChannel, recipient: string, subject: string, body: string): Promise<Delivery> {
    const response = await fetch(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ channel, to: recipient, from: this.sender, subject, body }) });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    const result = await response.json() as { id?: string };
    return { messageId: result.id };
  }
}

async function providerFor(outletId: string, channel: NotificationChannel): Promise<NotificationProvider> {
  const settings = await loadSettings(outletId);
  const stem = channel === "SMS" ? "notification.sms" : "notification.email";
  const provider = settings.raw(`${stem}.provider`);
  const endpoint = settings.raw(`${stem}.endpoint`);
  const apiKey = settings.raw(`${stem}.apiKey`);
  const sender = settings.raw(channel === "SMS" ? "notification.sms.sender" : "notification.email.from");
  return provider === "GENERIC_JSON" && endpoint && apiKey ? new GenericJsonProvider(endpoint, apiKey, sender) : new ConsoleProvider();
}

export async function sendBillNotifications(billId: string, channels: NotificationChannel[]): Promise<void> {
  const bill = await db.bill.findUniqueOrThrow({ where: { id: billId }, include: { customer: true, outlet: true } });
  for (const channel of channels) {
    const recipient = channel === "SMS" ? bill.customer?.statementMobile ?? bill.customer?.phone : bill.customer?.statementEmail ?? bill.customer?.email;
    if (!recipient) continue;
    const provider = await providerFor(bill.outletId, channel);
    const log = await db.billNotification.create({ data: { outletId: bill.outletId, billId, channel, recipient, provider: provider.name } });
    try {
      const delivery = await provider.send(channel, recipient, `Invoice ${bill.docNumber}`, `${bill.outlet.name}: invoice ${bill.docNumber} for INR ${new Decimal(bill.totalAmount.toString()).toFixed(2)}. Download: /api/billing/pdf?ids=${bill.id}&layout=A5`);
      await db.billNotification.update({ where: { id: log.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: delivery.messageId } });
    } catch (error) {
      await db.billNotification.update({ where: { id: log.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Provider failed" } });
    }
  }
}

export const auditJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
