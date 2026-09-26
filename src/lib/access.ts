export function isDateWithinWindow(
  date: Date,
  from: Date | null,
  to: Date | null,
): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const platform = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Macintosh/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Chrome\//i.test(userAgent)
      ? "Chrome"
      : /Firefox\//i.test(userAgent)
        ? "Firefox"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "Browser";
  return `${platform} · ${browser}`;
}
