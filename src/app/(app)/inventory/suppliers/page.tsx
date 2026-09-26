import { MasterPage } from "@/app/(app)/master-page";
export default function Page() {
  return (
    <MasterPage
      entity="supplier"
      title="Suppliers"
      description="OMC, lube and other purchase suppliers."
      columns={["code", "name", "type", "phone", "gstin", "creditDays"]}
    />
  );
}
