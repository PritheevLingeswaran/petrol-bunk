import { MasterPage } from "@/app/(app)/master-page";
export default function Page() {
  return (
    <MasterPage
      entity="employee"
      title="Employees"
      description="Employee identity, joining and protected payroll bank details."
      columns={["code", "name", "phone", "designation", "joinedOn", "status"]}
    />
  );
}
