import { BillingForm } from "@/components/billing/billing-form";
import { businessDateToday } from "@/lib/date";
import { getBillingOptions } from "@/server/billing/queries";
export const dynamic = "force-dynamic";
export default async function Page() { const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); return <BillingForm billType="CREDIT" description="Registered-party invoice with credit-limit and overdue controls." options={await getBillingOptions()} time={now} title="Credit billing" today={businessDateToday().toISOString().slice(0, 10)} />; }
