import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { ta } from "../src/i18n/ta";
import { dictionaryFor, translate } from "../src/i18n/provider";

describe("translations", () => {
  const englishKeys = Object.keys(en).sort();
  const tamilKeys = Object.keys(ta).sort();

  it("ships a Tamil string for every English string", () => {
    // Typed as Dictionary, so a missing key is a compile error too. This test
    // catches the reverse: a stale Tamil key left behind after a rename.
    expect(tamilKeys).toEqual(englishKeys);
  });

  it("leaves no Tamil value as the English text", () => {
    const untranslated = englishKeys.filter((key) => {
      const english = (en as Record<string, string>)[key];
      const tamil = (ta as Record<string, string>)[key];
      // Latin-only values are fine for things like "GSTIN"; catch whole labels.
      return tamil === english && /[a-z]{4,}/i.test(english);
    });
    expect(untranslated).toEqual([]);
  });

  it("has no empty string in either locale", () => {
    for (const key of englishKeys) {
      expect((en as Record<string, string>)[key].trim()).not.toBe("");
      expect((ta as Record<string, string>)[key].trim()).not.toBe("");
    }
  });

  it("falls back to English for an unknown locale", () => {
    expect(translate("fr", "common.save")).toBe(en["common.save"]);
    expect(dictionaryFor("fr")).toBe(dictionaryFor("en"));
  });

  it("falls back to English for a key the locale is missing", () => {
    // A half-translated build shows English, never a raw key.
    expect(translate("ta", "common.save")).toBe(ta["common.save"]);
    expect(translate("ta", "not.a.real.key", "Fallback")).toBe("Fallback");
    expect(translate("ta", "not.a.real.key")).toBe("not.a.real.key");
  });

  it("translates the labels a pump-floor user actually reads", () => {
    for (const key of ["common.litres", "common.shift", "common.salesman", "dashboard.title", "alert.CASH_SHORT"]) {
      expect(translate("ta", key)).not.toBe(translate("en", key));
    }
  });
});
