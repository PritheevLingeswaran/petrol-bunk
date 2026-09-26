import { BillRegister } from "@/components/billing/bill-register";
import { listBills } from "@/server/billing/queries";
export const dynamic = "force-dynamic";
export default async function Page() { return <BillRegister rows={await listBills()} />; }
