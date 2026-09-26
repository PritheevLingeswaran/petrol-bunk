import { getPeriodicals } from "@/server/accounts/queries";
import { PeriodicalsScreen } from "@/components/accounts/statements";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { months?: string } }) {
  const report = await getPeriodicals(Number(searchParams.months ?? 12));
  return <PeriodicalsScreen report={report} />;
}
