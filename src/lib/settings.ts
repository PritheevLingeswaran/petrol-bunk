/**
 * Every statutory rate and operational threshold with a labelled default.
 * Nothing in business logic may hard-code one of these values — changing a
 * rate must never require a deployment (CLAUDE.md § 2.5).
 *
 * This file holds the catalogue and the pure resolution logic; the database
 * reader lives in `src/server/settings.ts` so it stays importable from tests.
 */
import { Decimal, decimal } from "@/lib/money";

export type SettingGroup = "org" | "stock" | "quality" | "cash" | "credit" | "tax" | "security" | "reminder" | "billing" | "notification";
export type SettingValueType = "STRING" | "NUMBER" | "DECIMAL" | "BOOLEAN" | "JSON" | "DATE";

export type SettingDefinition = {
  key: string;
  label: string;
  defaultValue: string;
  valueType: SettingValueType;
  group: SettingGroup;
  unit?: string;
  description?: string;
  /** Flagged so a compliance review can list every statutory rate at once. */
  isStatutory?: boolean;
};

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  { key: "org.financialYearStartMonth", label: "Financial year starts in month", defaultValue: "4", valueType: "NUMBER", group: "org", description: "April" },
  { key: "org.timezone", label: "Display timezone", defaultValue: "Asia/Kolkata", valueType: "STRING", group: "org", description: "Storage is always UTC" },
  { key: "org.locale", label: "Default language", defaultValue: "en", valueType: "STRING", group: "org" },

  { key: "stock.allowancePct.MS", label: "Permissible variation — MS (Petrol)", defaultValue: "0.75", valueType: "DECIMAL", group: "stock", unit: "% of sales", isStatutory: true, description: "Verify against the current OMC circular" },
  { key: "stock.allowancePct.HSD", label: "Permissible variation — HSD (Diesel)", defaultValue: "0.50", valueType: "DECIMAL", group: "stock", unit: "% of sales", isStatutory: true, description: "Verify against the current OMC circular" },
  { key: "stock.allowancePct.PREMIUM", label: "Permissible variation — premium fuels", defaultValue: "0.75", valueType: "DECIMAL", group: "stock", unit: "% of sales", isStatutory: true },
  { key: "stock.allowancePct.LUBE", label: "Permissible variation — lubricants", defaultValue: "0.00", valueType: "DECIMAL", group: "stock", unit: "% of sales" },
  { key: "stock.transitLossPct", label: "Permissible receipt (transit) loss", defaultValue: "0.20", valueType: "DECIMAL", group: "stock", unit: "% of invoice qty", isStatutory: true },
  { key: "stock.reorderDaysCover", label: "Reorder alert at days of cover", defaultValue: "2", valueType: "NUMBER", group: "stock", unit: "days" },
  { key: "stock.waterDipAlertMm", label: "Water dip alert threshold", defaultValue: "25", valueType: "DECIMAL", group: "stock", unit: "mm", description: "Water above this raises a dashboard alert" },
  { key: "stock.saleSpikeMultiple", label: "Nozzle sale spike warning at", defaultValue: "3", valueType: "DECIMAL", group: "stock", unit: "x 30-day average" },
  { key: "stock.costingMethod", label: "Inventory profit costing method", defaultValue: "WEIGHTED_AVERAGE", valueType: "STRING", group: "stock", description: "WEIGHTED_AVERAGE is the operational default; FIFO is available for comparison" },

  { key: "quality.densityToleranceKgM3", label: "Density band vs invoice density", defaultValue: "3.0", valueType: "DECIMAL", group: "quality", unit: "± kg/m³ at 15 °C", isStatutory: true },
  { key: "quality.densityTempCoefficient", label: "Density temperature coefficient", defaultValue: "0.65", valueType: "DECIMAL", group: "quality", unit: "kg/m³ per °C", description: "Calibrate against your OMC conversion table" },
  { key: "quality.vcfLinearCoefficient", label: "Volume correction coefficient", defaultValue: "0.00105", valueType: "DECIMAL", group: "quality", unit: "per °C", description: "Linear approximation of ASTM 54B until the full table is loaded" },
  { key: "quality.sampleRetentionDays", label: "Retain fuel samples for", defaultValue: "30", valueType: "NUMBER", group: "quality", unit: "days", isStatutory: true },

  { key: "cash.shortExcessToleranceAmount", label: "Short / excess tolerance", defaultValue: "20.00", valueType: "DECIMAL", group: "cash", unit: "₹", description: "Below this no recovery voucher is raised" },
  { key: "cash.denominations", label: "Cash counting denominations", defaultValue: "[500,200,100,50,20,10,5,2,1]", valueType: "JSON", group: "cash" },

  { key: "credit.ageingBuckets", label: "Credit ageing buckets", defaultValue: "[15,30,60,90]", valueType: "JSON", group: "credit", unit: "days" },
  { key: "credit.blockOnLimitBreach", label: "Block credit beyond the limit", defaultValue: "true", valueType: "BOOLEAN", group: "credit", description: "A manager may still override, and the override is audited" },
  { key: "credit.blockOnOverdue", label: "Block credit when overdue bills exist", defaultValue: "false", valueType: "BOOLEAN", group: "credit", description: "When disabled the billing screen warns but permits the bill" },

  { key: "billing.defaultPrintLayout", label: "Default invoice print layout", defaultValue: "A5", valueType: "STRING", group: "billing" },
  { key: "billing.autoRoundOff", label: "Round invoice totals to the nearest rupee", defaultValue: "true", valueType: "BOOLEAN", group: "billing" },

  { key: "notification.sms.provider", label: "SMS provider", defaultValue: "CONSOLE", valueType: "STRING", group: "notification", description: "CONSOLE works without credentials; GENERIC_JSON posts to the configured endpoint" },
  { key: "notification.sms.endpoint", label: "SMS API endpoint", defaultValue: "", valueType: "STRING", group: "notification" },
  { key: "notification.sms.apiKey", label: "SMS API key", defaultValue: "", valueType: "STRING", group: "notification" },
  { key: "notification.sms.sender", label: "SMS sender ID", defaultValue: "FUELBUNK", valueType: "STRING", group: "notification" },
  { key: "notification.email.provider", label: "Email provider", defaultValue: "CONSOLE", valueType: "STRING", group: "notification", description: "CONSOLE works without credentials; GENERIC_JSON posts to the configured endpoint" },
  { key: "notification.email.endpoint", label: "Email API endpoint", defaultValue: "", valueType: "STRING", group: "notification" },
  { key: "notification.email.apiKey", label: "Email API key", defaultValue: "", valueType: "STRING", group: "notification" },
  { key: "notification.email.from", label: "Invoice email sender", defaultValue: "billing@example.invalid", valueType: "STRING", group: "notification" },

  { key: "tax.fuelRegime", label: "Fuel tax regime", defaultValue: "VAT_INCLUSIVE", valueType: "STRING", group: "tax", isStatutory: true, description: "MS and HSD are outside GST" },
  { key: "tax.gstPct.lubricant", label: "GST on lubricants", defaultValue: "18.00", valueType: "DECIMAL", group: "tax", unit: "%", isStatutory: true },
  { key: "tax.tcsPct", label: "TCS u/s 206C(1H)", defaultValue: "0.10", valueType: "DECIMAL", group: "tax", unit: "%", isStatutory: true },
  { key: "tax.tcsThreshold", label: "TCS threshold per buyer", defaultValue: "5000000.00", valueType: "DECIMAL", group: "tax", unit: "₹", isStatutory: true },
  { key: "tax.tdsPct.commission", label: "TDS on commission", defaultValue: "5.00", valueType: "DECIMAL", group: "tax", unit: "%", isStatutory: true },

  { key: "reminder.defaultAlertBeforeDays", label: "Alert this many days before due", defaultValue: "30", valueType: "NUMBER", group: "reminder", unit: "days" },
  { key: "reminder.stickerSheetRows", label: "Sample sticker rows per A4 sheet", defaultValue: "5", valueType: "NUMBER", group: "reminder" },
  { key: "reminder.stickerSheetColumns", label: "Sample sticker columns per A4 sheet", defaultValue: "2", valueType: "NUMBER", group: "reminder" },

  { key: "security.sessionIdleMinutes", label: "Sign out after idle", defaultValue: "60", valueType: "NUMBER", group: "security", unit: "minutes" },
  { key: "security.maxFailedLogins", label: "Lock account after failed logins", defaultValue: "5", valueType: "NUMBER", group: "security" },
  { key: "security.lockoutMinutes", label: "Account lockout duration", defaultValue: "15", valueType: "NUMBER", group: "security", unit: "minutes" },
];

const DEFINITION_BY_KEY = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));

export const settingDefinition = (key: string): SettingDefinition => {
  const definition = DEFINITION_BY_KEY.get(key);
  if (!definition) throw new Error(`Unknown setting "${key}". Add it to SETTING_DEFINITIONS before using it.`);
  return definition;
};

export const settingDefault = (key: string): string => settingDefinition(key).defaultValue;

/** Resolves an overridden value against the shipped default. */
export const resolveSetting = (key: string, override?: string | null): string => override ?? settingDefault(key);

export const asDecimal = (key: string, override?: string | null): Decimal => decimal(resolveSetting(key, override));
export const asNumber = (key: string, override?: string | null): number => Number(resolveSetting(key, override));
export const asBoolean = (key: string, override?: string | null): boolean => resolveSetting(key, override) === "true";
export const asJson = <T>(key: string, override?: string | null): T => JSON.parse(resolveSetting(key, override)) as T;

/** Permissible-variation key for a product type, so nothing is hard-coded per product. */
export function allowanceKeyForProductType(productType: string): string {
  switch (productType) {
    case "FUEL_MS": return "stock.allowancePct.MS";
    case "FUEL_HSD": return "stock.allowancePct.HSD";
    case "FUEL_PREMIUM_MS":
    case "FUEL_PREMIUM_HSD": return "stock.allowancePct.PREMIUM";
    default: return "stock.allowancePct.LUBE";
  }
}
