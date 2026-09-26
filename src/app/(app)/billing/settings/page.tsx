import { BillingSettings } from "@/components/billing/billing-settings";
import { getBillingSettings } from "@/server/billing/queries";
export const dynamic = "force-dynamic";
export default async function Page() { return <BillingSettings values={await getBillingSettings()} />; }
