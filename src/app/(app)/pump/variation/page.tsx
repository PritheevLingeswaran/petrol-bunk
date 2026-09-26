import { businessDateToday } from "@/lib/date";
import { defaultRange, getPumpOptions, getVariationRegister } from "@/server/pump/queries";
import { VariationRegister } from "@/components/pump/reports";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const fallback = defaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const [report, options] = await Promise.all([getVariationRegister(range), getPumpOptions()]);
  return <VariationRegister {...report} range={range} today={businessDateToday().toISOString().slice(0, 10)} options={options} />;
}
