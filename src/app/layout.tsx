import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@/app/globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Fuel Ledger",
  description: "Indian retail fuel outlet management",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Fuel Ledger", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#09111d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the preference on the server so the first paint is already correct.
  // A client-side toggle would flash the wrong theme on every navigation.
  const store = cookies();
  const theme = store.get("pb-theme")?.value;
  const locale = store.get("pb-locale")?.value === "ta" ? "ta" : "en";
  const attribute = theme === "LIGHT" ? "light" : theme === "DARK" ? "dark" : undefined;
  return (
    <html lang={locale} data-theme={attribute}>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
