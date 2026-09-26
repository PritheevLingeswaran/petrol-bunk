import { businessDateToday } from "@/lib/date";
import { getOutletScope } from "@/server/guard";
import { loadSettings } from "@/server/settings";
import { getPumpOptions, getSettlementView } from "@/server/pump/queries";
import { SettlementScreen } from "@/components/pump/settlement";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { date?: string; shift?: string } }) {
  const today = businessDateToday().toISOString().slice(0, 10);
  const options = await getPumpOptions();
  const date = searchParams.date ?? today;
  const shiftId = searchParams.shift ?? options.shifts[0]?.value ?? "";
  const [view, scope] = await Promise.all([shiftId ? getSettlementView(date, shiftId) : null, getOutletScope()]);
  const settings = scope.outletIds[0] ? await loadSettings(scope.outletIds[0]) : null;
  const tolerance = (settings?.decimal("cash.shortExcessToleranceAmount") ?? "20").toString();
  return <SettlementScreen view={view} options={options} today={date} shiftId={shiftId} tolerance={tolerance} />;
}
