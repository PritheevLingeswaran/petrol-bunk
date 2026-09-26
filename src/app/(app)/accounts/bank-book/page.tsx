import { businessDateToday } from "@/lib/date";
import { defaultRange, getBook, getCashAndBankAccounts } from "@/server/accounts/queries";
import { BookScreen } from "@/components/accounts/ledgers";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { accountId?: string; from?: string; to?: string } }) {
  const fallback = defaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const accounts = await getCashAndBankAccounts();
  const accountId = searchParams.accountId ?? accounts.find((account) => account.isBank)?.value ?? "";
  const report = accountId ? await getBook(accountId, range) : null;
  return <BookScreen report={report} accounts={accounts} accountId={accountId} range={range} today={businessDateToday().toISOString().slice(0, 10)} />;
}
