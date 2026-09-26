import { businessDateToday } from "@/lib/date";
import { getPumpOptions, getReminders } from "@/server/pump/queries";
import { RemindersScreen } from "@/components/pump/reminders";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [reminders, options] = await Promise.all([getReminders(), getPumpOptions()]);
  return <RemindersScreen {...reminders} options={options} today={businessDateToday().toISOString().slice(0, 10)} />;
}
