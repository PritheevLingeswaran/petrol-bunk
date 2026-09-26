import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import { I18nProvider } from "@/i18n/provider";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getAllowedScreenPaths, getOutletScope, requireScreenAccess } from "@/server/guard";
import { getPreferences } from "@/server/preferences/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const pathname = headers().get("x-pb-pathname") ?? "/";
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
        <Sidebar allowedHrefs={allowedHrefs} />
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
