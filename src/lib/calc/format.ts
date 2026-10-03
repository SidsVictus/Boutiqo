/** en-IN grouped rupee amount, e.g. ₹4,500. */
export function formatMoney(amount: number): string {
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

/** A `date` column ("2026-09-14") is a local calendar day; a `timestamptz`
 * ("2026-09-14T10:20:00+00:00", e.g. created_at) is parsed as-is. Appending a
 * time to a full timestamp made it "Invalid Date". */
function toDate(date: string | Date): Date {
  if (typeof date !== "string") return date;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
}

/** "14 Sep" — never "09/14", per the copy rules. */
export function formatShortDate(date: string | Date): string {
  return toDate(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "14 Sep 2026" for contexts that need the year (joined dates, etc). */
export function formatLongDate(date: string | Date): string {
  return toDate(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** A Date's local calendar day as "YYYY-MM-DD". Not toISOString(): that is the
 * UTC day, which in India (UTC+5:30) is the previous day for local midnight. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "Tue, 14 Oct" for list headings. */
export function formatDayHeading(date: string | Date): string {
  return toDate(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
