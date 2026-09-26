import { InventoryNav } from "@/components/inventory/nav";
import { BatchManager } from "@/components/inventory/batch-manager";
import {
  getBatchInventory,
  getInventoryOptions,
} from "@/server/inventory/queries";
import { businessDateToday } from "@/lib/date";
export default async function Page() {
  const [rows, options] = await Promise.all([
    getBatchInventory(),
    getInventoryOptions(),
  ]);
  return (
    <div className="inventory-page">
      <InventoryNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">BATCH · MRP · EXPIRY</p>
          <h1>Lube & merchandise inventory</h1>
        </div>
      </div>
      <BatchManager
        rows={rows}
        products={options.products}
        editable={options.editable}
        today={businessDateToday().toISOString().slice(0, 10)}
      />
    </div>
  );
}
