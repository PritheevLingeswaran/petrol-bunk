"use client";

import { useState, useTransition } from "react";
import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { setLocale, setTheme, type LocaleChoice, type ThemeChoice } from "@/server/preferences/actions";
import { LOCALES } from "@/i18n/provider";
import { useT } from "@/i18n/provider";

const THEMES: { value: ThemeChoice; icon: typeof Sun; key: string }[] = [
  { value: "LIGHT", icon: Sun, key: "shell.themeLight" },
  { value: "DARK", icon: Moon, key: "shell.themeDark" },
  { value: "SYSTEM", icon: Monitor, key: "shell.themeSystem" },
];

/**
 * Appearance and language switcher.
 *
 * The attribute on <html> is flipped immediately so the change is instant,
 * then persisted to the user row — waiting for the round trip would make the
 * toggle feel broken.
 */
export function Preferences({ theme, locale }: { theme: ThemeChoice; locale: LocaleChoice }) {
  const t = useT();
  const [current, setCurrent] = useState(theme);
  const [language, setLanguage] = useState(locale);
  const [pending, startTransition] = useTransition();

  const applyTheme = (next: ThemeChoice) => {
    setCurrent(next);
    const root = document.documentElement;
    if (next === "SYSTEM") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next === "LIGHT" ? "light" : "dark");
    startTransition(() => {
      void setTheme(next);
    });
  };

  const applyLocale = (next: LocaleChoice) => {
    setLanguage(next);
    document.documentElement.lang = next;
    startTransition(() => {
      void setLocale(next);
    });
  };

  return (
    <div className="prefs" data-pending={pending ? "1" : undefined}>
      <div className="theme-toggle" role="group" aria-label={t("shell.theme")}>
        {THEMES.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              className={current === option.value ? "active" : ""}
              aria-pressed={current === option.value}
              title={t(option.key)}
              onClick={() => applyTheme(option.value)}
            >
              <Icon size={14} />
              <span className="sr-only">{t(option.key)}</span>
            </button>
          );
        })}
      </div>
      <label className="locale-select">
        <Languages size={14} />
        <span className="sr-only">{t("shell.language")}</span>
        <select value={language} onChange={(event) => applyLocale(event.target.value as LocaleChoice)}>
          {LOCALES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
