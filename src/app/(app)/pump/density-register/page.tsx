import { businessDateToday } from "@/lib/date";
import { defaultRange, getDensityRegister } from "@/server/pump/queries";
import { DensityRegister } from "@/components/pump/reports";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const fallback = defaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const report = await getDensityRegister(range);
  return <DensityRegister {...report} range={range} today={businessDateToday().toISOString().slice(0, 10)} />;
}
