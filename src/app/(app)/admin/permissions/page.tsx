import { ModuleName } from "@prisma/client";
import { PermissionMatrix } from "@/components/admin/permission-matrix";
import { getPermissionMatrix } from "@/server/admin/queries";

export default async function Page() {
  const data = await getPermissionMatrix();
  const rows = data.roles.flatMap((role) =>
    Object.values(ModuleName).map((module) => {
      const permission = role.permissions.find((row) => row.module === module);
      return {
        roleId: role.id,
        role: role.code,
        module,
        canView: permission?.canView ?? false,
        canAdd: permission?.canAdd ?? false,
        canModify: permission?.canModify ?? false,
        canDelete: permission?.canDelete ?? false,
        canApprove: permission?.canApprove ?? false,
      };
    }),
  );
  return (
    <div className="admin-page">
      <div className="section-head">
        <div>
          <p className="eyebrow">OWNER CONTROL</p>
          <h1>Permission matrix</h1>
          <p className="page-lede muted">
            Role grants for view, add, modify, delete and approve.
          </p>
        </div>
      </div>
      <PermissionMatrix initialRows={rows} editable={data.editable} />
    </div>
  );
}
