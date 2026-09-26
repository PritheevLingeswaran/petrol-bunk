import { businessDateToday } from "@/lib/date";
import { defaultRange, getCashFlow } from "@/server/accounts/queries";
import { CashFlowScreen } from "@/components/accounts/statements";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const fallback = defaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const report = await getCashFlow(range);
  return <CashFlowScreen report={report} today={businessDateToday().toISOString().slice(0, 10)} />;
}
