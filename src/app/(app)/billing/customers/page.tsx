import { MasterPage } from "@/app/(app)/master-page";
export default function Page() { return <MasterPage entity="customer" title="Credit customers" description="Credit parties, limits, statements and nested vehicle controls." columns={["code", "name", "phone", "creditLimit", "creditDays", "openingBalance", "discountPerLitre"]}/>; }
