"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["Bills", "/billing/bills"], ["Cash", "/billing/cash"], ["Credit", "/billing/credit"], ["Counter", "/billing/counter"],
  ["Running short", "/billing/running-short"], ["Consolidated", "/billing/consolidated"], ["E-invoice", "/billing/e-invoice"],
  ["Credit note", "/billing/credit-notes"], ["Mobile", "/billing/mobile"],
  ["Settings", "/billing/settings"],
] as const;

export function BillingNav() {
  const pathname = usePathname();
  return <nav className="billing-tabs" aria-label="Billing"><span className="eyebrow">BILLING DESK</span>{links.map(([label, href]) => <Link className={pathname === href ? "active" : ""} href={href} key={href}>{label}</Link>)}</nav>;
}
