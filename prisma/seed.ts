import { AccountNature, BalanceType, CashFlowCategory, ModuleName, PaymentModeType, Prisma, RoleCode, ScheduleIIIHead, SupplierType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "../src/server/db";
import { ensureSettingsSeeded } from "../src/server/settings";
import { seedHistory } from "./seed-history";
import { seedBillingHistory } from "./seed-billing";
import { seedPostings } from "./seed-postings";
import { seedPhase6 } from "./seed-phase6";
import { businessDateToday } from "../src/lib/date";

const d = (value: string) => new Prisma.Decimal(value);

const products = [
  ["MS", "MS (Petrol)", "FUEL_MS", "27101219", "0", true, true], ["HSD", "HSD (Diesel)", "FUEL_HSD", "27101930", "0", true, true], ["XP95", "XP95 / Power Petrol", "FUEL_PREMIUM_MS", "27101219", "0", true, true], ["PD", "Power Diesel", "FUEL_PREMIUM_HSD", "27101930", "0", true, true], ["CNG", "CNG", "CNG", "27112100", "0", true, false], ["LUBE-5W30", "Engine Oil 5W-30", "LUBRICANT", "27101980", "18", false, false], ["2T", "2T Oil", "LUBRICANT", "27101980", "18", false, false], ["ADBLUE", "AdBlue", "ADBLUE", "38249900", "18", false, false], ["COOLANT", "Coolant", "OTHER", "38200000", "18", false, false], ["MERCH", "Merchandise", "OTHER", "999999", "18", false, false],
] as const;

const accountGroups: { code: string; name: string; nature: AccountNature; parent?: string; balance: boolean; order: number; schedule?: ScheduleIIIHead; cashFlow?: CashFlowCategory; directCost?: boolean }[] = [
  // ---- Assets ------------------------------------------------------------
  { code: "ASSET", name: "Assets", nature: "ASSET", balance: true, order: 1, schedule: "CURRENT_ASSETS", cashFlow: "OPERATING" },
  { code: "FIXED_ASSET", name: "Fixed Assets", nature: "ASSET", parent: "ASSET", balance: true, order: 5, schedule: "NON_CURRENT_ASSETS", cashFlow: "INVESTING" },
  { code: "CURRENT_ASSET", name: "Current Assets", nature: "ASSET", parent: "ASSET", balance: true, order: 10, schedule: "CURRENT_ASSETS", cashFlow: "OPERATING" },
  { code: "CASH_BANK", name: "Cash and Bank Balances", nature: "ASSET", parent: "CURRENT_ASSET", balance: true, order: 15, schedule: "CURRENT_ASSETS", cashFlow: "CASH_EQUIVALENT" },
  { code: "STOCK", name: "Stock-in-Trade", nature: "ASSET", parent: "CURRENT_ASSET", balance: true, order: 20, schedule: "CURRENT_ASSETS", cashFlow: "OPERATING" },
  { code: "RECEIVABLE", name: "Receivables", nature: "ASSET", parent: "CURRENT_ASSET", balance: true, order: 30, schedule: "CURRENT_ASSETS", cashFlow: "OPERATING" },
  // ---- Liabilities and capital -------------------------------------------
  { code: "LIABILITY", name: "Liabilities", nature: "LIABILITY", balance: true, order: 2, schedule: "CURRENT_LIABILITIES", cashFlow: "OPERATING" },
  { code: "LOAN_FUNDS", name: "Loan Funds", nature: "LIABILITY", parent: "LIABILITY", balance: true, order: 5, schedule: "NON_CURRENT_LIABILITIES", cashFlow: "FINANCING" },
  { code: "CURRENT_LIABILITY", name: "Current Liabilities", nature: "LIABILITY", parent: "LIABILITY", balance: true, order: 10, schedule: "CURRENT_LIABILITIES", cashFlow: "OPERATING" },
  { code: "EQUITY", name: "Capital", nature: "EQUITY", balance: true, order: 3, schedule: "SHAREHOLDERS_FUNDS", cashFlow: "FINANCING" },
  // ---- Income -------------------------------------------------------------
  { code: "INCOME", name: "Income", nature: "INCOME", balance: false, order: 4, schedule: "REVENUE_FROM_OPERATIONS", cashFlow: "OPERATING" },
  { code: "FUEL_SALES", name: "Fuel Sales", nature: "INCOME", parent: "INCOME", balance: false, order: 10, schedule: "REVENUE_FROM_OPERATIONS", cashFlow: "OPERATING" },
  { code: "OTHER_INCOME", name: "Other Income", nature: "INCOME", parent: "INCOME", balance: false, order: 20, schedule: "OTHER_INCOME", cashFlow: "OPERATING" },
  // ---- Expenses -----------------------------------------------------------
  { code: "EXPENSE", name: "Expenses", nature: "EXPENSE", balance: false, order: 5, schedule: "OTHER_EXPENSES", cashFlow: "OPERATING" },
  // Direct cost sits apart from operating expense so gross profit is real.
  // Only the cost of goods actually sold. Gross profit is revenue less this
  // and nothing else, so it can be checked against the stock ledger.
  { code: "DIRECT_COST", name: "Cost of Goods Sold", nature: "EXPENSE", parent: "EXPENSE", balance: false, order: 5, schedule: "COST_OF_MATERIALS", cashFlow: "OPERATING", directCost: true },
  // Stock that never reached a customer. A real cost, but not a cost of
  // sales — keeping it here stops it distorting margin per litre.
  { code: "STOCK_LOSS", name: "Stock and Transit Losses", nature: "EXPENSE", parent: "EXPENSE", balance: false, order: 8, schedule: "COST_OF_MATERIALS", cashFlow: "OPERATING" },
  { code: "OPERATING", name: "Operating Expenses", nature: "EXPENSE", parent: "EXPENSE", balance: false, order: 10, schedule: "OTHER_EXPENSES", cashFlow: "OPERATING" },
  { code: "EMPLOYEE_COST", name: "Employee Benefit Expense", nature: "EXPENSE", parent: "EXPENSE", balance: false, order: 20, schedule: "EMPLOYEE_BENEFITS", cashFlow: "OPERATING" },
  { code: "FINANCE_COST", name: "Finance Costs", nature: "EXPENSE", parent: "EXPENSE", balance: false, order: 30, schedule: "FINANCE_COSTS", cashFlow: "FINANCING" },
  { code: "DEPRECIATION", name: "Depreciation and Amortisation", nature: "EXPENSE", parent: "EXPENSE", balance: false, order: 40, schedule: "DEPRECIATION", cashFlow: "NONE" },
];

const accounts: { code: string; name: string; group: string; nature: AccountNature; normal: BalanceType; system?: string; bank?: boolean }[] = [
  // ---- Cash and bank ------------------------------------------------------
  { code: "CASH", name: "Cash in Hand", group: "CASH_BANK", nature: "ASSET", normal: "DEBIT", system: "CASH_IN_HAND" },
  { code: "BANK", name: "Bank - Current Account", group: "CASH_BANK", nature: "ASSET", normal: "DEBIT", system: "BANK_MAIN", bank: true },
  // ---- Current assets -----------------------------------------------------
  { code: "FUEL_STOCK", name: "Fuel and Lube Stock", group: "STOCK", nature: "ASSET", normal: "DEBIT", system: "STOCK_IN_TRADE" },
  { code: "DEBTORS", name: "Sundry Debtors", group: "RECEIVABLE", nature: "ASSET", normal: "DEBIT", system: "SUNDRY_DEBTORS" },
  { code: "CARD_REC", name: "Card and Wallet Receivable", group: "RECEIVABLE", nature: "ASSET", normal: "DEBIT", system: "CARD_RECEIVABLE" },
  { code: "SHORT_CREDIT", name: "Running Short Receivable", group: "RECEIVABLE", nature: "ASSET", normal: "DEBIT", system: "SHORT_CREDIT_RECEIVABLE" },
  { code: "TCS_REC", name: "TCS Receivable", group: "RECEIVABLE", nature: "ASSET", normal: "DEBIT", system: "TCS_RECEIVABLE" },
  // ---- Fixed assets -------------------------------------------------------
  { code: "PLANT", name: "Plant and Machinery", group: "FIXED_ASSET", nature: "ASSET", normal: "DEBIT", system: "FIXED_ASSET_PLANT" },
  // ---- Liabilities and capital -------------------------------------------
  { code: "CREDITORS", name: "Sundry Creditors", group: "CURRENT_LIABILITY", nature: "LIABILITY", normal: "CREDIT", system: "SUNDRY_CREDITORS" },
  { code: "GST_PAY", name: "GST Payable", group: "CURRENT_LIABILITY", nature: "LIABILITY", normal: "CREDIT", system: "GST_PAYABLE" },
  { code: "PAYROLL_PAY", name: "Payroll Deductions Payable", group: "CURRENT_LIABILITY", nature: "LIABILITY", normal: "CREDIT", system: "PAYROLL_DEDUCTIONS" },
  { code: "TERM_LOAN", name: "Term Loan", group: "LOAN_FUNDS", nature: "LIABILITY", normal: "CREDIT", system: "TERM_LOAN" },
  { code: "CAPITAL", name: "Capital Account", group: "EQUITY", nature: "EQUITY", normal: "CREDIT", system: "CAPITAL" },
  // ---- Income -------------------------------------------------------------
  { code: "SALES_MS", name: "Fuel Sales", group: "FUEL_SALES", nature: "INCOME", normal: "CREDIT", system: "SALES_MS" },
  { code: "LUBE_SALES", name: "Lube and Counter Sales", group: "INCOME", nature: "INCOME", normal: "CREDIT", system: "SALES_LUBE" },
  { code: "COMMISSION", name: "Commission Received", group: "OTHER_INCOME", nature: "INCOME", normal: "CREDIT", system: "COMMISSION_INCOME" },
  // ---- Direct costs -------------------------------------------------------
  { code: "COGS_FUEL", name: "Cost of Fuel Sold", group: "DIRECT_COST", nature: "EXPENSE", normal: "DEBIT", system: "COGS_FUEL" },
  { code: "COGS_LUBE", name: "Cost of Lubes and Counter Goods", group: "DIRECT_COST", nature: "EXPENSE", normal: "DEBIT", system: "COGS_LUBE" },
  { code: "TRANSIT_LOSS", name: "Tanker Receipt Loss", group: "STOCK_LOSS", nature: "EXPENSE", normal: "DEBIT", system: "TRANSIT_LOSS" },
  { code: "EVAP", name: "Evaporation and Stock Loss", group: "STOCK_LOSS", nature: "EXPENSE", normal: "DEBIT", system: "EVAPORATION_LOSS" },
  // ---- Operating expenses -------------------------------------------------
  { code: "SALARIES", name: "Salaries and Wages", group: "EMPLOYEE_COST", nature: "EXPENSE", normal: "DEBIT", system: "SALARY_EXPENSE" },
  { code: "OWN_USE", name: "Own Use and Staff Vehicle Issues", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT", system: "OWN_USE" },
  { code: "ELECTRICITY", name: "Electricity", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT" },
  { code: "SHORT_EXCESS", name: "Cash Short and Excess", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT", system: "CASH_EXCESS_SUSPENSE" },
  { code: "ROUND_OFF", name: "Round Off", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT", system: "ROUND_OFF" },
  { code: "BAD_DEBTS", name: "Bad Debts Written Off", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT", system: "BAD_DEBTS" },
  { code: "BANK_CHARGES", name: "Bank Charges", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT", system: "BANK_CHARGES" },
  { code: "SUNDRY_EXP", name: "Sundry Expenses", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT", system: "SUNDRY_EXPENSE" },
  { code: "RENT", name: "Rent", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT" },
  { code: "REPAIRS", name: "Repairs and Maintenance", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT" },
  { code: "LICENCE", name: "Licence and Statutory Fees", group: "OPERATING", nature: "EXPENSE", normal: "DEBIT" },
  { code: "INTEREST", name: "Interest on Loans", group: "FINANCE_COST", nature: "EXPENSE", normal: "DEBIT", system: "INTEREST_EXPENSE" },
  { code: "DEPN", name: "Depreciation", group: "DEPRECIATION", nature: "EXPENSE", normal: "DEBIT", system: "DEPRECIATION_EXPENSE" },
];

async function seedOutlet(outletId: string, code: string) {
  const productByCode = new Map<string, string>();
  for (const [productCode, name, productType, hsnCode, gstPct, isFuel, density] of products) {
    const product = await db.product.upsert({ where: { outletId_code: { outletId, code: productCode } }, create: { outletId, code: productCode, name, productType, type: productCode === "MERCH" ? "PIECE" : "LITRE", hsnCode, gstPct: d(gstPct), isFuel, isDensityTracked: density, reorderLevel: d(isFuel ? "500" : "20") }, update: { name, hsnCode, gstPct: d(gstPct), isFuel, isDensityTracked: density } }); productByCode.set(productCode, product.id);
  }
  const groupIds = new Map<string, string>();
  for (const group of accountGroups) { const parentId = group.parent ? groupIds.get(group.parent) : undefined; const saved = await db.accountGroup.upsert({ where: { outletId_code: { outletId, code: group.code } }, create: { outletId, code: group.code, name: group.name, nature: group.nature, parentId, isBalanceSheet: group.balance, isSystem: true, sortOrder: group.order, scheduleIIIHead: group.schedule ?? "NONE", cashFlowCategory: group.cashFlow ?? "OPERATING", isDirectCost: Boolean(group.directCost) }, update: { name: group.name, nature: group.nature, parentId, isBalanceSheet: group.balance, sortOrder: group.order, isActive: true, scheduleIIIHead: group.schedule ?? "NONE", cashFlowCategory: group.cashFlow ?? "OPERATING", isDirectCost: Boolean(group.directCost) } }); groupIds.set(group.code, saved.id); }
  const accountIds = new Map<string, string>();
  for (const account of accounts) { const saved = await db.account.upsert({ where: { outletId_code: { outletId, code: account.code } }, create: { outletId, code: account.code, name: account.name, groupId: groupIds.get(account.group)!, nature: account.nature, normalBalance: account.normal, openingBalance: d("0"), openingBalanceType: account.normal, systemKey: account.system, isBankAccount: Boolean(account.bank), bankName: account.bank ? "State Bank of India" : undefined, isSystem: true }, update: { name: account.name, groupId: groupIds.get(account.group)!, isActive: true } }); accountIds.set(account.code, saved.id); }
  for (const [code, name, type, accountCode] of [["CASH", "Cash", "CASH", "CASH"], ["CREDIT", "Credit", "CREDIT", "DEBTORS"], ["CARD-HDFC", "Card – HDFC", "CARD", "BANK"], ["UPI", "UPI", "UPI", "BANK"], ["PAYTM", "Paytm", "WALLET", "BANK"], ["PHONEPE", "PhonePe", "UPI", "BANK"], ["GPAY", "Google Pay", "UPI", "BANK"], ["MOBIKWIK", "Mobikwik", "WALLET", "BANK"], ["XTRAPOWER", "XTRAPOWER Fleet", "FLEET_CARD", "DEBTORS"], ["SMARTFLEET", "SmartFleet", "FLEET_CARD", "DEBTORS"], ["DRIVETRACK", "DriveTrack", "FLEET_CARD", "DEBTORS"], ["OWN_USE", "Own Use", "OTHER", "DEBTORS"], ["GOVT_COUPON", "Government Coupons", "OTHER", "DEBTORS"]] as const) await db.paymentMode.upsert({ where: { outletId_code: { outletId, code } }, create: { outletId, code, name, type: type as PaymentModeType, accountId: accountIds.get(accountCode), settlementDays: 0, requiresReference: type !== "CASH" }, update: { name, isActive: true } });
  for (const [code, name, accountCode] of [["SAL", "Salaries", "SALARIES"], ["ELEC", "Electricity", "ELECTRICITY"], ["RENT", "Rent", "RENT"], ["REPAIR", "Repairs", "REPAIRS"], ["BANK", "Bank Charges", "BANK_CHARGES"], ["LIC", "Licence Fees", "LICENCE"], ["EVAP", "Evaporation Loss", "EVAP"]] as const) await db.expenseHead.upsert({ where: { outletId_code: { outletId, code } }, create: { outletId, code, name, accountId: accountIds.get(accountCode) }, update: { name, accountId: accountIds.get(accountCode), isActive: true } });
  for (const [productCode, rate, purchaseRate] of [["MS", "102.93", "100.1500"], ["HSD", "94.24", "91.8000"], ["XP95", "109.85", "106.1000"], ["PD", "98.30", "95.2000"], ["CNG", "90.50", "86.0000"], ["LUBE-5W30", "720.00", "525.0000"], ["2T", "185.00", "132.0000"], ["ADBLUE", "72.00", "49.5000"], ["COOLANT", "310.00", "218.0000"], ["MERCH", "199.00", "120.0000"]] as const) await db.priceHistory.upsert({ where: { outletId_productId_effectiveFrom: { outletId, productId: productByCode.get(productCode)!, effectiveFrom: new Date("2025-01-01T00:30:00.000Z") } }, create: { outletId, productId: productByCode.get(productCode)!, rate: d(rate), purchaseRate: d(purchaseRate), effectiveFrom: new Date("2025-01-01T00:30:00.000Z"), effectiveDate: new Date("2025-01-01T00:00:00.000Z"), reason: "Opening seeded price" }, update: { rate: d(rate), purchaseRate: d(purchaseRate), isActive: true } });
  if (code !== "MAIN") return;
  const tankDefs = [["T1", "MS Tank 1", "MS", "30000", "500"], ["T2", "MS Tank 2", "MS", "30000", "500"], ["T3", "HSD Tank 1", "HSD", "40000", "600"], ["T4", "HSD Tank 2", "HSD", "40000", "600"]] as const;
  const tankIds = new Map<string, string>();
  for (const [tankCode, name, productCode, capacity, deadStock] of tankDefs) { const tank = await db.tank.upsert({ where: { outletId_code: { outletId, code: tankCode } }, create: { outletId, code: tankCode, name, productId: productByCode.get(productCode)!, capacity: d(capacity), deadStock: d(deadStock), calibrationAgency: "Indian Oil Calibration Services" }, update: { name, productId: productByCode.get(productCode)!, capacity: d(capacity), deadStock: d(deadStock), status: "ACTIVE" } }); tankIds.set(tankCode, tank.id); for (const [dip, litres] of [["0", "0"], ["100", "2500"], ["200", "5100"], ["300", "7700"], ["400", "10300"], ["500", "13000"], ["600", "15800"], ["700", "18700"], ["800", "21700"], ["900", "24800"], ["1000", capacity]] as const) { await db.tankCalibration.upsert({ where: { tankId_chartType_dipMm: { tankId: tank.id, chartType: "FUEL", dipMm: d(dip) } }, create: { tankId: tank.id, chartType: "FUEL", dipMm: d(dip), litres: d(litres) }, update: { litres: d(litres), isActive: true } }); await db.tankCalibration.upsert({ where: { tankId_chartType_dipMm: { tankId: tank.id, chartType: "WATER", dipMm: d(dip) } }, create: { tankId: tank.id, chartType: "WATER", dipMm: d(dip), litres: d(litres) }, update: { litres: d(litres), isActive: true } }); } }
  const duIds = new Map<string, string>(); for (const codeValue of ["DU1", "DU2", "DU3"]) { const du = await db.dispensingUnit.upsert({ where: { outletId_code: { outletId, code: codeValue } }, create: { outletId, code: codeValue, name: `Dispensing Unit ${codeValue.slice(-1)}`, make: "Gilbarco", model: "SK700-II" }, update: { status: "ACTIVE" } }); duIds.set(codeValue, du.id); }
  for (const [nozzleCode, duCode, tankCode, productCode, reading] of [["N1", "DU1", "T1", "MS", "125000.00"], ["N2", "DU1", "T3", "HSD", "186000.00"], ["N3", "DU2", "T2", "MS", "98000.00"], ["N4", "DU2", "T4", "HSD", "154000.00"], ["N5", "DU3", "T1", "MS", "76000.00"], ["N6", "DU3", "T3", "HSD", "133000.00"]] as const) await db.nozzle.upsert({ where: { outletId_code: { outletId, code: nozzleCode } }, create: { outletId, code: nozzleCode, name: `Nozzle ${nozzleCode.slice(1)}`, dispensingUnitId: duIds.get(duCode)!, tankId: tankIds.get(tankCode)!, productId: productByCode.get(productCode)!, initialReading: d(reading), currentReading: d(reading), meterDigits: 8 }, update: { status: "ACTIVE", currentReading: d(reading) } });
  for (const [codeValue, name, startTime, endTime, sequence] of [["SHIFT_1", "Morning", "06:00", "14:00", 1], ["SHIFT_2", "Evening", "14:00", "22:00", 2], ["SHIFT_3", "Night", "22:00", "06:00", 3]] as const) await db.shift.upsert({ where: { outletId_code: { outletId, code: codeValue } }, create: { outletId, code: codeValue, name, startTime, endTime, sequence }, update: { name, startTime, endTime, sequence, isActive: true } });
  const customerNames = ["Aadhavan Transports", "Anbu Cabs", "Arul Constructions", "Bharathi Logistics", "Chennai City Services", "Dhanalakshmi Travels", "Eagle Earth Movers", "Evergreen Farms", "Galaxy Freight", "Greenline Travels", "Jai Maruthi Transport", "Kaveri Agencies", "Lakshmi Transport", "Mahalakshmi Schools", "Metro Cabs", "Nandhini Traders", "Om Sakthi Lorry Service", "Ponnusamy Farms", "Quality Roadlines", "Raja Blue Metals", "Sree Balaji Builders", "Tamil Nadu Dairy", "United Carriers", "Vasanth Fleet", "Vijay Enterprises"];
  for (const [index, name] of customerNames.entries()) {
    const sequence = String(index + 1).padStart(3, "0"); const mobile = `900000${String(index).padStart(4, "0")}`; const pan = `AABCP${String(1000 + index).slice(-4)}A`; const gstin = index % 3 === 0 ? `33${pan}1Z5` : undefined; const email = `accounts${index + 1}@example.invalid`;
    const customer = await db.customer.upsert({ where: { outletId_code: { outletId, code: `CR${sequence}` } }, create: { outletId, code: `CR${sequence}`, name, type: "CREDIT", gstin, pan, addressLine1: `${18 + index}, Industrial Estate`, city: "Chennai", state: "Tamil Nadu", pincode: `600${String(20 + index).padStart(3, "0")}`, phone: mobile, email, contactPerson: `Accounts ${sequence}`, creditLimit: d(String(50000 + index % 5 * 25000)), creditDays: index % 4 === 0 ? 30 : 15, openingBalance: d("0"), discountPerLitre: d(index % 5 === 0 ? "0.50" : "0"), statementEmail: email, statementMobile: mobile }, update: { name, gstin, pan, addressLine1: `${18 + index}, Industrial Estate`, city: "Chennai", state: "Tamil Nadu", pincode: `600${String(20 + index).padStart(3, "0")}`, phone: mobile, email, statementEmail: email, statementMobile: mobile, isActive: true } });
    const vehicleNo = `TN 01 ${String.fromCharCode(65 + (index % 26))}${String.fromCharCode(65 + ((index + 3) % 26))} ${String(1001 + index)}`;
    await db.customerVehicle.upsert({ where: { customerId_vehicleNo: { customerId: customer.id, vehicleNo } }, create: { customerId: customer.id, vehicleNo, driverName: `Driver ${sequence}`, allowedProductCodes: [index % 2 ? "HSD" : "MS"], monthlyLimit: d("5000") }, update: { isActive: true } });
  }
  for (const [codeValue, name, designation] of [["EMP001", "K. Murugan", "Manager"], ["EMP002", "S. Selvi", "Cashier"], ["EMP003", "R. Kumar", "Salesman"], ["EMP004", "P. Rajesh", "Salesman"], ["EMP005", "M. Kala", "Accountant"], ["EMP006", "A. Prakash", "Technician"]] as const) await db.employee.upsert({ where: { outletId_code: { outletId, code: codeValue } }, create: { outletId, code: codeValue, name, designation, phone: `98888${codeValue.slice(-5)}`, joinedOn: new Date("2024-04-01T00:00:00.000Z"), bankName: "State Bank of India", accountNumber: `1000${codeValue.slice(-4)}`, ifsc: "SBIN0000001" }, update: { name, designation, status: "ACTIVE" } });
  for (const [codeValue, name, type] of [["IOCL", "Indian Oil Corporation Limited", "OMC"], ["BPCL", "Bharat Petroleum Corporation Limited", "OMC"], ["HPCL", "Hindustan Petroleum Corporation Limited", "OMC"], ["CASTROL", "Castrol India Limited", "LUBE"], ["SERVO", "Servo Lubricants", "LUBE"]] as const) await db.supplier.upsert({ where: { outletId_code: { outletId, code: codeValue } }, create: { outletId, code: codeValue, name, type: type as SupplierType, creditDays: 15 }, update: { name, type: type as SupplierType, isActive: true } });
}

async function main() {
  const firm = await db.firm.findFirst({ where: { name: "Fuel Retailers" } }) ?? await db.firm.create({ data: { name: "Fuel Retailers", legalName: "Fuel Retailers Private Limited", addressLine1: "GST Road", city: "Chennai", state: "Tamil Nadu", stateCode: "33", pincode: "600001", gstin: "33AABCP1234A1Z5", pan: "AABCP1234A", bankName: "State Bank of India", bankAccountName: "Fuel Retailers Pvt Ltd", bankAccountNumber: "12345678901", bankIfsc: "SBIN0000001", invoiceTerms: "Payment due as per agreed credit terms.", declarationText: "We declare that this invoice shows the actual price of the goods described." } });
  for (const [documentType, prefix] of [["BILL", "BIL-"], ["BILL_CASH", "CSH-"], ["BILL_CREDIT", "CRD-"], ["BILL_COUNTER", "CTR-"], ["BILL_CONSOLIDATED", "CON-"], ["BILL_MOBILE", "MOB-"], ["CREDIT_NOTE", "CN-"], ["RUNNING_SHORT", "RS-"], ["CREDIT_SLIP", "CSL-"], ["RECEIPT", "REC-"], ["PURCHASE", "PUR-"], ["VOUCHER", "VCH-"]] as const) await db.firmDocumentSeries.upsert({ where: { firmId_documentType: { firmId: firm.id, documentType } }, create: { firmId: firm.id, documentType, prefix, padding: 5 }, update: { prefix, isActive: true } });
  const mainOutlet = await db.outlet.upsert({ where: { code: "MAIN" }, create: { firmId: firm.id, code: "MAIN", name: "Fuel Centre – GST Road", legalName: firm.legalName, omc: "IOCL", dealerCode: "TN-IOCL-0412", addressLine1: "GST Road", city: "Chennai", state: "Tamil Nadu", pincode: "600001", gstin: firm.gstin }, update: { firmId: firm.id, isActive: true } });
  const northOutlet = await db.outlet.upsert({ where: { code: "NORTH" }, create: { firmId: firm.id, code: "NORTH", name: "Fuel Centre – North", legalName: firm.legalName, omc: "IOCL", dealerCode: "TN-IOCL-0519", addressLine1: "Poonamallee High Road", city: "Chennai", state: "Tamil Nadu", pincode: "600102", gstin: firm.gstin }, update: { firmId: firm.id, isActive: true } });
  for (const roleCode of Object.values(RoleCode)) { const role = await db.role.upsert({ where: { code: roleCode }, create: { code: roleCode, name: roleCode, isReadOnly: roleCode === "AUDITOR" }, update: { isReadOnly: roleCode === "AUDITOR" } }); for (const module of Object.values(ModuleName)) { const salesmanView = ["DASHBOARD","PUMP_OPERATIONS","BILLING","CUSTOMERS","INVENTORY"].includes(module); const accountantView = ["DASHBOARD","BILLING","CUSTOMERS","ACCOUNTS","INVENTORY","PURCHASES","PAYROLL","REPORTS"].includes(module); const canView = roleCode === "OWNER" || roleCode === "MANAGER" || roleCode === "AUDITOR" || (roleCode === "SALESMAN" && salesmanView) || (roleCode === "ACCOUNTANT" && accountantView); const canOperate = roleCode === "OWNER" || roleCode === "MANAGER" || (roleCode === "ACCOUNTANT" && ["BILLING","CUSTOMERS","ACCOUNTS","PURCHASES","PAYROLL"].includes(module)) || (roleCode === "SALESMAN" && ["PUMP_OPERATIONS","BILLING"].includes(module)); const values = { canView, canAdd: canOperate, canModify: canOperate, canDelete: roleCode === "OWNER", canApprove: roleCode === "OWNER" || (roleCode === "MANAGER" && module !== "USER_CONTROL") }; await db.permission.upsert({ where: { roleId_module: { roleId: role.id, module } }, create: { roleId: role.id, module, ...values }, update: values }); } }
  const ownerRole = await db.role.findUniqueOrThrow({ where: { code: "OWNER" } }); const passwordHash = await bcrypt.hash("ChangeMe123!", 12); const owner = await db.user.upsert({ where: { username: "owner" }, create: { username: "owner", name: "Owner", passwordHash, roleId: ownerRole.id, defaultOutletId: mainOutlet.id, mustChangePassword: true }, update: { roleId: ownerRole.id, defaultOutletId: mainOutlet.id, status: "ACTIVE" } }); for (const outletId of [mainOutlet.id, northOutlet.id]) await db.userOutlet.upsert({ where: { userId_outletId: { userId: owner.id, outletId } }, create: { userId: owner.id, outletId }, update: {} });
  await seedOutlet(mainOutlet.id, "MAIN"); await seedOutlet(northOutlet.id, "NORTH");
  const salesmanRole = await db.role.findUniqueOrThrow({ where: { code: "SALESMAN" } }); const salesman = await db.user.upsert({ where: { username: "salesman" }, create: { username: "salesman", name: "R. Kumar", passwordHash, roleId: salesmanRole.id, defaultOutletId: mainOutlet.id, lockFromDate: businessDateToday(), lockToDate: businessDateToday(), mustChangePassword: true }, update: { roleId: salesmanRole.id, defaultOutletId: mainOutlet.id, lockFromDate: businessDateToday(), lockToDate: businessDateToday(), status: "ACTIVE" } }); await db.userOutlet.upsert({ where: { userId_outletId: { userId: salesman.id, outletId: mainOutlet.id } }, create: { userId: salesman.id, outletId: mainOutlet.id }, update: {} }); await db.employee.update({ where: { outletId_code: { outletId: mainOutlet.id, code: "EMP003" } }, data: { userId: salesman.id } });
  // Every statutory rate and threshold, written with its labelled default.
  await ensureSettingsSeeded(mainOutlet.id); await ensureSettingsSeeded(northOutlet.id);
  // Ninety days of operating history, with two deliberate anomalies.
  await seedHistory(db, mainOutlet.id);
  await seedBillingHistory(db, mainOutlet.id);
  await seedPhase6(db, mainOutlet.id, owner.id);
  // Turn the operational history into journal lines. Runs last so every
  // source document already exists.
  await seedPostings(db, mainOutlet.id);
}

main().then(() => db.$disconnect()).catch(async (error: unknown) => { console.error(error); await db.$disconnect(); process.exit(1); });
