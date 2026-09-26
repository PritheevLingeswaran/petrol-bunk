"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { en, type TranslationKey } from "@/i18n/en";
import { ta } from "@/i18n/ta";

export type Locale = "en" | "ta";
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ta", label: "தமிழ்" },
];

const DICTIONARIES = { en, ta } as const;

export const dictionaryFor = (locale: string): Record<string, string> =>
  (DICTIONARIES[locale as Locale] ?? en) as Record<string, string>;

/**
 * A missing key falls back to English and then to the supplied default, so a
 * half-translated build shows the English label rather than a raw key.
 */
export function translate(locale: string, key: string, fallback?: string): string {
  const dictionary = dictionaryFor(locale);
  return dictionary[key] ?? (en as Record<string, string>)[key] ?? fallback ?? key;
}

type Translator = (key: TranslationKey | string, fallback?: string) => string;

const LocaleContext = createContext<{ locale: Locale; t: Translator }>({
  locale: "en",
  t: (key, fallback) => translate("en", key, fallback),
});

export function I18nProvider({ locale, children }: { locale: string; children: ReactNode }) {
  const resolved: Locale = locale === "ta" ? "ta" : "en";
  const t = useCallback<Translator>((key, fallback) => translate(resolved, key, fallback), [resolved]);
  const value = useMemo(() => ({ locale: resolved, t }), [resolved, t]);

  // The root layout sets <html lang> from the cookie so the first paint is
  // right; the dictionary comes from the user row, which is the source of
  // truth. If the two ever disagree — a stale cookie, a second device — the
  // document language follows the dictionary rather than lying about it.
  useEffect(() => {
    if (document.documentElement.lang !== resolved) document.documentElement.lang = resolved;
  }, [resolved]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useT = (): Translator => useContext(LocaleContext).t;
export const useLocale = (): Locale => useContext(LocaleContext).locale;
