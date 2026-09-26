import { Prisma } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { SETTING_DEFINITIONS, allowanceKeyForProductType, resolveSetting, settingDefinition } from "@/lib/settings";
import { db } from "@/server/db";

export type SettingReader = {
  raw: (key: string) => string;
  decimal: (key: string) => Decimal;
  number: (key: string) => number;
  boolean: (key: string) => boolean;
  json: <T>(key: string) => T;
  allowancePctFor: (productType: string) => Decimal;
};

/**
 * Loads an outlet's overrides once and resolves every lookup against the
 * shipped default. Call this once per action and pass the reader down — a
 * formula must never reach for the database mid-calculation.
 */
export async function loadSettings(outletId: string, client: Prisma.TransactionClient | typeof db = db): Promise<SettingReader> {
  const rows = await client.setting.findMany({ where: { OR: [{ outletId }, { outletId: null }] } });
  // An outlet row wins over the global row of the same key.
  const overrides = new Map<string, string>();
  for (const row of rows.filter((row) => row.outletId === null)) overrides.set(row.key, row.value);
  for (const row of rows.filter((row) => row.outletId !== null)) overrides.set(row.key, row.value);

  const raw = (key: string) => resolveSetting(key, overrides.get(key));
  return {
    raw,
    decimal: (key) => new Decimal(raw(key)),
    number: (key) => Number(raw(key)),
    boolean: (key) => raw(key) === "true",
    json: <T,>(key: string) => JSON.parse(raw(key)) as T,
    allowancePctFor: (productType) => new Decimal(raw(allowanceKeyForProductType(productType))),
  };
}

/** Writes any missing setting row with its labelled default. Idempotent. */
export async function ensureSettingsSeeded(outletId: string, client: Prisma.TransactionClient | typeof db = db): Promise<void> {
  for (const definition of SETTING_DEFINITIONS) {
    await client.setting.upsert({
      where: { outletId_key: { outletId, key: definition.key } },
      create: {
        outletId,
        key: definition.key,
        value: definition.defaultValue,
        defaultValue: definition.defaultValue,
        valueType: definition.valueType,
        label: definition.label,
        description: definition.description,
        group: definition.group,
        unit: definition.unit,
        isStatutory: Boolean(definition.isStatutory),
      },
      // Never overwrite a value the outlet has deliberately changed; only keep
      // the labelling and the recorded default in step with the catalogue.
      update: {
        defaultValue: definition.defaultValue,
        label: definition.label,
        description: definition.description,
        group: definition.group,
        unit: definition.unit,
        isStatutory: Boolean(definition.isStatutory),
      },
    });
  }
}

export { settingDefinition, allowanceKeyForProductType };
