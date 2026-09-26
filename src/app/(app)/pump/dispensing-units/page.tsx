import { MasterPage } from "@/app/(app)/master-page";
export default function Page() { return <MasterPage entity="dispensingUnit" title="Dispensing units" description="Pump machines and their active service state." columns={["code", "name", "make", "model", "serialNo", "status"]}/>; }
