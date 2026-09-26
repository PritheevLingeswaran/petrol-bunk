/**
 * The shape every accounting report flattens into.
 *
 * Deliberately free of any renderer import: the builders in `report-docs.ts`
 * are pure data, so they can be exercised without pulling @react-pdf into the
 * process. `pdf.tsx` renders this shape; nothing here knows about it.
 */
export type Cell = { text: string; bold?: boolean; negative?: boolean; indent?: number };
export type ReportColumn = { label: string; width: string; align?: "left" | "right" };
export type ReportSection = { heading?: string; columns: ReportColumn[]; rows: Cell[][]; totals?: Cell[] };
export type ReportDoc = {
  title: string;
  subtitle: string;
  outlet: { name: string; address?: string; gstin?: string };
  sections: ReportSection[];
  footNote?: string;
  landscape?: boolean;
  banner?: { text: string; tone: "alert" | "info" };
};

export const cell = (text: string, extra: Omit<Cell, "text"> = {}): Cell => ({ text, ...extra });

/**
 * A money cell: `display` is what the reader sees (already grouped for India),
 * `value` is the raw figure used to decide whether it is a loss. Red is
 * reserved for losses, exactly as on screen.
 */
export const moneyCell = (display: string, value: string, extra: Omit<Cell, "text" | "negative"> = {}): Cell => ({ text: display, negative: Number(value) < 0, ...extra });
