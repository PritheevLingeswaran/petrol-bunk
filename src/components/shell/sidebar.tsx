"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDollarSign, Droplets } from "lucide-react";
import { navigationSections } from "@/lib/navigation";
import { useT } from "@/i18n/provider";

export function Sidebar({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname();
  const t = useT();
  const allowed = new Set(allowedHrefs);
  return (
    <aside className="sidebar">
      <div className="brand">
        <Droplets size={22} />
        <span>{t("app.name")}</span>
      </div>
      <nav>
        {navigationSections.map((section) => {
          const items = section.items.filter((item) => allowed.has(item.href));
          if (!items.length) return null;
          return (
            <div className="nav-section" key={section.label}>
              {/* Section headings translate; screen names keep the label the
                  navigation registry defines, falling back to English. */}
              <p>{t(`nav.${section.label}`, section.label)}</p>
              {items.map((item) => (
                <Link key={item.href} className={pathname === item.href ? "active" : ""} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <CircleDollarSign size={15} />
        <span>{t("app.region")}</span>
      </div>
    </aside>
  );
}
