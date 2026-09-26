import { businessDateToday } from "@/lib/date";
import { defaultRange, getAccountOptions, getLedger } from "@/server/accounts/queries";
import { LedgerScreen } from "@/components/accounts/ledgers";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { accountId?: string; from?: string; to?: string } }) {
  const fallback = defaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const accounts = await getAccountOptions();
  const accountId = searchParams.accountId ?? "";
  const report = accountId ? await getLedger(accountId, range) : null;
  return <LedgerScreen report={report} accounts={accounts} accountId={accountId} range={range} today={businessDateToday().toISOString().slice(0, 10)} />;
}
