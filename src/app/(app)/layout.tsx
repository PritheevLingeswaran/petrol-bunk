import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import { I18nProvider } from "@/i18n/provider";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getAccountState, getAllowedScreenPaths, getOutletScope, requireScreenAccess } from "@/server/guard";
import { getPreferences } from "@/server/preferences/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const pathname = headers().get("x-pb-pathname") ?? "/";
  // Before the screen check: requireSession() throws for a suspended user, which would loop on /?denied=1.
  const account = await getAccountState(session.user.id);
  if (account?.status !== "ACTIVE") redirect("/login?error=suspended");
  if (account.mustChangePassword) {
    if (pathname !== "/account/password") redirect("/account/password");
    // No sidebar: layouts don't re-run on client navigation, so a nav link would skip this check.
    return <div className="page">{children}</div>;
  }
  try {
    await requireScreenAccess(pathname);
  } catch {
    redirect("/?denied=1");
  }
  const [scope, outlets, allowedHrefs, preferences] = await Promise.all([
    getOutletScope(),
    db.outlet.findMany({ where: { id: { in: session.user.outletIds }, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    getAllowedScreenPaths(),
    getPreferences(),
  ]);
  return (
    <I18nProvider locale={preferences.locale}>
      <div className="app-shell">
        {/* CSS-only phone menu: the header's label checks it, which slides the sidebar in. */}
        <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-hidden />
        <Sidebar allowedHrefs={allowedHrefs} />
        <label htmlFor="nav-toggle" className="nav-backdrop" aria-hidden />
        <main>
          <Header
            outlets={outlets}
            role={session.user.role}
            active={scope.allOutlets ? "all" : scope.outletIds[0]}
            userName={session.user.name}
            theme={preferences.theme}
            locale={preferences.locale}
          />
          <div className="page">{children}</div>
        </main>
      </div>
    </I18nProvider>
  );
}
