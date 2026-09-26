import { businessDateToday } from "@/lib/date";
import { defaultRange, getAccountOptions, getVouchers } from "@/server/accounts/queries";
import { VoucherScreen } from "@/components/accounts/voucher-entry";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { from?: string; to?: string; type?: string } }) {
  const fallback = defaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const type = searchParams.type ?? "ALL";
  const [register, accounts] = await Promise.all([getVouchers(range, type), getAccountOptions()]);
  return <VoucherScreen {...register} accounts={accounts} range={range} today={businessDateToday().toISOString().slice(0, 10)} activeType={type} />;
}
