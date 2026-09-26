-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('OWNER', 'MANAGER', 'ACCOUNTANT', 'CASHIER', 'SALESMAN', 'AUDITOR');

-- CreateEnum
CREATE TYPE "ModuleName" AS ENUM ('DASHBOARD', 'PUMP_OPERATIONS', 'BILLING', 'CUSTOMERS', 'ACCOUNTS', 'INVENTORY', 'PURCHASES', 'PAYROLL', 'REPORTS', 'USER_CONTROL', 'SETTINGS', 'AUDIT');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('INHERIT', 'GRANT', 'REVOKE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'CANCEL', 'APPROVE', 'REJECT', 'DELETE', 'PERMISSION_CHANGE', 'SETTING_CHANGE', 'DATE_LOCK_OVERRIDE', 'PRICE_CHANGE', 'LOGIN_LOCKOUT');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'NUMBER', 'DECIMAL', 'BOOLEAN', 'JSON', 'DATE');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('FUEL_MS', 'FUEL_HSD', 'FUEL_PREMIUM_MS', 'FUEL_PREMIUM_HSD', 'LUBRICANT', 'ADBLUE', 'CNG', 'LPG', 'OTHER');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('LITRE', 'KILOGRAM', 'PIECE', 'MILLILITRE', 'KG_CNG');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "ShiftEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReadingSource" AS ENUM ('MANUAL', 'AUTOMATION', 'CORRECTION');

-- CreateEnum
CREATE TYPE "DipReadingType" AS ENUM ('OPENING', 'CLOSING', 'PRE_DECANT', 'POST_DECANT', 'SPOT_CHECK');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('CASH', 'CREDIT', 'CARD', 'UPI', 'MIXED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('RETAIL', 'CREDIT', 'FLEET', 'CORPORATE', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "PaymentModeType" AS ENUM ('CASH', 'CARD', 'UPI', 'WALLET', 'FLEET_CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "CalibrationChartType" AS ENUM ('FUEL', 'WATER');

-- CreateEnum
CREATE TYPE "RepeatFrequency" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "CollectionKind" AS ENUM ('CASH', 'CARD', 'UPI', 'WALLET', 'FLEET_CARD', 'COUPON', 'CREDIT', 'OWN_USE', 'STAFF_VEHICLE', 'EXPENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('OMC', 'LUBE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('INWARD', 'OUTWARD');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('SALES', 'PURCHASE', 'RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SHIFT_CLOSE', 'STOCK_ADJUSTMENT', 'SALARY', 'DEPRECIATION', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "BalanceType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE_RECEIPT', 'SALE', 'TESTING_RETURN', 'SAMPLE_DRAW', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'RETURN_TO_SUPPLIER');

-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('PENDING', 'APPROVED', 'WRITTEN_OFF', 'RECOVERED');

-- CreateEnum
CREATE TYPE "DecantationStatus" AS ENUM ('DRAFT', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SampleType" AS ENUM ('RETAINED_DECANTATION', 'FILTER_PAPER', 'DENSITY_CHECK', 'AUTHORITY_DRAWN');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'WEEKLY_OFF', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'OVERTIME');

-- CreateEnum
CREATE TYPE "SalaryComponentType" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "SalaryRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('LICENCE_RENEWAL', 'CALIBRATION_DUE', 'INSURANCE_RENEWAL', 'AMC_DUE', 'STATUTORY_FILING', 'CUSTOMER_FOLLOWUP', 'CHEQUE_DUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('OPEN', 'SNOOZED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('OMC', 'LEGAL_METROLOGY', 'WEIGHTS_AND_MEASURES', 'FIRE_SAFETY', 'POLLUTION_CONTROL', 'INTERNAL_AUDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASS', 'PASS_WITH_OBSERVATIONS', 'FAIL', 'PENDING');

-- CreateEnum
CREATE TYPE "CardSettlementStatus" AS ENUM ('PENDING', 'SETTLED', 'SHORT_SETTLED', 'DISPUTED');

-- CreateTable
CREATE TABLE "outlets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "omc" TEXT,
    "dealerCode" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "licenceNo" TEXT,
    "licenceValid" DATE,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "booksClosedTill" DATE,
    "financialYearStartMonth" INTEGER NOT NULL DEFAULT 4,
    "firmId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "logoUrl" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "invoiceTerms" TEXT,
    "declarationText" TEXT,
    "signatureUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firm_document_series" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "padding" INTEGER NOT NULL DEFAULT 5,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "resetYearly" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firm_document_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "module" "ModuleName" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canAdd" BOOLEAN NOT NULL DEFAULT false,
    "canModify" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" "ModuleName" NOT NULL,
    "view" "PermissionEffect" NOT NULL DEFAULT 'INHERIT',
    "add" "PermissionEffect" NOT NULL DEFAULT 'INHERIT',
    "modify" "PermissionEffect" NOT NULL DEFAULT 'INHERIT',
    "delete" "PermissionEffect" NOT NULL DEFAULT 'INHERIT',
    "approve" "PermissionEffect" NOT NULL DEFAULT 'INHERIT',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "defaultOutletId" TEXT,
    "lockFromDate" DATE,
    "lockToDate" DATE,
    "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_outlets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_logs" (
    "id" TEXT NOT NULL,
    "outletId" TEXT,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "failureReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "sessionId" TEXT,
    "loggedOutAt" TIMESTAMP(3),
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "outletId" TEXT,
    "userId" TEXT,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "businessDate" DATE,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changedFields" TEXT[],
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "outletId" TEXT,
    "key" TEXT NOT NULL,
    "valueType" "SettingValueType" NOT NULL DEFAULT 'STRING',
    "value" TEXT NOT NULL,
    "defaultValue" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "group" TEXT NOT NULL DEFAULT 'general',
    "unit" TEXT,
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_series" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "padding" INTEGER NOT NULL DEFAULT 5,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "startNumber" INTEGER NOT NULL DEFAULT 1,
    "resetYearly" BOOLEAN NOT NULL DEFAULT true,
    "financialYear" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameTa" TEXT,
    "type" "UnitOfMeasure" NOT NULL DEFAULT 'LITRE',
    "productType" "ProductType" NOT NULL,
    "hsnCode" TEXT,
    "vatPct" DECIMAL(7,4),
    "gstPct" DECIMAL(7,4),
    "cessPct" DECIMAL(7,4),
    "exciseDutyPerLitre" DECIMAL(12,4),
    "allowanceSettingKey" TEXT,
    "weightedAvgCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(16,2),
    "isFuel" BOOLEAN NOT NULL DEFAULT true,
    "isDensityTracked" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "purchaseRate" DECIMAL(14,4),
    "taxComponent" DECIMAL(12,4),
    "dealerMargin" DECIMAL(12,4),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tanks" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" DECIMAL(16,2) NOT NULL,
    "deadStock" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "lowLevelAlert" DECIMAL(16,2),
    "diameterMm" DECIMAL(10,2),
    "lengthMm" DECIMAL(10,2),
    "calibrationDate" DATE,
    "calibrationDueOn" DATE,
    "calibrationAgency" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tanks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tank_calibration" (
    "id" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "dipMm" DECIMAL(8,1) NOT NULL,
    "litres" DECIMAL(16,2) NOT NULL,
    "chartType" "CalibrationChartType" NOT NULL DEFAULT 'FUEL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tank_calibration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispensing_units" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serialNo" TEXT,
    "installedOn" DATE,
    "stampingDate" DATE,
    "stampingDueOn" DATE,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispensing_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nozzles" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "dispensingUnitId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meterDigits" INTEGER NOT NULL DEFAULT 8,
    "initialReading" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "currentReading" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nozzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameTa" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_entries" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cashierEmployeeId" TEXT,
    "openingFloat" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saleAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saleLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "counterSaleAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalSaleValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCollections" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditSlipTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "digitalCollections" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ownUseAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cashExpenses" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cashToBank" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actualCash" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "shortExcess" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "denominationCount" JSONB,
    "looseCoins" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "hasRateSplit" BOOLEAN NOT NULL DEFAULT false,
    "status" "ShiftEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_settlements" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "shiftEntryId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "nozzleSaleAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "nozzleSaleLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "counterSaleAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalSaleValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "declaredCash" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "denominationCount" JSONB,
    "coinsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "denominationTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "denominationDifference" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "differenceAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "differenceNote" TEXT,
    "cardTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "upiTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "walletTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ownUseTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expenseTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCollections" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "shortExcess" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "withinTolerance" BOOLEAN NOT NULL DEFAULT true,
    "status" "ShiftEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_collections" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "kind" "CollectionKind" NOT NULL,
    "paymentModeId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "machineOrWallet" TEXT,
    "referenceNo" TEXT,
    "cardLast4" TEXT,
    "customerId" TEXT,
    "vehicleId" TEXT,
    "slipNo" TEXT,
    "quantity" DECIMAL(16,2),
    "productId" TEXT,
    "expenseHeadId" TEXT,
    "voucherRef" TEXT,
    "narration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nozzle_readings" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "shiftEntryId" TEXT NOT NULL,
    "nozzleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "rateSegment" INTEGER NOT NULL DEFAULT 1,
    "segmentFrom" TIMESTAMP(3),
    "segmentTo" TIMESTAMP(3),
    "openingReading" DECIMAL(16,2) NOT NULL,
    "closingReading" DECIMAL(16,2) NOT NULL,
    "testingLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "saleLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(12,2) NOT NULL,
    "saleAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "meterRollover" BOOLEAN NOT NULL DEFAULT false,
    "needsApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "salesmanEmployeeId" TEXT,
    "outOfService" BOOLEAN NOT NULL DEFAULT false,
    "outOfServiceAt" TIMESTAMP(3),
    "outOfServiceReason" TEXT,
    "varianceFlag" TEXT,
    "source" "ReadingSource" NOT NULL DEFAULT 'MANUAL',
    "remarks" TEXT,
    "prevReadingId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nozzle_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dip_readings" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "shiftEntryId" TEXT,
    "businessDate" DATE NOT NULL,
    "readingType" "DipReadingType" NOT NULL,
    "readingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuelDipMm" DECIMAL(8,1) NOT NULL,
    "waterDipMm" DECIMAL(8,1) NOT NULL DEFAULT 0,
    "fuelLitres" DECIMAL(16,2) NOT NULL,
    "waterLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "netLitres" DECIMAL(16,2) NOT NULL,
    "temperatureC" DECIMAL(5,1),
    "measuredByEmployeeId" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dip_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "density_readings" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shiftEntryId" TEXT,
    "businessDate" DATE NOT NULL,
    "readingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observedDensity" DECIMAL(6,1) NOT NULL,
    "temperatureC" DECIMAL(5,1) NOT NULL,
    "densityAt15C" DECIMAL(6,1) NOT NULL,
    "invoiceDensity" DECIMAL(6,1),
    "deviation" DECIMAL(6,1),
    "withinTolerance" BOOLEAN NOT NULL DEFAULT true,
    "measuredByEmployeeId" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "density_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL DEFAULT 'OTHER',
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "accountId" TEXT,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "seriesCode" TEXT NOT NULL,
    "seriesNumber" INTEGER NOT NULL,
    "docNumber" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "vehicleNo" TEXT,
    "driverName" TEXT,
    "transporterName" TEXT,
    "subTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dutiesAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tcsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "freightAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tankId" TEXT,
    "compartmentNo" TEXT,
    "quantity" DECIMAL(16,2) NOT NULL,
    "quantityAt15C" DECIMAL(16,2),
    "rate" DECIMAL(14,4) NOT NULL,
    "landedCost" DECIMAL(14,4),
    "invoiceDensity" DECIMAL(6,1),
    "temperatureC" DECIMAL(5,1),
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineNo" INTEGER NOT NULL,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decantations" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "supplierId" TEXT,
    "businessDate" DATE NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "timeIn" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "invoiceNo" TEXT,
    "invoiceDate" DATE,
    "depot" TEXT,
    "vehicleNo" TEXT,
    "driverName" TEXT,
    "transporterName" TEXT,
    "compartmentNo" TEXT,
    "sealNoTop" TEXT,
    "sealNoBottom" TEXT,
    "sealNoIntact" BOOLEAN NOT NULL DEFAULT true,
    "invoiceQty" DECIMAL(16,2) NOT NULL,
    "invoiceQtyAt15C" DECIMAL(16,2),
    "invoiceDensity" DECIMAL(6,1),
    "invoiceTemperatureC" DECIMAL(5,1),
    "dipBeforeMm" DECIMAL(8,1) NOT NULL,
    "dipAfterMm" DECIMAL(8,1) NOT NULL,
    "stockBefore" DECIMAL(16,2) NOT NULL,
    "stockAfter" DECIMAL(16,2) NOT NULL,
    "receivedQty" DECIMAL(16,2) NOT NULL,
    "receivedQtyAt15C" DECIMAL(16,2),
    "observedDensity" DECIMAL(6,1),
    "temperatureC" DECIMAL(5,1),
    "densityAt15C" DECIMAL(6,1),
    "densityDeviation" DECIMAL(6,1),
    "transitLoss" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "lossPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "allowedLoss" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "excessLoss" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "lossValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "withinAllowance" BOOLEAN NOT NULL DEFAULT true,
    "status" "DecantationStatus" NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "supervisedByEmployeeId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decantations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'RETAIL',
    "contactPerson" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingBalanceType" "BalanceType" NOT NULL DEFAULT 'DEBIT',
    "discountPerLitre" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "statementEmail" TEXT,
    "statementMobile" TEXT,
    "accountId" TEXT,
    "blockOnLimitBreach" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_vehicles" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "fuelType" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "monthlyLimit" DECIMAL(18,2),
    "allowedProductCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "customerId" TEXT,
    "vehicleId" TEXT,
    "shiftEntryId" TEXT,
    "seriesCode" TEXT NOT NULL,
    "seriesNumber" INTEGER NOT NULL,
    "docNumber" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "billedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE,
    "type" "BillType" NOT NULL DEFAULT 'CASH',
    "subTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tcsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED',
    "remarks" TEXT,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_lines" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(16,2) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatPct" DECIMAL(7,4),
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gstPct" DECIMAL(7,4),
    "gstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costAtSale" DECIMAL(14,4),
    "lineNo" INTEGER NOT NULL,

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payment_modes" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "paymentModeId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "referenceNo" TEXT,
    "cardLast4" TEXT,
    "approvalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_payment_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_slips" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "shiftEntryId" TEXT,
    "nozzleId" TEXT,
    "productId" TEXT NOT NULL,
    "billId" TEXT,
    "seriesCode" TEXT NOT NULL,
    "seriesNumber" INTEGER NOT NULL,
    "docNumber" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL(16,2) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "slipNo" TEXT,
    "driverName" TEXT,
    "odometer" INTEGER,
    "signatureRef" TEXT,
    "limitOverrideById" TEXT,
    "limitOverrideReason" TEXT,
    "isBilled" BOOLEAN NOT NULL DEFAULT false,
    "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED',
    "remarks" TEXT,
    "issuedByEmployeeId" TEXT,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_modes" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentModeType" NOT NULL,
    "accountId" TEXT,
    "mdrPct" DECIMAL(7,4),
    "settlementDays" INTEGER NOT NULL DEFAULT 0,
    "requiresReference" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "customerId" TEXT,
    "paymentModeId" TEXT NOT NULL,
    "seriesCode" TEXT NOT NULL,
    "seriesNumber" INTEGER NOT NULL,
    "docNumber" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(18,2) NOT NULL,
    "tdsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountAllowed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unallocated" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "referenceNo" TEXT,
    "chequeNo" TEXT,
    "chequeDate" DATE,
    "bankName" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED',
    "remarks" TEXT,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "supplierId" TEXT,
    "customerId" TEXT,
    "employeeId" TEXT,
    "accountId" TEXT,
    "paymentModeId" TEXT NOT NULL,
    "seriesCode" TEXT NOT NULL,
    "seriesNumber" INTEGER NOT NULL,
    "docNumber" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" "PaymentDirection" NOT NULL DEFAULT 'OUTWARD',
    "amount" DECIMAL(18,2) NOT NULL,
    "tdsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "referenceNo" TEXT,
    "chequeNo" TEXT,
    "chequeDate" DATE,
    "bankName" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED',
    "remarks" TEXT,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "paymentModeId" TEXT,
    "shiftEntryId" TEXT,
    "seriesCode" TEXT NOT NULL,
    "seriesNumber" INTEGER NOT NULL,
    "docNumber" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "gstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "paidFromTill" BOOLEAN NOT NULL DEFAULT false,
    "billRef" TEXT,
    "vendorName" TEXT,
    "attachmentUrl" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED',
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_heads" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_settlements" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "paymentModeId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "businessDate" DATE NOT NULL,
    "settlementDate" DATE,
    "batchNo" TEXT,
    "terminalId" TEXT,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "mdrAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gstOnMdr" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "differenceAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "txnCount" INTEGER NOT NULL DEFAULT 0,
    "status" "CardSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "referenceNo" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_groups" (
    "id" TEXT NOT NULL,
    "outletId" TEXT,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nature" "AccountNature" NOT NULL,
    "isBalanceSheet" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nature" "AccountNature" NOT NULL,
    "normalBalance" "BalanceType" NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingBalanceType" "BalanceType" NOT NULL DEFAULT 'DEBIT',
    "openingAsOn" DATE,
    "systemKey" TEXT,
    "isBankAccount" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "seriesCode" TEXT NOT NULL,
    "seriesNumber" INTEGER NOT NULL,
    "docNumber" TEXT NOT NULL,
    "type" "VoucherType" NOT NULL,
    "businessDate" DATE NOT NULL,
    "narration" TEXT,
    "totalDebit" DECIMAL(18,2) NOT NULL,
    "totalCredit" DECIMAL(18,2) NOT NULL,
    "shiftEntryId" TEXT,
    "shiftSettlementId" TEXT,
    "billId" TEXT,
    "purchaseId" TEXT,
    "receiptId" TEXT,
    "paymentId" TEXT,
    "expenseId" TEXT,
    "stockVariationId" TEXT,
    "cardSettlementId" TEXT,
    "salaryRunId" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED',
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_lines" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "narration" TEXT,
    "productId" TEXT,
    "employeeId" TEXT,
    "costCentre" TEXT,
    "lineNo" INTEGER NOT NULL,

    CONSTRAINT "voucher_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fromTankId" TEXT,
    "toTankId" TEXT,
    "shiftEntryId" TEXT,
    "businessDate" DATE NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(16,2) NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(16,2),
    "sourceType" TEXT,
    "sourceId" TEXT,
    "remarks" TEXT,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_variations" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shiftEntryId" TEXT,
    "businessDate" DATE NOT NULL,
    "openingStock" DECIMAL(16,2) NOT NULL,
    "receipts" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "sales" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "ownUseLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "returnsLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "testingLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "sampleLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "transfersIn" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "transfersOut" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "bookStock" DECIMAL(16,2) NOT NULL,
    "dipStock" DECIMAL(16,2) NOT NULL,
    "variationLitres" DECIMAL(16,2) NOT NULL,
    "variationPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "allowancePct" DECIMAL(7,4) NOT NULL,
    "allowedLitres" DECIMAL(16,2) NOT NULL,
    "excessLossLitres" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "excessLossValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "withinAllowance" BOOLEAN NOT NULL DEFAULT true,
    "costPerLitre" DECIMAL(14,4) NOT NULL,
    "variationValue" DECIMAL(18,2) NOT NULL,
    "status" "VariationStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_variations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "samples" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "tankId" TEXT,
    "productId" TEXT NOT NULL,
    "decantationId" TEXT,
    "businessDate" DATE NOT NULL,
    "type" "SampleType" NOT NULL,
    "quantity" DECIMAL(16,2) NOT NULL,
    "observedDensity" DECIMAL(6,1),
    "densityAt15C" DECIMAL(6,1),
    "temperatureC" DECIMAL(5,1),
    "sealNo" TEXT,
    "tankerNo" TEXT,
    "invoiceNo" TEXT,
    "sealedBy" TEXT,
    "retainedTill" DATE,
    "storageRef" TEXT,
    "drawnByEmployeeId" TEXT,
    "witnessName" TEXT,
    "result" TEXT,
    "remarks" TEXT,
    "stickerPrintedAt" TIMESTAMP(3),
    "isDisposed" BOOLEAN NOT NULL DEFAULT false,
    "disposedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "employeeId" TEXT,
    "type" "ReminderType" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "description" TEXT,
    "dueDate" DATE NOT NULL,
    "dueTime" TEXT,
    "alertBefore" INTEGER NOT NULL DEFAULT 30,
    "amount" DECIMAL(18,2),
    "referenceNo" TEXT,
    "assignedToId" TEXT,
    "status" "ReminderStatus" NOT NULL DEFAULT 'OPEN',
    "snoozedTill" DATE,
    "completedAt" TIMESTAMP(3),
    "completedNote" TEXT,
    "repeat" "RepeatFrequency" NOT NULL DEFAULT 'NONE',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurMonths" INTEGER,
    "rolledFromId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "businessDate" DATE NOT NULL,
    "inspectorName" TEXT,
    "authority" TEXT,
    "referenceNo" TEXT,
    "result" "InspectionResult" NOT NULL DEFAULT 'PENDING',
    "observations" TEXT,
    "actionTaken" TEXT,
    "penaltyAmount" DECIMAL(18,2),
    "followUpDate" DATE,
    "attachmentUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "userId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameTa" TEXT,
    "designation" TEXT,
    "department" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "dateOfBirth" DATE,
    "joinedOn" DATE NOT NULL,
    "leftOn" DATE,
    "aadhaarLast4" TEXT,
    "panNumber" TEXT,
    "uanNumber" TEXT,
    "esicNumber" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "accountId" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT,
    "businessDate" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "inTime" TIMESTAMP(3),
    "outTime" TIMESTAMP(3),
    "workedHours" DECIMAL(6,2),
    "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "markedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "accountId" TEXT,
    "componentCode" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "amount" DECIMAL(18,2),
    "percentOf" TEXT,
    "percentage" DECIMAL(7,4),
    "perDayRate" DECIMAL(18,2),
    "perHourRate" DECIMAL(18,2),
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_runs" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "totalEarnings" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalEmployerCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SalaryRunStatus" NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_lines" (
    "id" TEXT NOT NULL,
    "salaryRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "daysPayable" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "daysPresent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "daysAbsent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "grossEarnings" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "advanceRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "shortRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "components" JSONB,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outlets_code_key" ON "outlets"("code");

-- CreateIndex
CREATE INDEX "outlets_isActive_idx" ON "outlets"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "firm_document_series_firmId_documentType_key" ON "firm_document_series"("firmId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_roleId_module_key" ON "permissions"("roleId", "module");

-- CreateIndex
CREATE INDEX "user_permissions_module_idx" ON "user_permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_module_key" ON "user_permissions"("userId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "user_outlets_outletId_idx" ON "user_outlets"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "user_outlets_userId_outletId_key" ON "user_outlets"("userId", "outletId");

-- CreateIndex
CREATE INDEX "login_logs_outletId_attemptedAt_idx" ON "login_logs"("outletId", "attemptedAt");

-- CreateIndex
CREATE INDEX "login_logs_userId_attemptedAt_idx" ON "login_logs"("userId", "attemptedAt");

-- CreateIndex
CREATE INDEX "login_logs_username_attemptedAt_idx" ON "login_logs"("username", "attemptedAt");

-- CreateIndex
CREATE INDEX "login_logs_success_attemptedAt_idx" ON "login_logs"("success", "attemptedAt");

-- CreateIndex
CREATE INDEX "audit_logs_outletId_createdAt_idx" ON "audit_logs"("outletId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tableName_recordId_idx" ON "audit_logs"("tableName", "recordId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "settings_group_idx" ON "settings"("group");

-- CreateIndex
CREATE UNIQUE INDEX "settings_outletId_key_key" ON "settings"("outletId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "number_series_outletId_code_financialYear_key" ON "number_series"("outletId", "code", "financialYear");

-- CreateIndex
CREATE INDEX "products_outletId_productType_idx" ON "products"("outletId", "productType");

-- CreateIndex
CREATE UNIQUE INDEX "products_outletId_code_key" ON "products"("outletId", "code");

-- CreateIndex
CREATE INDEX "price_history_outletId_effectiveDate_idx" ON "price_history"("outletId", "effectiveDate");

-- CreateIndex
CREATE INDEX "price_history_productId_effectiveFrom_idx" ON "price_history"("productId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "price_history_outletId_productId_effectiveFrom_key" ON "price_history"("outletId", "productId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "tanks_outletId_productId_idx" ON "tanks"("outletId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "tanks_outletId_code_key" ON "tanks"("outletId", "code");

-- CreateIndex
CREATE INDEX "tank_calibration_tankId_chartType_dipMm_idx" ON "tank_calibration"("tankId", "chartType", "dipMm");

-- CreateIndex
CREATE UNIQUE INDEX "tank_calibration_tankId_chartType_dipMm_key" ON "tank_calibration"("tankId", "chartType", "dipMm");

-- CreateIndex
CREATE UNIQUE INDEX "dispensing_units_outletId_code_key" ON "dispensing_units"("outletId", "code");

-- CreateIndex
CREATE INDEX "nozzles_dispensingUnitId_idx" ON "nozzles"("dispensingUnitId");

-- CreateIndex
CREATE INDEX "nozzles_tankId_idx" ON "nozzles"("tankId");

-- CreateIndex
CREATE UNIQUE INDEX "nozzles_outletId_code_key" ON "nozzles"("outletId", "code");

-- CreateIndex
CREATE INDEX "shifts_outletId_sequence_idx" ON "shifts"("outletId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_outletId_code_key" ON "shifts"("outletId", "code");

-- CreateIndex
CREATE INDEX "shift_entries_outletId_businessDate_idx" ON "shift_entries"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "shift_entries_status_idx" ON "shift_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shift_entries_outletId_businessDate_shiftId_key" ON "shift_entries"("outletId", "businessDate", "shiftId");

-- CreateIndex
CREATE INDEX "shift_settlements_outletId_businessDate_idx" ON "shift_settlements"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "shift_settlements_employeeId_businessDate_idx" ON "shift_settlements"("employeeId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "shift_settlements_shiftEntryId_employeeId_key" ON "shift_settlements"("shiftEntryId", "employeeId");

-- CreateIndex
CREATE INDEX "shift_collections_settlementId_idx" ON "shift_collections"("settlementId");

-- CreateIndex
CREATE INDEX "shift_collections_outletId_kind_idx" ON "shift_collections"("outletId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "nozzle_readings_prevReadingId_key" ON "nozzle_readings"("prevReadingId");

-- CreateIndex
CREATE INDEX "nozzle_readings_outletId_businessDate_idx" ON "nozzle_readings"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "nozzle_readings_nozzleId_businessDate_idx" ON "nozzle_readings"("nozzleId", "businessDate");

-- CreateIndex
CREATE INDEX "nozzle_readings_salesmanEmployeeId_businessDate_idx" ON "nozzle_readings"("salesmanEmployeeId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "nozzle_readings_shiftEntryId_nozzleId_rateSegment_key" ON "nozzle_readings"("shiftEntryId", "nozzleId", "rateSegment");

-- CreateIndex
CREATE INDEX "dip_readings_outletId_businessDate_idx" ON "dip_readings"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "dip_readings_tankId_businessDate_idx" ON "dip_readings"("tankId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "dip_readings_shiftEntryId_tankId_readingType_key" ON "dip_readings"("shiftEntryId", "tankId", "readingType");

-- CreateIndex
CREATE INDEX "density_readings_outletId_businessDate_idx" ON "density_readings"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "density_readings_tankId_businessDate_idx" ON "density_readings"("tankId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_accountId_key" ON "suppliers"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_outletId_code_key" ON "suppliers"("outletId", "code");

-- CreateIndex
CREATE INDEX "purchases_outletId_businessDate_idx" ON "purchases"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_outletId_seriesCode_seriesNumber_key" ON "purchases"("outletId", "seriesCode", "seriesNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_outletId_supplierId_invoiceNo_key" ON "purchases"("outletId", "supplierId", "invoiceNo");

-- CreateIndex
CREATE INDEX "purchase_lines_productId_idx" ON "purchase_lines"("productId");

-- CreateIndex
CREATE INDEX "purchase_lines_tankId_idx" ON "purchase_lines"("tankId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_lines_purchaseId_lineNo_key" ON "purchase_lines"("purchaseId", "lineNo");

-- CreateIndex
CREATE INDEX "decantations_outletId_businessDate_idx" ON "decantations"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "decantations_tankId_businessDate_idx" ON "decantations"("tankId", "businessDate");

-- CreateIndex
CREATE INDEX "decantations_vehicleNo_businessDate_idx" ON "decantations"("vehicleNo", "businessDate");

-- CreateIndex
CREATE INDEX "decantations_transporterName_businessDate_idx" ON "decantations"("transporterName", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "customers_accountId_key" ON "customers"("accountId");

-- CreateIndex
CREATE INDEX "customers_outletId_type_idx" ON "customers"("outletId", "type");

-- CreateIndex
CREATE INDEX "customers_outletId_name_idx" ON "customers"("outletId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_outletId_code_key" ON "customers"("outletId", "code");

-- CreateIndex
CREATE INDEX "customer_vehicles_vehicleNo_idx" ON "customer_vehicles"("vehicleNo");

-- CreateIndex
CREATE UNIQUE INDEX "customer_vehicles_customerId_vehicleNo_key" ON "customer_vehicles"("customerId", "vehicleNo");

-- CreateIndex
CREATE INDEX "bills_outletId_businessDate_idx" ON "bills"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "bills_customerId_businessDate_idx" ON "bills"("customerId", "businessDate");

-- CreateIndex
CREATE INDEX "bills_status_idx" ON "bills"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bills_outletId_seriesCode_seriesNumber_key" ON "bills"("outletId", "seriesCode", "seriesNumber");

-- CreateIndex
CREATE INDEX "bill_lines_productId_idx" ON "bill_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "bill_lines_billId_lineNo_key" ON "bill_lines"("billId", "lineNo");

-- CreateIndex
CREATE INDEX "bill_payment_modes_billId_idx" ON "bill_payment_modes"("billId");

-- CreateIndex
CREATE INDEX "bill_payment_modes_paymentModeId_idx" ON "bill_payment_modes"("paymentModeId");

-- CreateIndex
CREATE INDEX "credit_slips_outletId_businessDate_idx" ON "credit_slips"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "credit_slips_customerId_businessDate_idx" ON "credit_slips"("customerId", "businessDate");

-- CreateIndex
CREATE INDEX "credit_slips_isBilled_idx" ON "credit_slips"("isBilled");

-- CreateIndex
CREATE UNIQUE INDEX "credit_slips_outletId_seriesCode_seriesNumber_key" ON "credit_slips"("outletId", "seriesCode", "seriesNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payment_modes_outletId_code_key" ON "payment_modes"("outletId", "code");

-- CreateIndex
CREATE INDEX "receipts_outletId_businessDate_idx" ON "receipts"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "receipts_customerId_businessDate_idx" ON "receipts"("customerId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_outletId_seriesCode_seriesNumber_key" ON "receipts"("outletId", "seriesCode", "seriesNumber");

-- CreateIndex
CREATE INDEX "payments_outletId_businessDate_idx" ON "payments"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "payments_supplierId_businessDate_idx" ON "payments"("supplierId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "payments_outletId_seriesCode_seriesNumber_key" ON "payments"("outletId", "seriesCode", "seriesNumber");

-- CreateIndex
CREATE INDEX "expenses_outletId_businessDate_idx" ON "expenses"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "expenses_accountId_businessDate_idx" ON "expenses"("accountId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_outletId_seriesCode_seriesNumber_key" ON "expenses"("outletId", "seriesCode", "seriesNumber");

-- CreateIndex
CREATE INDEX "expense_heads_outletId_isActive_idx" ON "expense_heads"("outletId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "expense_heads_outletId_code_key" ON "expense_heads"("outletId", "code");

-- CreateIndex
CREATE INDEX "card_settlements_outletId_businessDate_idx" ON "card_settlements"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "card_settlements_status_idx" ON "card_settlements"("status");

-- CreateIndex
CREATE INDEX "account_groups_parentId_idx" ON "account_groups"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "account_groups_outletId_code_key" ON "account_groups"("outletId", "code");

-- CreateIndex
CREATE INDEX "accounts_outletId_groupId_idx" ON "accounts"("outletId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_outletId_code_key" ON "accounts"("outletId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_outletId_systemKey_key" ON "accounts"("outletId", "systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_shiftSettlementId_key" ON "vouchers"("shiftSettlementId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_billId_key" ON "vouchers"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_purchaseId_key" ON "vouchers"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_receiptId_key" ON "vouchers"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_paymentId_key" ON "vouchers"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_expenseId_key" ON "vouchers"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_stockVariationId_key" ON "vouchers"("stockVariationId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_cardSettlementId_key" ON "vouchers"("cardSettlementId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_salaryRunId_key" ON "vouchers"("salaryRunId");

-- CreateIndex
CREATE INDEX "vouchers_outletId_businessDate_idx" ON "vouchers"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "vouchers_outletId_type_businessDate_idx" ON "vouchers"("outletId", "type", "businessDate");

-- CreateIndex
CREATE INDEX "vouchers_status_idx" ON "vouchers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_outletId_seriesCode_seriesNumber_key" ON "vouchers"("outletId", "seriesCode", "seriesNumber");

-- CreateIndex
CREATE INDEX "voucher_lines_outletId_businessDate_idx" ON "voucher_lines"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "voucher_lines_accountId_businessDate_idx" ON "voucher_lines"("accountId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_lines_voucherId_lineNo_key" ON "voucher_lines"("voucherId", "lineNo");

-- CreateIndex
CREATE INDEX "stock_movements_outletId_businessDate_idx" ON "stock_movements"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "stock_movements_productId_businessDate_idx" ON "stock_movements"("productId", "businessDate");

-- CreateIndex
CREATE INDEX "stock_movements_sourceType_sourceId_idx" ON "stock_movements"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "stock_variations_outletId_businessDate_idx" ON "stock_variations"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "stock_variations_status_idx" ON "stock_variations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_variations_outletId_tankId_businessDate_shiftEntryId_key" ON "stock_variations"("outletId", "tankId", "businessDate", "shiftEntryId");

-- CreateIndex
CREATE INDEX "samples_outletId_businessDate_idx" ON "samples"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "samples_tankId_businessDate_idx" ON "samples"("tankId", "businessDate");

-- CreateIndex
CREATE INDEX "reminders_outletId_dueDate_idx" ON "reminders"("outletId", "dueDate");

-- CreateIndex
CREATE INDEX "reminders_status_dueDate_idx" ON "reminders"("status", "dueDate");

-- CreateIndex
CREATE INDEX "inspections_outletId_businessDate_idx" ON "inspections"("outletId", "businessDate");

-- CreateIndex
CREATE INDEX "inspections_type_businessDate_idx" ON "inspections"("type", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_accountId_key" ON "employees"("accountId");

-- CreateIndex
CREATE INDEX "employees_outletId_status_idx" ON "employees"("outletId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_outletId_code_key" ON "employees"("outletId", "code");

-- CreateIndex
CREATE INDEX "attendance_outletId_businessDate_idx" ON "attendance"("outletId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_employeeId_businessDate_shiftId_key" ON "attendance"("employeeId", "businessDate", "shiftId");

-- CreateIndex
CREATE INDEX "salary_structures_outletId_effectiveFrom_idx" ON "salary_structures"("outletId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_employeeId_componentCode_effectiveFrom_key" ON "salary_structures"("employeeId", "componentCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "salary_runs_outletId_businessDate_idx" ON "salary_runs"("outletId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "salary_runs_outletId_periodYear_periodMonth_key" ON "salary_runs"("outletId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "salary_lines_employeeId_idx" ON "salary_lines"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_lines_salaryRunId_employeeId_key" ON "salary_lines"("salaryRunId", "employeeId");

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firm_document_series" ADD CONSTRAINT "firm_document_series_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_outlets" ADD CONSTRAINT "user_outlets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_outlets" ADD CONSTRAINT "user_outlets_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_series" ADD CONSTRAINT "number_series_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tank_calibration" ADD CONSTRAINT "tank_calibration_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispensing_units" ADD CONSTRAINT "dispensing_units_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_dispensingUnitId_fkey" FOREIGN KEY ("dispensingUnitId") REFERENCES "dispensing_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_cashierEmployeeId_fkey" FOREIGN KEY ("cashierEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_settlements" ADD CONSTRAINT "shift_settlements_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_settlements" ADD CONSTRAINT "shift_settlements_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_settlements" ADD CONSTRAINT "shift_settlements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_collections" ADD CONSTRAINT "shift_collections_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_collections" ADD CONSTRAINT "shift_collections_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "shift_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_collections" ADD CONSTRAINT "shift_collections_paymentModeId_fkey" FOREIGN KEY ("paymentModeId") REFERENCES "payment_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_collections" ADD CONSTRAINT "shift_collections_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_collections" ADD CONSTRAINT "shift_collections_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_collections" ADD CONSTRAINT "shift_collections_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_collections" ADD CONSTRAINT "shift_collections_expenseHeadId_fkey" FOREIGN KEY ("expenseHeadId") REFERENCES "expense_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_nozzleId_fkey" FOREIGN KEY ("nozzleId") REFERENCES "nozzles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_salesmanEmployeeId_fkey" FOREIGN KEY ("salesmanEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_prevReadingId_fkey" FOREIGN KEY ("prevReadingId") REFERENCES "nozzle_readings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dip_readings" ADD CONSTRAINT "dip_readings_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dip_readings" ADD CONSTRAINT "dip_readings_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dip_readings" ADD CONSTRAINT "dip_readings_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dip_readings" ADD CONSTRAINT "dip_readings_measuredByEmployeeId_fkey" FOREIGN KEY ("measuredByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_measuredByEmployeeId_fkey" FOREIGN KEY ("measuredByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_supervisedByEmployeeId_fkey" FOREIGN KEY ("supervisedByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payment_modes" ADD CONSTRAINT "bill_payment_modes_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payment_modes" ADD CONSTRAINT "bill_payment_modes_paymentModeId_fkey" FOREIGN KEY ("paymentModeId") REFERENCES "payment_modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_slips" ADD CONSTRAINT "credit_slips_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_slips" ADD CONSTRAINT "credit_slips_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_slips" ADD CONSTRAINT "credit_slips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_slips" ADD CONSTRAINT "credit_slips_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_slips" ADD CONSTRAINT "credit_slips_nozzleId_fkey" FOREIGN KEY ("nozzleId") REFERENCES "nozzles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_slips" ADD CONSTRAINT "credit_slips_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_slips" ADD CONSTRAINT "credit_slips_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_slips" ADD CONSTRAINT "credit_slips_issuedByEmployeeId_fkey" FOREIGN KEY ("issuedByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_modes" ADD CONSTRAINT "payment_modes_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_modes" ADD CONSTRAINT "payment_modes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_paymentModeId_fkey" FOREIGN KEY ("paymentModeId") REFERENCES "payment_modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentModeId_fkey" FOREIGN KEY ("paymentModeId") REFERENCES "payment_modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paymentModeId_fkey" FOREIGN KEY ("paymentModeId") REFERENCES "payment_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_heads" ADD CONSTRAINT "expense_heads_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_heads" ADD CONSTRAINT "expense_heads_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_settlements" ADD CONSTRAINT "card_settlements_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_settlements" ADD CONSTRAINT "card_settlements_paymentModeId_fkey" FOREIGN KEY ("paymentModeId") REFERENCES "payment_modes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_settlements" ADD CONSTRAINT "card_settlements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "account_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "account_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_shiftSettlementId_fkey" FOREIGN KEY ("shiftSettlementId") REFERENCES "shift_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_stockVariationId_fkey" FOREIGN KEY ("stockVariationId") REFERENCES "stock_variations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cardSettlementId_fkey" FOREIGN KEY ("cardSettlementId") REFERENCES "card_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_salaryRunId_fkey" FOREIGN KEY ("salaryRunId") REFERENCES "salary_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_lines" ADD CONSTRAINT "voucher_lines_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_lines" ADD CONSTRAINT "voucher_lines_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_lines" ADD CONSTRAINT "voucher_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fromTankId_fkey" FOREIGN KEY ("fromTankId") REFERENCES "tanks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_toTankId_fkey" FOREIGN KEY ("toTankId") REFERENCES "tanks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variations" ADD CONSTRAINT "stock_variations_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variations" ADD CONSTRAINT "stock_variations_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variations" ADD CONSTRAINT "stock_variations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variations" ADD CONSTRAINT "stock_variations_shiftEntryId_fkey" FOREIGN KEY ("shiftEntryId") REFERENCES "shift_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_decantationId_fkey" FOREIGN KEY ("decantationId") REFERENCES "decantations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_drawnByEmployeeId_fkey" FOREIGN KEY ("drawnByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_runs" ADD CONSTRAINT "salary_runs_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_lines" ADD CONSTRAINT "salary_lines_salaryRunId_fkey" FOREIGN KEY ("salaryRunId") REFERENCES "salary_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_lines" ADD CONSTRAINT "salary_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

