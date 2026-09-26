import { businessDateToday } from "@/lib/date";
import { getTrialBalance } from "@/server/accounts/queries";
import { TrialBalanceScreen } from "@/components/accounts/statements";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { asOn?: string } }) {
  const today = businessDateToday().toISOString().slice(0, 10);
  const report = await getTrialBalance(searchParams.asOn ?? today);
  return <TrialBalanceScreen report={report} today={today} />;
}
