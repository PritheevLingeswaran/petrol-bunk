import { MasterPage } from "@/app/(app)/master-page";
export default function Page() { return <MasterPage entity="paymentMode" title="Payment modes" description="Cash, cards, UPI, wallets, fleet cards, own use and coupon settlement." columns={["code", "name", "type", "settlementDays", "mdrPct", "requiresReference"]}/>; }
