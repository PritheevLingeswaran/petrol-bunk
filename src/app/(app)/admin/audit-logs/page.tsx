import { getAuditLogs } from "@/server/admin/queries";
import { displayIndiaDateTime } from "@/lib/date";

const json = (value: unknown) =>
  value == null ? "—" : JSON.stringify(value, null, 2);
export default async function Page({
  searchParams,
}: {
  searchParams: { table?: string; userId?: string; from?: string; to?: string };
}) {
  const data = await getAuditLogs(searchParams);
  return (
    <div className="admin-page">
      <div className="section-head">
        <div>
          <p className="eyebrow">APPEND-ONLY CHANGE HISTORY</p>
          <h1>Audit log</h1>
          <p className="page-lede muted">
            Old and new values with actor, timestamp and IP. Audit records
            cannot be deleted.
          </p>
        </div>
      </div>
      <form className="panel toolbar no-print">
        <label className="field">
          <span>Table</span>
          <select name="table" defaultValue={searchParams.table}>
            <option value="">All tables</option>
            {data.tables.map((table) => (
              <option key={table}>{table}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>User</span>
          <select name="userId" defaultValue={searchParams.userId}>
            <option value="">All users</option>
            {data.users.map((user) => (
              <option value={user.id} key={user.id}>
                {user.username} · {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input name="from" type="date" defaultValue={searchParams.from} />
        </label>
        <label className="field">
          <span>To</span>
          <input name="to" type="date" defaultValue={searchParams.to} />
        </label>
        <button className="button button-secondary">Filter</button>
      </form>
      <div className="audit-stream">
        {data.rows.map((row) => (
          <article className="panel audit-card" key={row.id}>
            <header>
              <div>
                <span className="badge">{row.action}</span>
                <b>{row.tableName}</b>
                <code>{row.recordId}</code>
              </div>
              <div className="muted">
                {row.user?.username ?? "system"} ·{" "}
                {displayIndiaDateTime(row.createdAt)} ·{" "}
                {row.ipAddress ?? "IP unavailable"}
              </div>
            </header>
            <div className="audit-diff">
              <div>
                <p className="eyebrow">OLD VALUE</p>
                <pre>{json(row.oldValue)}</pre>
              </div>
              <div>
                <p className="eyebrow">NEW VALUE</p>
                <pre>{json(row.newValue)}</pre>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
