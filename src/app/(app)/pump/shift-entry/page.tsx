import { businessDateToday } from "@/lib/date";
import { getPumpOptions } from "@/server/pump/queries";
import { ShiftEntryScreen } from "@/components/pump/shift-entry";

export const dynamic = "force-dynamic";

export default async function Page() {
  const options = await getPumpOptions();
  return <ShiftEntryScreen today={businessDateToday().toISOString().slice(0, 10)} shifts={options.shifts} employees={options.employees} />;
}
