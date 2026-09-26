import { businessDateToday } from "@/lib/date";
import { getDebtors } from "@/server/accounts/queries";
import { DebtorsScreen } from "@/components/accounts/ledgers";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { asOn?: string } }) {
  const today = businessDateToday().toISOString().slice(0, 10);
  const report = await getDebtors(searchParams.asOn ?? today);
  return <DebtorsScreen report={report} today={today} />;
}
