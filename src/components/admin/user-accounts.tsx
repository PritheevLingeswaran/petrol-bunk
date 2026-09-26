"use client";
import { useState, useTransition } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { createUser, resetUserPassword, setUserStatus } from "@/server/account/actions";
import { CREATABLE_ROLES } from "@/server/account/schemas";

type User = { id: string; username: string; name: string; role: string; status: string; locked: boolean; mustChangePassword: boolean; outlets: string };
type Outlet = { id: string; code: string; name: string };
type Errors = Record<string, string[] | undefined>;

const ROLE_HINT: Record<(typeof CREATABLE_ROLES)[number], string> = {
  MANAGER: "Runs the bunk day to day",
  ACCOUNTANT: "Books, GST and reports",
  CASHIER: "Billing and cash closing",
  SALESMAN: "Shift entry; never sees money totals",
  AUDITOR: "View only — can never change anything",
};

/** Owner-only: create logins, reset passwords, suspend. Nothing here deletes a user. */
export function UserAccounts({ users, outlets, selfId }: { users: User[]; outlets: Outlet[]; selfId: string }) {
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ text: string; bad?: boolean }>();
  const [working, start] = useTransition();

  function add(form: FormData) {
    start(async () => {
      const result = await createUser({ username: form.get("username"), name: form.get("name"), role: form.get("role"), outletIds: form.getAll("outletIds"), password: form.get("password") });
      if (!result.ok) { setErrors(result.fieldErrors ?? {}); setMessage({ text: result.error, bad: true }); return; }
      setErrors({}); setAdding(false);
      setMessage({ text: `Login ${String(form.get("username")).trim().toLowerCase()} created. Give them the temporary password; they must change it at first sign-in.` });
    });
  }
  function reset(user: User) {
    const password = prompt(`New temporary password for ${user.username} (at least 8 characters). They will have to change it at next sign-in.`);
    if (!password) return;
    start(async () => {
      const result = await resetUserPassword({ userId: user.id, password });
      setMessage(result.ok ? { text: `Password for ${user.username} reset.` } : { text: result.fieldErrors?.password?.[0] ?? result.error, bad: true });
    });
  }
  function toggle(user: User) {
    const status = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (status === "SUSPENDED" && !confirm(`Suspend ${user.username}? They will be signed out and cannot sign in until you activate them again.`)) return;
    start(async () => {
      const result = await setUserStatus({ userId: user.id, status });
      setMessage(result.ok ? { text: `${user.username} is now ${status.toLowerCase()}.` } : { text: result.error, bad: true });
    });
  }
  const error = (name: string) => errors[name]?.map((text) => <small key={text} className="field-error">{text}</small>);

  return (
    <section className="panel user-accounts">
      <div className="line-toolbar">
        <div><p className="eyebrow">LOGINS</p><h2>Users</h2></div>
        <button className="button" onClick={() => { setAdding(!adding); setErrors({}); }}><UserPlus size={15} /> {adding ? "Close" : "Add user"}</button>
      </div>
      {message && <div className={message.bad ? "alert-bar" : "info-bar"} role="status">{message.text}</div>}
      {adding && (
        <form action={add} className="user-form">
          <label className="field"><span>Username</span><input name="username" required autoComplete="off" placeholder="e.g. ravi" />{error("username")}</label>
          <label className="field"><span>Full name</span><input name="name" required />{error("name")}</label>
          <label className="field"><span>Role</span>
            <select name="role" defaultValue="CASHIER">{CREATABLE_ROLES.map((role) => <option key={role} value={role}>{role} — {ROLE_HINT[role]}</option>)}</select>{error("role")}
          </label>
          <label className="field"><span>Temporary password</span><input name="password" type="text" required minLength={8} autoComplete="off" />{error("password")}</label>
          <fieldset className="field user-outlets"><span>Outlets</span>
            {outlets.map((outlet, index) => <label key={outlet.id} className="check-row"><input type="checkbox" name="outletIds" value={outlet.id} defaultChecked={index === 0} /> {outlet.code} · {outlet.name}</label>)}
            {error("outletIds")}
          </fieldset>
          <div className="user-form-actions"><button className="button" disabled={working}>{working ? "Creating…" : "Create login"}</button></div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Outlets</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.username}</strong></td>
                <td>{user.name}</td>
                <td><span className="badge">{user.role}</span></td>
                <td>{user.outlets || "—"}</td>
                <td>
                  <span className={`badge ${user.status === "ACTIVE" && !user.locked ? "ok" : "alert"}`}>{user.status === "ACTIVE" ? (user.locked ? "Locked" : "Active") : "Suspended"}</span>
                  {user.mustChangePassword && <small className="table-sub">Temporary password</small>}
                </td>
                <td>
                  <div className="row-actions">
                    <button disabled={working} onClick={() => reset(user)} title="Reset password"><KeyRound size={14} /></button>
                    {user.id !== selfId && <button disabled={working} onClick={() => toggle(user)}>{user.status === "ACTIVE" ? "Suspend" : "Activate"}</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
