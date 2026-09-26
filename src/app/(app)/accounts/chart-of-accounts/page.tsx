import { MasterPage } from "@/app/(app)/master-page";
import { AccountTree } from "@/components/master/account-tree";
import { listMaster } from "@/server/master/queries";
export default async function Page() { const [groups, accounts] = await Promise.all([listMaster("accountGroup"), listMaster("account")]); return <div className="space-y-4"><AccountTree groups={groups} accounts={accounts}/><MasterPage entity="accountGroup" title="Account groups" description="Tally-style group structure." columns={["code", "name", "nature", "sortOrder"]}/><MasterPage entity="account" title="Ledgers" description="Posting ledgers; balances are always derived from vouchers." columns={["code", "name", "group", "nature", "openingBalance", "normalBalance"]}/></div>; }
