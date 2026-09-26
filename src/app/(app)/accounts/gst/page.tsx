import { businessDateToday } from "@/lib/date";
import { defaultRange, getGstr1, getGstr3b } from "@/server/accounts/queries";
import { GstScreen } from "@/components/accounts/gst";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const fallback = defaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const [gstr1, gstr3b] = await Promise.all([getGstr1(range), getGstr3b(range)]);
  return <GstScreen gstr1={gstr1} gstr3b={gstr3b} range={range} today={businessDateToday().toISOString().slice(0, 10)} />;
}
