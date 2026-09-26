"use client";
import { useMemo, useState, useTransition } from "react";
import { saveUserControl } from "@/server/admin/actions";

const modules = [
  "DASHBOARD",
  "PUMP_OPERATIONS",
  "BILLING",
  "CUSTOMERS",
  "ACCOUNTS",
  "INVENTORY",
  "PURCHASES",
  "PAYROLL",
  "REPORTS",
  "USER_CONTROL",
  "SETTINGS",
  "AUDIT",
] as const;
type Effect = "INHERIT" | "GRANT" | "REVOKE";
type User = {
  id: string;
  username: string;
  name: string;
  role: string;
  status: string;
  outlets: string;
  lockFromDate: string;
  lockToDate: string;
  permissions: Array<{
    module: string;
    view: Effect;
    add: Effect;
    modify: Effect;
    delete: Effect;
    approve: Effect;
  }>;
  screens: Array<{ screenKey: string; effect: Effect }>;
};
type Screen = { label: string; href: string; module: string };
const effects: Effect[] = ["INHERIT", "GRANT", "REVOKE"];
const actions = ["view", "add", "modify", "delete", "approve"] as const;
export function UserControl({
  initialUsers,
  screens,
  editable,
}: {
  initialUsers: User[];
  screens: Screen[];
  editable: boolean;
}) {
  const [userId, setUserId] = useState(initialUsers[0]?.id ?? "");
  const original = initialUsers.find((user) => user.id === userId);
  const [from, setFrom] = useState(original?.lockFromDate ?? "");
  const [to, setTo] = useState(original?.lockToDate ?? "");
  const [permissions, setPermissions] = useState<
    Record<string, Record<string, Effect>>
  >({});
  const [screenEffects, setScreens] = useState<Record<string, Effect>>({});
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const merged = useMemo(
    () =>
      Object.fromEntries(
        modules.map((module) => {
          const row = original?.permissions.find(
            (permission) => permission.module === module,
          );
          return [
            module,
            {
              view: row?.view ?? "INHERIT",
              add: row?.add ?? "INHERIT",
              modify: row?.modify ?? "INHERIT",
              delete: row?.delete ?? "INHERIT",
              approve: row?.approve ?? "INHERIT",
              ...permissions[module],
            },
          ];
        }),
      ),
    [original, permissions],
  ) as Record<
    (typeof modules)[number],
    Record<(typeof actions)[number], Effect>
  >;
  const switchUser = (id: string) => {
    const next = initialUsers.find((user) => user.id === id);
    setUserId(id);
    setFrom(next?.lockFromDate ?? "");
    setTo(next?.lockToDate ?? "");
    setPermissions({});
    setScreens({});
  };
  const save = () =>
    start(async () => {
      const result = await saveUserControl({
        userId,
        lockFromDate: from || null,
        lockToDate: to || null,
        permissions: modules.map((module) => ({ module, ...merged[module] })),
        screens: screens.map((screen) => ({
          screenKey: screen.href,
          effect:
            screenEffects[screen.href] ??
            original?.screens.find((row) => row.screenKey === screen.href)
              ?.effect ??
            "INHERIT",
        })),
      });
      setMessage(result.ok ? "User restrictions saved" : result.error);
    });
  if (!original) return <div className="info-bar">No users found.</div>;
  return (
    <div className="user-control-grid">
      <aside className="panel user-list">
        <label className="field">
          <span>User</span>
          <select
            value={userId}
            onChange={(event) => switchUser(event.target.value)}
          >
            {initialUsers.map((user) => (
              <option value={user.id} key={user.id}>
                {user.username} · {user.name}
              </option>
            ))}
          </select>
        </label>
        <dl>
          <dt>Role</dt>
          <dd>{original.role}</dd>
          <dt>Outlets</dt>
          <dd>{original.outlets}</dd>
          <dt>Status</dt>
          <dd>{original.status}</dd>
        </dl>
        <label className="field">
          <span>Entry allowed from</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Entry allowed through</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={!editable || pending}
          onClick={save}
        >
          Save all restrictions
        </button>
        {message && <p className="info-bar">{message}</p>}
      </aside>
      <div className="panel table-wrap">
        <h2 className="matrix-title">Per-user module overrides</h2>
        <table>
          <thead>
            <tr>
              <th>Module</th>
              {actions.map((action) => (
                <th key={action}>{action}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((module) => (
              <tr key={module}>
                <td>{module.replaceAll("_", " ")}</td>
                {actions.map((action) => (
                  <td key={action}>
                    <select
                      className="effect-select"
                      value={merged[module][action]}
                      onChange={(event) =>
                        setPermissions((current) => ({
                          ...current,
                          [module]: {
                            ...merged[module],
                            [action]: event.target.value as Effect,
                          },
                        }))
                      }
                    >
                      {effects.map((effect) => (
                        <option key={effect}>{effect}</option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="matrix-title">Per-screen restrictions</h2>
        <table>
          <thead>
            <tr>
              <th>Screen</th>
              <th>Module</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            {screens.map((screen) => {
              const value =
                screenEffects[screen.href] ??
                original.screens.find((row) => row.screenKey === screen.href)
                  ?.effect ??
                "INHERIT";
              return (
                <tr key={screen.href}>
                  <td>
                    <b>{screen.label}</b>
                    <span className="table-sub">{screen.href}</span>
                  </td>
                  <td>{screen.module}</td>
                  <td>
                    <select
                      className="effect-select"
                      value={value}
                      onChange={(event) =>
                        setScreens((current) => ({
                          ...current,
                          [screen.href]: event.target.value as Effect,
                        }))
                      }
                    >
                      {effects.map((effect) => (
                        <option key={effect}>{effect}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
