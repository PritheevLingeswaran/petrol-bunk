"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { requireSession } from "@/server/guard";

export type ThemeChoice = "SYSTEM" | "LIGHT" | "DARK";
export type LocaleChoice = "en" | "ta";

/**
 * Appearance and language are per user, stored on the user row so they follow
 * the person to any device (PROJECT_SPEC § 8). A cookie mirrors the choice
 * only so the very first paint of the next request is already correct and
 * there is no flash of the wrong theme.
 */
const YEAR = 60 * 60 * 24 * 365;

export async function setTheme(theme: ThemeChoice): Promise<{ ok: boolean }> {
  if (!["SYSTEM", "LIGHT", "DARK"].includes(theme)) return { ok: false };
  const session = await requireSession();
  await db.user.update({ where: { id: session.user.id }, data: { theme } });
  cookies().set("pb-theme", theme, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setLocale(locale: LocaleChoice): Promise<{ ok: boolean }> {
  if (!["en", "ta"].includes(locale)) return { ok: false };
  const session = await requireSession();
  await db.user.update({ where: { id: session.user.id }, data: { locale } });
  cookies().set("pb-locale", locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Reads the signed-in user's stored preferences for the server render. */
export async function getPreferences(): Promise<{ theme: ThemeChoice; locale: LocaleChoice }> {
  const session = await requireSession();
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { theme: true, locale: true } });
  return {
    theme: (user?.theme ?? "SYSTEM") as ThemeChoice,
    locale: (user?.locale === "ta" ? "ta" : "en") as LocaleChoice,
  };
}
