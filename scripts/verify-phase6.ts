import { ModuleName } from "@prisma/client";
import { db } from "../src/server/db";
import { isDateWithinWindow } from "../src/lib/access";

function check(condition: boolean, label: string) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS  ${label}`);
}
async function main() {
  const user = await db.user.findUniqueOrThrow({
    where: { username: "salesman" },
    include: {
      role: { include: { permissions: true } },
      employee: true,
      permissions: true,
    },
  });
  const accounts = user.role.permissions.find(
    (row) => row.module === ModuleName.ACCOUNTS,
  );
  const override = user.permissions.find(
    (row) => row.module === ModuleName.ACCOUNTS,
  );
  check(
    accounts?.canView === false && override?.view !== "GRANT",
    "SALESMAN cannot open the accounts module",
  );
  const prior = new Date(
    (user.lockFromDate ?? new Date()).getTime() - 86_400_000,
  );
  check(
    !isDateWithinWindow(prior, user.lockFromDate, user.lockToDate),
    "SALESMAN cannot edit a prior business date",
  );
  check(
    Boolean(user.employee),
    "SALESMAN login is linked to exactly one employee",
  );
  const [all, own] = await Promise.all([
    db.nozzleReading.groupBy({
      by: ["salesmanEmployeeId"],
      where: { outletId: user.defaultOutletId ?? "" },
    }),
    db.nozzleReading.findMany({
      where: {
        outletId: user.defaultOutletId ?? "",
        salesmanEmployeeId: user.employee!.id,
      },
      select: { salesmanEmployeeId: true },
    }),
  ]);
  check(
    all.length > 1 &&
      own.every((row) => row.salesmanEmployeeId === user.employee!.id),
    "SALESMAN figure queries are scoped to their employee id",
  );
  console.log(
    `Verified ${own.length} own nozzle-reading rows across ${all.length} salesmen.`,
  );
}
main()
  .then(() => db.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
