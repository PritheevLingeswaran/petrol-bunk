import { businessDateToday } from "@/lib/date";
import { getBalanceSheet } from "@/server/accounts/queries";
import { BalanceSheetScreen } from "@/components/accounts/statements";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { asOn?: string } }) {
  const today = businessDateToday().toISOString().slice(0, 10);
  const report = await getBalanceSheet(searchParams.asOn ?? today);
  return <BalanceSheetScreen report={report} today={today} />;
}
