import { MasterPage } from "@/app/(app)/master-page";
export default function Page() { return <MasterPage entity="nozzle" title="Nozzles" description="Nozzle-to-DU, tank and product mapping with totaliser settings." columns={["code", "name", "dispensingUnit", "tank", "product", "currentReading", "meterDigits", "status"]}/>; }
