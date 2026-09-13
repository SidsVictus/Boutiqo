/** en-IN grouped rupee amount, e.g. ₹4,500. */
export function formatMoney(amount: number): string {
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

/** "14 Sep" — never "09/14", per the copy rules. */
export function formatShortDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "14 Sep 2026" for contexts that need the year (joined dates, etc). */
export function formatLongDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
