import { RunningShortScreen } from "@/components/billing/running-short";
import { businessDateToday } from "@/lib/date";
import { getBillingOptions, listShortCredits } from "@/server/billing/queries";
export const dynamic = "force-dynamic";
export default async function Page() { const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); const [options, rows] = await Promise.all([getBillingOptions(), listShortCredits()]); return <RunningShortScreen options={options} rows={rows} time={now} today={businessDateToday().toISOString().slice(0, 10)} />; }
