ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'CASUAL_LEAVE';
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'SICK_LEAVE';

CREATE TYPE "InspectionItemResult" AS ENUM ('PASS', 'FAIL', 'NOT_APPLICABLE');

ALTER TABLE "salary_structures"
  ADD COLUMN "perShiftRate" DECIMAL(18,2),
  ADD COLUMN "perLitreRate" DECIMAL(12,4);

ALTER TABLE "inspections"
  ADD COLUMN "inspectorDesignation" TEXT,
  ADD COLUMN "organisation" TEXT,
  ADD COLUMN "correctiveAction" TEXT,
  ADD COLUMN "correctiveActionDueDate" DATE,
  ADD COLUMN "signatureUrl" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE TABLE "user_screen_permissions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "screenKey" TEXT NOT NULL,
  "effect" "PermissionEffect" NOT NULL DEFAULT 'INHERIT',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_screen_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_batches" (
  "id" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "batchNo" TEXT NOT NULL,
  "mrp" DECIMAL(12,2),
  "purchaseRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "manufacturedOn" DATE,
  "expiryDate" DATE,
  "barcode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_movements" ADD COLUMN "batchId" TEXT;

CREATE TABLE "inspection_items" (
  "id" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "result" "InspectionItemResult" NOT NULL DEFAULT 'PASS',
  "measuredValue" DECIMAL(12,2),
  "expectedValue" DECIMAL(12,2),
  "unit" TEXT,
  "observation" TEXT,
  "correctiveAction" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inspection_photos" (
  "id" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "caption" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_screen_permissions_userId_screenKey_key" ON "user_screen_permissions"("userId", "screenKey");
CREATE INDEX "user_screen_permissions_screenKey_idx" ON "user_screen_permissions"("screenKey");
CREATE UNIQUE INDEX "inventory_batches_outletId_productId_batchNo_key" ON "inventory_batches"("outletId", "productId", "batchNo");
CREATE INDEX "inventory_batches_outletId_expiryDate_idx" ON "inventory_batches"("outletId", "expiryDate");
CREATE INDEX "stock_movements_batchId_businessDate_idx" ON "stock_movements"("batchId", "businessDate");
CREATE UNIQUE INDEX "inspection_items_inspectionId_code_key" ON "inspection_items"("inspectionId", "code");
CREATE INDEX "inspection_items_outletId_inspectionId_idx" ON "inspection_items"("outletId", "inspectionId");
CREATE INDEX "inspection_photos_outletId_inspectionId_idx" ON "inspection_photos"("outletId", "inspectionId");

ALTER TABLE "user_screen_permissions" ADD CONSTRAINT "user_screen_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
