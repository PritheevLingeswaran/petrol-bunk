import { BillingForm } from "@/components/billing/billing-form";
import { businessDateToday } from "@/lib/date";
import { getBillingOptions } from "@/server/billing/queries";
export const dynamic = "force-dynamic";
export default async function Page() { const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); return <BillingForm billType="COUNTER" description="Lubes, additives, spares and merchandise with inventory movement." options={await getBillingOptions()} time={now} title="Counter billing" today={businessDateToday().toISOString().slice(0, 10)} />; }
