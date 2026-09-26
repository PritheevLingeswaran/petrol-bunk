import { MasterPage } from "@/app/(app)/master-page";
export default function Page() {
  return (
    <MasterPage
      entity="outlet"
      title="Outlets & stock points"
      description="Physical sites available under this login."
      columns={["code", "name", "omc", "city", "state", "phone"]}
    />
  );
}
