import Link from "next/link";
import { ChevronRight } from "./icons";

export function StatTile({ label, value, href, hint, tone }: { label: string; value: React.ReactNode; href?: string; hint?: string; tone?: "alert" }) {
  const body = (
    <>
      <span className="bq-label">{label}</span>
      <span className="bq-stat__hero bq-num">{value}</span>
      {hint ? <span className="bq-stat__hint">{hint}</span> : null}
    </>
  );
  if (!href) {
    return (
      <div className="bq-stat" data-tone={tone}>
        {body}
      </div>
    );
  }
  return (
    <Link href={href} className="bq-stat bq-stat--link" data-tone={tone}>
      {body}
      <ChevronRight size={18} className="bq-stat__chevron" aria-hidden="true" />
    </Link>
  );
}
