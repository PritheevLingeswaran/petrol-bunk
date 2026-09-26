"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { KeyRound, LogOut, Menu } from "lucide-react";
import type { RoleCode } from "@prisma/client";
import { Preferences } from "@/components/shell/preferences";
import { useT } from "@/i18n/provider";
import { signOutAction } from "@/server/account/actions";
import type { LocaleChoice, ThemeChoice } from "@/server/preferences/actions";

type Props = {
  outlets: { id: string; code: string; name: string }[];
  role: RoleCode;
  active: string;
  userName: string;
  theme: ThemeChoice;
  locale: LocaleChoice;
};

export function Header({ outlets, role, active, userName, theme, locale }: Props) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();

  const change = (outletId: string) => {
    startTransition(async () => {
      await fetch("/api/outlet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId }) });
      router.refresh();
    });
  };

  return (
    <header className="header">
      {/* Toggles the #nav-toggle checkbox in the app layout; only shown on narrow screens. */}
      <label htmlFor="nav-toggle" className="icon-button nav-open" title={t("shell.menu")} aria-label={t("shell.menu")}>
        <Menu size={20} />
      </label>
      <div className="header-identity">
        <p className="eyebrow">{t("app.name")}</p>
        <p className="muted text-xs">{userName}</p>
      </div>
      <div className="header-controls">
        <label className="outlet-select">
          <span>{t("shell.outlet")}</span>
          <select value={active} disabled={pending} onChange={(event) => change(event.target.value)}>
            {role === "OWNER" && <option value="all">{t("shell.allOutlets")}</option>}
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.code} · {outlet.name}
              </option>
            ))}
          </select>
        </label>
        <Preferences theme={theme} locale={locale} />
        <div className="account-controls">
          <Link className="icon-button" href="/account/password" title={t("shell.changePassword")} aria-label={t("shell.changePassword")}>
            <KeyRound size={16} />
          </Link>
          <form action={signOutAction}>
            <button className="icon-button" title={t("shell.signOut")} aria-label={t("shell.signOut")}>
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
