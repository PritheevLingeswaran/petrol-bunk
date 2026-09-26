import { MasterPage } from "@/app/(app)/master-page";
export default function Page() {
  return (
    <MasterPage
      entity="firm"
      title="Firm & GST settings"
      description="Legal identity, invoice footer banking, declaration and signature."
      columns={["name", "legalName", "gstin", "state", "bankName"]}
    />
  );
}
