import { businessDateToday } from "@/lib/date";
import { defaultRange, getCustomerOptions, getCustomerStatement } from "@/server/accounts/queries";
import { StatementScreen } from "@/components/accounts/ledgers";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { customerId?: string; from?: string; to?: string } }) {
  const fallback = defaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const customers = await getCustomerOptions();
  const customerId = searchParams.customerId ?? "";
  const report = customerId ? await getCustomerStatement(customerId, range) : null;
  return <StatementScreen report={report} customers={customers} customerId={customerId} range={range} today={businessDateToday().toISOString().slice(0, 10)} />;
}
