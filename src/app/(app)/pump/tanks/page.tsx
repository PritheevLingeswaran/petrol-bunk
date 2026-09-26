import { MasterPage } from "@/app/(app)/master-page";
export default function Page() { return <MasterPage entity="tank" title="Tanks" description="Underground tank capacity, product and dead-stock controls." columns={["code", "name", "product", "capacity", "deadStock", "status"]}/>; }
