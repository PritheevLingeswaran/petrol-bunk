import { MasterPage } from "@/app/(app)/master-page";
export default function Page() { return <MasterPage entity="expenseHead" title="Expense heads" description="Configured categories, each mapped to a posting ledger." columns={["code", "name", "account", "description"]}/>; }
