import { businessDateToday } from "@/lib/date";
import { getAgeing } from "@/server/accounts/queries";
import { AgeingScreen } from "@/components/accounts/ledgers";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { asOn?: string } }) {
  const today = businessDateToday().toISOString().slice(0, 10);
  const report = await getAgeing(searchParams.asOn ?? today);
  return <AgeingScreen report={report} today={today} />;
}
