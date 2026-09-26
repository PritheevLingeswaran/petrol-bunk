-- CreateEnum
CREATE TYPE "CashFlowCategory" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING', 'CASH_EQUIVALENT', 'NONE');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('CASH', 'CHEQUE', 'DD', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'CARD', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduleIIIHead" AS ENUM ('SHAREHOLDERS_FUNDS', 'NON_CURRENT_LIABILITIES', 'CURRENT_LIABILITIES', 'NON_CURRENT_ASSETS', 'CURRENT_ASSETS', 'REVENUE_FROM_OPERATIONS', 'OTHER_INCOME', 'COST_OF_MATERIALS', 'EMPLOYEE_BENEFITS', 'FINANCE_COSTS', 'DEPRECIATION', 'OTHER_EXPENSES', 'NONE');

-- AlterTable
ALTER TABLE "account_groups" ADD COLUMN     "cashFlowCategory" "CashFlowCategory" NOT NULL DEFAULT 'OPERATING',
ADD COLUMN     "isDirectCost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduleIIIHead" "ScheduleIIIHead" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "bills" ALTER COLUMN "amountInWords" DROP DEFAULT;

-- AlterTable
ALTER TABLE "voucher_lines" ADD COLUMN     "bankRef" TEXT,
ADD COLUMN     "clearedOn" DATE,
ADD COLUMN     "isReconciled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quantity" DECIMAL(16,2),
ADD COLUMN     "reconciledAt" TIMESTAMP(3),
ADD COLUMN     "reconciledById" TEXT;

-- AlterTable
ALTER TABLE "vouchers" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "instrumentDate" DATE,
ADD COLUMN     "instrumentNo" TEXT,
ADD COLUMN     "instrumentType" "InstrumentType" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "partyAccountId" TEXT,
ADD COLUMN     "reversesVoucherId" TEXT,
ADD COLUMN     "sourceKey" TEXT;

-- CreateTable
CREATE TABLE "voucher_attachments" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voucher_attachments_voucherId_idx" ON "voucher_attachments"("voucherId");

-- CreateIndex
CREATE INDEX "voucher_lines_accountId_isReconciled_idx" ON "voucher_lines"("accountId", "isReconciled");

-- CreateIndex
CREATE INDEX "voucher_lines_productId_businessDate_idx" ON "voucher_lines"("productId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_reversesVoucherId_key" ON "vouchers"("reversesVoucherId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_outletId_sourceKey_key" ON "vouchers"("outletId", "sourceKey");

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_partyAccountId_fkey" FOREIGN KEY ("partyAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_reversesVoucherId_fkey" FOREIGN KEY ("reversesVoucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_attachments" ADD CONSTRAINT "voucher_attachments_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_attachments" ADD CONSTRAINT "voucher_attachments_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

