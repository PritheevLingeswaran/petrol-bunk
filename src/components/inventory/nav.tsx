"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [
  ["Stock ledger", "/inventory/stock-ledger"],
  ["Stock status", "/inventory/stock-status"],
  ["Product profit", "/inventory/profit"],
  ["Tank stock", "/inventory/tank-stock"],
  ["Inspections", "/inventory/inspections"],
  ["Lube & merchandise", "/inventory/batches"],
] as const;
export function InventoryNav() {
  const path = usePathname();
  return (
    <nav className="billing-tabs">
      <span className="eyebrow">INVENTORY CONTROL</span>
      {links.map(([label, href]) => (
        <Link className={path === href ? "active" : ""} href={href} key={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
