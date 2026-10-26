import { differenceInCalendarDays, format, parseISO } from "date-fns";

/** Local "YYYY-MM-DD" for today (not UTC). */
export function todayISO(d = new Date()) {
  return format(d, "yyyy-MM-dd");
}

/** Parse a date-only string as a local date (avoids the UTC off-by-one). */
export function parseDay(iso: string) {
  return iso.length <= 10 ? parseISO(iso) : new Date(iso);
}

/** "Oct 25", plus the year when it isn't the current year. */
export function fmtDay(iso: string | Date | null | undefined) {
  if (!iso) return "";
  const d = typeof iso === "string" ? parseDay(iso) : iso;
  return d.getFullYear() === new Date().getFullYear() ? format(d, "MMM d") : format(d, "MMM d, yyyy");
}

/** "Apr 2027" — month precision for expiry. */
export const fmtMonth = (iso: string | Date) =>
  format(typeof iso === "string" ? parseDay(iso) : iso, "MMM yyyy");

export function daysUntil(iso: string | null, now = new Date()) {
  if (!iso) return null;
  return differenceInCalendarDays(parseDay(iso), now);
}

/** "early March", "mid April", "late March" */
export function fuzzyMonth(d: Date) {
  const day = d.getDate();
  const part = day <= 10 ? "early" : day <= 20 ? "mid" : "late";
  return `${part} ${format(d, "MMMM")}`;
}

export function addDaysISO(iso: string, days: number) {
  const d = parseDay(iso);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** Status chip for an expiry date: "3 days left", "Expired Aug". */
export function expiryChip(iso: string | null, now = new Date()) {
  const d = daysUntil(iso, now);
  if (d === null || !iso) return null;
  if (d < 0) {
    const e = parseDay(iso);
    return { tone: "danger" as const, text: `Expired ${format(e, e.getFullYear() === now.getFullYear() ? "MMM" : "MMM yyyy")}` };
  }
  if (d === 0) return { tone: "warn" as const, text: "Expires today" };
  if (d === 1) return { tone: "warn" as const, text: "1 day left" };
  return { tone: "warn" as const, text: `${d} days left` };
}
