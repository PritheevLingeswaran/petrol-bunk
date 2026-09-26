-- Phase 4: immutable multi-channel billing, running-short credit and delivery logs.
ALTER TYPE "BillType" ADD VALUE 'COUNTER';
ALTER TYPE "BillType" ADD VALUE 'CONSOLIDATED';
ALTER TYPE "BillType" ADD VALUE 'CREDIT_NOTE';

CREATE TYPE "InvoiceKind" AS ENUM ('GST_INVOICE', 'BILL_OF_SUPPLY');
CREATE TYPE "BillChannel" AS ENUM ('DESKTOP', 'MOBILE', 'CONSOLIDATED');
CREATE TYPE "PrintLayout" AS ENUM ('THERMAL_80MM', 'A5', 'A4');
CREATE TYPE "ConsolidationFormat" AS ENUM ('DATE_WISE', 'VEHICLE_WISE', 'SLIP_WISE', 'PRODUCT_WISE');
CREATE TYPE "ShortCreditStatus" AS ENUM ('ISSUED', 'CONVERTED', 'RECOVERED', 'WRITTEN_OFF');
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'EMAIL');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "bills"
  ADD COLUMN "salesmanEmployeeId" TEXT,
  ADD COLUMN "nozzleId" TEXT,
  ADD COLUMN "originalBillId" TEXT,
  ADD COLUMN "invoiceKind" "InvoiceKind" NOT NULL DEFAULT 'BILL_OF_SUPPLY',
  ADD COLUMN "channel" "BillChannel" NOT NULL DEFAULT 'DESKTOP',
  ADD COLUMN "clientRequestId" TEXT,
  ADD COLUMN "vehicleNo" TEXT,
  ADD COLUMN "driverName" TEXT,
  ADD COLUMN "customerName" TEXT,
  ADD COLUMN "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "amountInWords" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "consolidationFrom" DATE,
  ADD COLUMN "consolidationTo" DATE,
  ADD COLUMN "consolidationFormat" "ConsolidationFormat",
  ADD COLUMN "printedAt" TIMESTAMP(3),
  ADD COLUMN "printedById" TEXT,
  ADD COLUMN "printCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "irn" TEXT,
  ADD COLUMN "acknowledgementNo" TEXT,
  ADD COLUMN "acknowledgementAt" TIMESTAMP(3),
  ADD COLUMN "signedQr" TEXT,
  ADD COLUMN "eInvoicePayload" JSONB,
  ADD COLUMN "cancellationRequestedById" TEXT,
  ADD COLUMN "cancellationRequestedAt" TIMESTAMP(3),
  ADD COLUMN "cancellationRequestReason" TEXT,
  ADD COLUMN "cancellationApprovedById" TEXT,
  ADD COLUMN "cancellationApprovedAt" TIMESTAMP(3);

ALTER TABLE "bill_lines"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "unit" "UnitOfMeasure" NOT NULL DEFAULT 'LITRE',
  ADD COLUMN "hsnCode" TEXT,
  ADD COLUMN "discountPerUnit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cgstPct" DECIMAL(7,4),
  ADD COLUMN "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sgstPct" DECIMAL(7,4),
  ADD COLUMN "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "igstPct" DECIMAL(7,4),
  ADD COLUMN "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cessPct" DECIMAL(7,4);

CREATE TABLE "short_credits" (
  "id" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "customerId" TEXT,
  "vehicleId" TEXT,
  "shiftEntryId" TEXT,
  "salesmanEmployeeId" TEXT NOT NULL,
  "nozzleId" TEXT,
  "productId" TEXT NOT NULL,
  "convertedBillId" TEXT,
  "seriesCode" TEXT NOT NULL,
  "seriesNumber" INTEGER NOT NULL,
  "docNumber" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" DATE,
  "customerName" TEXT NOT NULL,
  "mobile" TEXT,
  "vehicleNo" TEXT,
  "driverName" TEXT,
  "quantity" DECIMAL(16,2) NOT NULL,
  "rate" DECIMAL(12,2) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "recoveredAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" "ShortCreditStatus" NOT NULL DEFAULT 'ISSUED',
  "remarks" TEXT,
  "resolutionReason" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "short_credits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bill_notifications" (
  "id" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "bill_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bills_outletId_clientRequestId_key" ON "bills"("outletId", "clientRequestId");
CREATE INDEX "bills_salesmanEmployeeId_businessDate_idx" ON "bills"("salesmanEmployeeId", "businessDate");
CREATE UNIQUE INDEX "short_credits_convertedBillId_key" ON "short_credits"("convertedBillId");
CREATE UNIQUE INDEX "short_credits_outletId_seriesCode_seriesNumber_key" ON "short_credits"("outletId", "seriesCode", "seriesNumber");
CREATE INDEX "short_credits_outletId_businessDate_idx" ON "short_credits"("outletId", "businessDate");
CREATE INDEX "short_credits_outletId_status_businessDate_idx" ON "short_credits"("outletId", "status", "businessDate");
CREATE INDEX "short_credits_customerId_businessDate_idx" ON "short_credits"("customerId", "businessDate");
CREATE INDEX "bill_notifications_outletId_attemptedAt_idx" ON "bill_notifications"("outletId", "attemptedAt");
CREATE INDEX "bill_notifications_billId_channel_idx" ON "bill_notifications"("billId", "channel");

ALTER TABLE "bills" ADD CONSTRAINT "bills_salesmanEmployeeId_fkey" FOREIGN KEY ("salesmanEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bills" ADD CONSTRAINT "bills_nozzleId_fkey" FOREIGN KEY ("nozzleId") REFERENCES "nozzles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bills" ADD CONSTRAINT "bills_originalBillId_fkey" FOREIGN KEY ("originalBillId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "short_credits" ADD CONSTRAINT "short_credits_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "short_credits" ADD CONSTRAINT "short_credits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "short_credits" ADD CONSTRAINT "short_credits_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "short_credits" ADD CONSTRAINT "short_credits_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "short_credits" ADD CONSTRAINT "short_credits_salesmanEmployeeId_fkey" FOREIGN KEY ("salesmanEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "short_credits" ADD CONSTRAINT "short_credits_nozzleId_fkey" FOREIGN KEY ("nozzleId") REFERENCES "nozzles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "short_credits" ADD CONSTRAINT "short_credits_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "short_credits" ADD CONSTRAINT "short_credits_convertedBillId_fkey" FOREIGN KEY ("convertedBillId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bill_notifications" ADD CONSTRAINT "bill_notifications_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bill_notifications" ADD CONSTRAINT "bill_notifications_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
