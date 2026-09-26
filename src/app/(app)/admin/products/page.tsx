import { MasterPage } from "@/app/(app)/master-page";
export default function Page() {
  return (
    <MasterPage
      entity="product"
      title="Products"
      description="Fuel, lubricants, additives and merchandise classification."
      columns={[
        "code",
        "name",
        "productType",
        "type",
        "hsnCode",
        "currentPurchaseRate",
        "currentSellingRate",
        "reorderLevel",
      ]}
    />
  );
}
