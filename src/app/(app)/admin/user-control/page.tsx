import { UserControl } from "@/components/admin/user-control";
import { getUserControlData } from "@/server/admin/queries";

export default async function Page() {
  const data = await getUserControlData();
  return (
    <div className="admin-page">
      <div className="section-head">
        <div>
          <p className="eyebrow">DATE · MODULE · SCREEN</p>
          <h1>Per-user restrictions</h1>
          <p className="page-lede muted">
            Explicit user grants/revokes override the role. Screen restrictions
            apply at the server route boundary.
          </p>
        </div>
      </div>
      <UserControl
        initialUsers={data.users}
        screens={data.screenDefinitions}
        editable={data.editable}
      />
    </div>
  );
}
