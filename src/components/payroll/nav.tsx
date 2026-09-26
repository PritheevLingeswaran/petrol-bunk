"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["Attendance", "/payroll/attendance"],
  ["Salary structure", "/payroll/structures"],
  ["Salary runs", "/payroll/salary-runs"],
  ["Employee ledger", "/payroll/employee-ledger"],
  ["Payslips", "/payroll/payslips"],
] as const;

export function PayrollNav() {
  const pathname = usePathname();
  return (
    <nav className="billing-tabs">
      <span className="eyebrow">PAYROLL DESK</span>
      {links.map(([label, href]) => (
        <Link
          className={pathname === href ? "active" : ""}
          href={href}
          key={href}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
