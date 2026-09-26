import { businessDateToday } from "@/lib/date";
import { db } from "@/server/db";
import { requireSession } from "@/server/guard";
import { dashboardDefaultRange, getDashboard, OWNER_VIEW, type Viewer } from "@/server/dashboard/queries";
import { OwnerDashboard } from "@/components/dashboard/owner-dashboard";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { from?: string; to?: string; denied?: string } }) {
  const fallback = dashboardDefaultRange();
  const range = { from: searchParams.from ?? fallback.from, to: searchParams.to ?? fallback.to };
  const session = await requireSession();

  // A salesman sees litres and his own settlement. The restriction is applied
  // in the query layer, so the outlet's money is never serialised into the
  // page for him — filtering in the component would still ship the figures.
  let viewer: Viewer = OWNER_VIEW;
  if (session.user.role === "SALESMAN") {
    const employee = await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } });
    viewer = { canSeeMoney: false, employeeId: employee?.id ?? null };
  }

  const data = await getDashboard(range, undefined, viewer);
  return (
    <>
      {searchParams.denied ? (
        <div className="alert-bar" role="alert">
          That screen is outside your effective permission or per-user screen restriction.
        </div>
      ) : null}
      <OwnerDashboard data={data} today={businessDateToday().toISOString().slice(0, 10)} canSeeMoney={viewer.canSeeMoney} />
    </>
  );
}
