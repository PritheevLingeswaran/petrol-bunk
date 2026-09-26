import { businessDateToday } from "@/lib/date";
import { defaultRange, getProfitAndLoss } from "@/server/accounts/queries";
import { ProfitAndLossScreen } from "@/components/accounts/statements";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const fallback = defaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const report = await getProfitAndLoss(range);
  return <ProfitAndLossScreen report={report} today={businessDateToday().toISOString().slice(0, 10)} />;
}
