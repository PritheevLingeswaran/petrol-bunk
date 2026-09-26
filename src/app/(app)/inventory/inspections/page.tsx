import { InventoryNav } from "@/components/inventory/nav";
import { InspectionScreen } from "@/components/inventory/inspection-screen";
import { INSPECTION_CHECKLIST } from "@/lib/inspection";
import { businessDateToday } from "@/lib/date";
import {
  getInspections,
  getInventoryOptions,
} from "@/server/inventory/queries";
export default async function Page() {
  const [rows, options] = await Promise.all([
    getInspections(),
    getInventoryOptions(),
  ]);
  return (
    <div className="inventory-page">
      <InventoryNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">OMC · LEGAL METROLOGY · INTERNAL</p>
          <h1>Inspection reports</h1>
        </div>
      </div>
      <InspectionScreen
        rows={rows}
        checklist={INSPECTION_CHECKLIST}
        today={businessDateToday().toISOString().slice(0, 10)}
        editable={options.editable}
      />
    </div>
  );
}
