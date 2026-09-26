import type { ModuleName } from "@prisma/client";

export type ScreenDefinition = {
  label: string;
  href: string;
  module: ModuleName;
};
export type NavigationSection = { label: string; items: ScreenDefinition[] };

export const navigationSections: NavigationSection[] = [
  {
    // The dashboard is the landing screen; DASHBOARD is the module that
    // governs it, so a role without it never sees the link.
    label: "Dashboard",
    items: [{ label: "Owner dashboard", href: "/", module: "DASHBOARD" }],
  },
  {
    label: "Daily operations",
    items: [
      {
        label: "Shift entry",
        href: "/pump/shift-entry",
        module: "PUMP_OPERATIONS",
      },
      {
        label: "Shift cash closing",
        href: "/pump/settlement",
        module: "PUMP_OPERATIONS",
      },
      {
        label: "Dip & density",
        href: "/pump/dip-density",
        module: "PUMP_OPERATIONS",
      },
      {
        label: "Tanker receipt",
        href: "/pump/decantation",
        module: "PUMP_OPERATIONS",
      },
    ],
  },
  {
    label: "Control reports",
    items: [
      {
        label: "Stock variation",
        href: "/pump/variation",
        module: "PUMP_OPERATIONS",
      },
      {
        label: "Density register",
        href: "/pump/density-register",
        module: "PUMP_OPERATIONS",
      },
      {
        label: "Tanker receipt loss",
        href: "/pump/tanker-loss",
        module: "PUMP_OPERATIONS",
      },
      {
        label: "Sample register",
        href: "/pump/samples",
        module: "PUMP_OPERATIONS",
      },
      {
        label: "Reminders",
        href: "/pump/reminders",
        module: "PUMP_OPERATIONS",
      },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Bill register", href: "/billing/bills", module: "BILLING" },
      { label: "Cash billing", href: "/billing/cash", module: "BILLING" },
      { label: "Credit billing", href: "/billing/credit", module: "BILLING" },
      { label: "Counter billing", href: "/billing/counter", module: "BILLING" },
      {
        label: "Running short",
        href: "/billing/running-short",
        module: "BILLING",
      },
      {
        label: "Consolidated",
        href: "/billing/consolidated",
        module: "BILLING",
      },
      { label: "E-invoice", href: "/billing/e-invoice", module: "BILLING" },
      {
        label: "Credit notes",
        href: "/billing/credit-notes",
        module: "BILLING",
      },
      { label: "Mobile billing", href: "/billing/mobile", module: "BILLING" },
      { label: "Customers", href: "/billing/customers", module: "CUSTOMERS" },
      {
        label: "Billing settings",
        href: "/billing/settings",
        module: "SETTINGS",
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        label: "Stock ledger",
        href: "/inventory/stock-ledger",
        module: "INVENTORY",
      },
      {
        label: "Stock status",
        href: "/inventory/stock-status",
        module: "INVENTORY",
      },
      {
        label: "Product profit",
        href: "/inventory/profit",
        module: "INVENTORY",
      },
      {
        label: "Tank stock",
        href: "/inventory/tank-stock",
        module: "INVENTORY",
      },
      {
        label: "Inspections",
        href: "/inventory/inspections",
        module: "INVENTORY",
      },
      {
        label: "Lube & merchandise",
        href: "/inventory/batches",
        module: "INVENTORY",
      },
      { label: "Price master", href: "/inventory/prices", module: "INVENTORY" },
      {
        label: "Dip calibration",
        href: "/inventory/calibration",
        module: "INVENTORY",
      },
      { label: "Suppliers", href: "/inventory/suppliers", module: "PURCHASES" },
    ],
  },
  {
    label: "Payroll",
    items: [
      { label: "Attendance", href: "/payroll/attendance", module: "PAYROLL" },
      {
        label: "Salary structure",
        href: "/payroll/structures",
        module: "PAYROLL",
      },
      { label: "Salary runs", href: "/payroll/salary-runs", module: "PAYROLL" },
      {
        label: "Employee ledger",
        href: "/payroll/employee-ledger",
        module: "PAYROLL",
      },
      { label: "Payslips", href: "/payroll/payslips", module: "PAYROLL" },
    ],
  },
  {
    label: "Accounts",
    items: [
      { label: "Vouchers", href: "/accounts/vouchers", module: "ACCOUNTS" },
      { label: "Ledger", href: "/accounts/ledger", module: "ACCOUNTS" },
      {
        label: "Trial balance",
        href: "/accounts/trial-balance",
        module: "ACCOUNTS",
      },
      {
        label: "Profit & loss",
        href: "/accounts/profit-loss",
        module: "ACCOUNTS",
      },
      {
        label: "Balance sheet",
        href: "/accounts/balance-sheet",
        module: "ACCOUNTS",
      },
      { label: "Cash flow", href: "/accounts/cash-flow", module: "ACCOUNTS" },
      { label: "Cash book", href: "/accounts/cash-book", module: "ACCOUNTS" },
      { label: "Bank book", href: "/accounts/bank-book", module: "ACCOUNTS" },
      { label: "Debtors", href: "/accounts/debtors", module: "ACCOUNTS" },
      {
        label: "Outstanding ageing",
        href: "/accounts/ageing",
        module: "ACCOUNTS",
      },
      {
        label: "Customer statements",
        href: "/accounts/statements",
        module: "ACCOUNTS",
      },
      { label: "GST returns", href: "/accounts/gst", module: "ACCOUNTS" },
      {
        label: "Chart of accounts",
        href: "/accounts/chart-of-accounts",
        module: "ACCOUNTS",
      },
      {
        label: "Payment modes",
        href: "/accounts/payment-modes",
        module: "ACCOUNTS",
      },
      {
        label: "Expense heads",
        href: "/accounts/expense-heads",
        module: "ACCOUNTS",
      },
    ],
  },
  {
    label: "Organisation",
    items: [
      { label: "Outlets", href: "/admin/outlets", module: "SETTINGS" },
      { label: "Firm & GST", href: "/admin/firm-settings", module: "SETTINGS" },
      { label: "Products", href: "/admin/products", module: "INVENTORY" },
      { label: "Employees", href: "/admin/employees", module: "PAYROLL" },
      { label: "Tanks", href: "/pump/tanks", module: "INVENTORY" },
      {
        label: "Dispensing units",
        href: "/pump/dispensing-units",
        module: "INVENTORY",
      },
      { label: "Nozzles", href: "/pump/nozzles", module: "INVENTORY" },
      { label: "Shifts", href: "/pump/shifts", module: "PUMP_OPERATIONS" },
    ],
  },
  {
    label: "User control",
    items: [
      {
        label: "Permission matrix",
        href: "/admin/permissions",
        module: "USER_CONTROL",
      },
      {
        label: "User restrictions",
        href: "/admin/user-control",
        module: "USER_CONTROL",
      },
      { label: "Login log", href: "/admin/login-logs", module: "AUDIT" },
      { label: "Audit log", href: "/admin/audit-logs", module: "AUDIT" },
    ],
  },
];

export const screenDefinitions = navigationSections.flatMap(
  (section) => section.items,
);
export function screenForPath(pathname: string) {
  return screenDefinitions.find(
    (screen) =>
      pathname === screen.href || pathname.startsWith(`${screen.href}/`),
  );
}
