import { PriceMaster } from "@/components/master/price-master";
import { fieldsFor } from "@/components/master/config";
import { getMasterOptions, listMaster } from "@/server/master/queries";
export default async function Page() {
  const [records, options] = await Promise.all([
    listMaster("price"),
    getMasterOptions(),
  ]);
  return (
    <PriceMaster
      records={records}
      fields={fieldsFor("price", options)}
      productOptions={options.products}
    />
  );
}
