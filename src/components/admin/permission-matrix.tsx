"use client";
import { useState, useTransition } from "react";
import { saveRolePermission } from "@/server/admin/actions";

type Row = {
  roleId: string;
  role: string;
  module: string;
  canView: boolean;
  canAdd: boolean;
  canModify: boolean;
  canDelete: boolean;
  canApprove: boolean;
};
type Flag = "canView" | "canAdd" | "canModify" | "canDelete" | "canApprove";
const flags: Array<[Flag, string]> = [
  ["canView", "View"],
  ["canAdd", "Add"],
  ["canModify", "Modify"],
  ["canDelete", "Delete"],
  ["canApprove", "Approve"],
];
export function PermissionMatrix({
  initialRows,
  editable,
}: {
  initialRows: Row[];
  editable: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [role, setRole] = useState(initialRows[0]?.role ?? "");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const roles = [...new Set(rows.map((row) => row.role))];
  const shown = rows.filter((row) => row.role === role);
  const toggle = (module: string, flag: Flag) =>
    setRows((current) =>
      current.map((row) =>
        row.role === role && row.module === module
          ? { ...row, [flag]: !row[flag] }
          : row,
      ),
    );
  const save = (row: Row) =>
    start(async () => {
      const result = await saveRolePermission(row);
      setMessage(
        result.ok ? `${row.role} · ${row.module} saved` : result.error,
      );
    });
  return (
    <div className="panel matrix">
      <div className="tab-row">
        {roles.map((item) => (
          <button
            className={item === role ? "active" : ""}
            onClick={() => setRole(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="info-bar">
        Role grants are enforced on the server. User-level grants/revokes are
        applied after this matrix. AUDITOR write grants are rejected
        server-side.
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Module</th>
              {flags.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.module}>
                <td>
                  <b>{row.module.replaceAll("_", " ")}</b>
                </td>
                {flags.map(([flag]) => (
                  <td key={flag}>
                    <input
                      type="checkbox"
                      checked={row[flag]}
                      disabled={
                        !editable || (role === "AUDITOR" && flag !== "canView")
                      }
                      onChange={() => toggle(row.module, flag)}
                    />
                  </td>
                ))}
                <td>
                  <button
                    className="button button-secondary"
                    disabled={!editable || pending}
                    onClick={() => save(row)}
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message && <p className="info-bar">{message}</p>}
    </div>
  );
}
