import { businessDateToday } from "@/lib/date";
import { getOutletScope } from "@/server/guard";
import { loadSettings } from "@/server/settings";
import { getPumpOptions } from "@/server/pump/queries";
import { DecantationScreen } from "@/components/pump/decantation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [options, scope] = await Promise.all([getPumpOptions(), getOutletScope()]);
  const settings = scope.outletIds[0] ? await loadSettings(scope.outletIds[0]) : null;
  return (
    <DecantationScreen
      options={options}
      today={businessDateToday().toISOString().slice(0, 10)}
      transitLossPct={(settings?.decimal("stock.transitLossPct") ?? "0.20").toString()}
    />
  );
}
