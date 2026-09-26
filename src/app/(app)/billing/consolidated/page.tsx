import { ConsolidatedScreen } from "@/components/billing/consolidated";
import { businessDateToday } from "@/lib/date";
import { getBillingOptions, listConsolidationCandidates } from "@/server/billing/queries";
export const dynamic = "force-dynamic";
export default async function Page() { const [options, candidates] = await Promise.all([getBillingOptions(), listConsolidationCandidates()]); return <ConsolidatedScreen candidates={candidates} options={options} today={businessDateToday().toISOString().slice(0, 10)} />; }
