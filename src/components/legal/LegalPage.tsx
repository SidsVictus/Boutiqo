import Link from "next/link";
import { Logo } from "@/components/app/Logo";

/** Last time either legal page was materially changed. Update both pages' text and this date together. */
export const LEGAL_LAST_UPDATED = "2 October 2026";

/**
 * Public contact address for privacy and support requests. Set
 * NEXT_PUBLIC_SUPPORT_EMAIL in Netlify; until then the pages point people to
 * the in-app support route instead of showing an empty address.
 */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null;

export function ContactLine() {
  return SUPPORT_EMAIL ? (
    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
  ) : (
    <>the support email address shown on the Google sign-in screen for Boutiqo</>
  );
}

/** Static, public layout shared by /privacy and /terms (no login, no client JS). */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="bq-legal">
      <article className="bq-legal__card">
        <div className="bq-auth-brand">
          <Logo size={30} />
          Boutiqo
        </div>
        <h1>{title}</h1>
        <p className="bq-legal__meta">Last updated: {LEGAL_LAST_UPDATED}</p>
        {children}
        <nav className="bq-legal__nav" aria-label="Legal">
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms &amp; Conditions</Link>
        </nav>
      </article>
    </main>
  );
}
