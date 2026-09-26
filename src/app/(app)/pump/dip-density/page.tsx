import { businessDateToday } from "@/lib/date";
import { getDipDensityView, getPumpOptions } from "@/server/pump/queries";
import { DipDensityScreen } from "@/components/pump/dip-density";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { date?: string } }) {
  const today = businessDateToday().toISOString().slice(0, 10);
  const [view, options] = await Promise.all([getDipDensityView(searchParams.date ?? today), getPumpOptions()]);
  return <DipDensityScreen view={view} options={options} today={today} />;
}
