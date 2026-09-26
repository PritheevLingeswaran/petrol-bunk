import QRCode from "qrcode";
import { PrintControls } from "@/components/billing/print-controls";
import { formatINR, formatNumber } from "@/lib/format";
import { getPrintableBills } from "@/server/billing/queries";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { ids?: string; layout?: string } }) {
  const ids = searchParams.ids?.split(",").filter(Boolean) ?? [];
  const layout = searchParams.layout === "THERMAL_80MM" || searchParams.layout === "A4" ? searchParams.layout : "A5";
  const bills = await getPrintableBills(ids);
  const qrs = await Promise.all(bills.map((bill) => bill.signedQr ? QRCode.toDataURL(bill.signedQr, { margin: 0, width: 180 }) : null));
  return <div className={`print-stage layout-${layout.toLowerCase()}`}>
    <PrintControls ids={ids} layout={layout} />
    {bills.map((bill, billIndex) => <article className="invoice-sheet" key={bill.id}>
      <header><div><h1>{bill.outlet.firm?.legalName ?? bill.outlet.name}</h1><p>{[bill.outlet.addressLine1, bill.outlet.city, bill.outlet.state, bill.outlet.pincode].filter(Boolean).join(", ")}</p><p>GSTIN: {bill.outlet.gstin ?? bill.outlet.firm?.gstin ?? "—"}</p></div><div className="invoice-number"><span>{bill.invoiceKind === "GST_INVOICE" ? "TAX INVOICE" : "BILL OF SUPPLY"}</span><strong>{bill.docNumber}</strong></div></header>
      {bill.status === "CANCELLED" && <div className="cancel-stamp">CANCELLED</div>}
      <section className="invoice-meta"><div><span>Date / time</span><b>{bill.businessDate.toISOString().slice(0, 10)} · {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(bill.billedAt)}</b></div><div><span>Customer</span><b>{bill.customer?.name ?? bill.customerName ?? "Walk-in"}</b></div><div><span>GSTIN</span><b>{bill.customer?.gstin ?? "—"}</b></div><div><span>Vehicle / driver</span><b>{bill.vehicleNo ?? "—"} / {bill.driverName ?? "—"}</b></div><div><span>Salesman / nozzle</span><b>{bill.salesman?.name ?? "—"} / {bill.nozzle?.code ?? "—"}</b></div><div><span>Payment</span><b>{bill.settlements.map((entry) => entry.paymentMode.name).join(" + ") || "Credit"}</b></div></section>
      <table><thead><tr><th>#</th><th>Item / HSN</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Discount</th><th className="num">GST</th><th className="num">Amount</th></tr></thead><tbody>{bill.lines.map((line) => <tr key={line.id}><td>{line.lineNo}</td><td>{line.description ?? line.product.name}<small>{line.hsnCode ?? line.product.hsnCode}</small></td><td className="num">{formatNumber(line.quantity)}</td><td className="num">{formatNumber(line.rate)}</td><td className="num">{formatNumber(line.discount)}</td><td className="num">{formatNumber(line.gstAmount)}</td><td className="num">{formatNumber(line.amount)}</td></tr>)}</tbody></table>
      <section className="invoice-bottom"><div><p className="amount-words">{bill.amountInWords}</p>{qrs[billIndex] && <img src={qrs[billIndex]!} alt="Signed e-invoice QR" />} {bill.irn && <small>IRN: {bill.irn}<br />Ack: {bill.acknowledgementNo}</small>}</div><dl><dt>Taxable</dt><dd>{formatINR(bill.taxableValue)}</dd><dt>CGST</dt><dd>{formatINR(bill.cgstAmount)}</dd><dt>SGST</dt><dd>{formatINR(bill.sgstAmount)}</dd><dt>IGST</dt><dd>{formatINR(bill.igstAmount)}</dd><dt>Cess</dt><dd>{formatINR(bill.cessAmount)}</dd><dt>Round-off</dt><dd>{formatINR(bill.roundOff)}</dd><dt className="grand">Grand total</dt><dd className="grand">{formatINR(bill.totalAmount)}</dd></dl></section>
      <footer><p>{bill.outlet.firm?.invoiceTerms}</p><p>{bill.outlet.firm?.declarationText}</p><b>Authorised signatory</b></footer>
    </article>)}
  </div>;
}
