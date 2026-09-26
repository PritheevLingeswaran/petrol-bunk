import { MasterPage } from "@/app/(app)/master-page";
export default function Page() { return <MasterPage entity="shift" title="Shifts" description="Named local-time work periods for pump operations." columns={["sequence", "code", "name", "startTime", "endTime"]}/>; }
