import { getLoginLogs } from "@/server/admin/queries";
import { displayIndiaDateTime } from "@/lib/date";

export default async function Page({
  searchParams,
}: {
  searchParams: {
    username?: string;
    success?: string;
    from?: string;
    to?: string;
  };
}) {
  const rows = await getLoginLogs(searchParams);
  return (
    <div className="admin-page">
      <div className="section-head">
        <div>
          <p className="eyebrow">SECURITY EVENT STREAM</p>
          <h1>Login log</h1>
          <p className="page-lede muted">
            Successful and failed attempts, including unknown usernames.
          </p>
        </div>
      </div>
      <form className="panel toolbar no-print">
        <label className="field">
          <span>User</span>
          <input name="username" defaultValue={searchParams.username} />
        </label>
        <label className="field">
          <span>Result</span>
          <select name="success" defaultValue={searchParams.success}>
            <option value="">All</option>
            <option value="true">Success</option>
            <option value="false">Failure</option>
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
      <div className="panel table-wrap report-scroll">
        <table>
          <thead>
            <tr>
              <th>Time (IST)</th>
              <th>User</th>
              <th>Outlet</th>
              <th>Result</th>
              <th>IP</th>
              <th>Device</th>
              <th>User agent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{displayIndiaDateTime(row.attemptedAt)}</td>
                <td>
                  <b>{row.username}</b>
                  {row.failureReason && (
                    <span className="table-sub loss">{row.failureReason}</span>
                  )}
                </td>
                <td>{row.outlet?.name ?? "—"}</td>
                <td>
                  <span className={`badge ${row.success ? "ok" : "alert"}`}>
                    {row.success ? "Success" : "Failure"}
                  </span>
                </td>
                <td>{row.ipAddress ?? "—"}</td>
                <td>{row.device ?? "—"}</td>
                <td className="log-agent">{row.userAgent ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
