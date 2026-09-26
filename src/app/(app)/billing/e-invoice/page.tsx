import { EInvoiceScreen } from "@/components/billing/e-invoice";
import { listEInvoiceBills } from "@/server/billing/queries";
export const dynamic = "force-dynamic";
export default async function Page() { return <EInvoiceScreen rows={await listEInvoiceBills()} />; }
