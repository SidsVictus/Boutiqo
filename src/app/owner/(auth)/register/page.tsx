"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { useSession } from "@/lib/session/SessionContext";
import { boutiqueRegistrationSchema } from "@/lib/validation/boutique";

// Phase 1's real POST /api/auth/register combines registration fields and
// terms acceptance into ONE request. This screen only collects and holds the
// fields (in SessionContext's draft state) — the actual API call happens on
// the terms screen once both checkboxes are accepted. See
// docs/phase3-report.md "Documented mismatch: registration vs. terms as two screens".
export default function OwnerRegisterPage() {
  const router = useRouter();
  const { session, draftSignup, setDraftFields } = useSession();
  const [form, setForm] = React.useState({ name: "", area: "", category: "", gstNumber: "", phone: "", ownerName: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<keyof typeof form, string>>>({});

  // Wait for the session check: right after Google sign-in or an email
  // confirmation link this is a fresh page load, and the draft is re-derived
  // from the signed-in user a moment later. Redirecting on the first render
  // (as before) sent those users straight back to /owner/signup.
  React.useEffect(() => {
    if (session === undefined) return;
    if (session?.kind === "owner") router.replace("/owner/dashboard");
    else if (session?.kind === "admin") router.replace("/admin/dashboard");
    else if (!draftSignup) router.replace("/owner/signup");
  }, [session, draftSignup, router]);

  // Prefill once the draft is known: fields entered earlier (coming back from
  // the terms step) or the name from the Google profile.
  const prefilledFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!draftSignup || prefilledFor.current === draftSignup.userId) return;
    prefilledFor.current = draftSignup.userId;
    const f = draftSignup.fields;
    setForm((cur) => ({
      name: f?.name ?? cur.name,
      area: f?.area ?? cur.area,
      category: f?.category ?? cur.category,
      gstNumber: f?.gstNumber ?? cur.gstNumber,
      phone: f?.phone ?? cur.phone,
      ownerName: f?.ownerName ?? (cur.ownerName || draftSignup.name || ""),
    }));
  }, [draftSignup]);

  if (session === undefined || !draftSignup) return <main className="bq-auth-bg" aria-busy="true" />;

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The same schema POST /api/auth/register enforces, so mistakes surface
    // here, next to the field, rather than at the terms step.
    const parsed = boutiqueRegistrationSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof typeof form, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof typeof form;
        errs[key] ??= issue.message;
      }
      setFieldErrors(errs);
      setError("Fix the highlighted fields to continue");
      return;
    }
    setFieldErrors({});
    setError(null);
    setDraftFields({
      name: parsed.data.name,
      area: parsed.data.area,
      ownerName: parsed.data.ownerName,
      phone: parsed.data.phone,
      gstNumber: parsed.data.gstNumber,
      category: parsed.data.category,
    });
    router.push("/owner/terms");
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card bq-auth-card--wide">
        <div className="bq-auth-brand">
          Boutiqo
        </div>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Tell us about your boutique</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
          This appears on your records and your customers&apos; tracking pages.{draftSignup.email ? <> Signed in as {draftSignup.email}.</> : null}
        </p>
        <form onSubmit={handleSubmit} className="bq-g2" style={{ rowGap: 14 }}>
          <Input label="Boutique name" required value={form.name} onChange={(e) => set("name", e.target.value)} error={fieldErrors.name} />
          <Input label="Owner name" required autoComplete="name" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} error={fieldErrors.ownerName} />
          <Input label="Area" value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Banjara Hills" />
          <Input label="Business category" required value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Ladies tailoring & boutique" error={fieldErrors.category} />
          <Input label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} error={fieldErrors.phone} />
          <Input label="GST number" hint="Optional, 15 characters" autoCapitalize="characters" value={form.gstNumber} onChange={(e) => set("gstNumber", e.target.value.toUpperCase().replace(/\s/g, ""))} error={fieldErrors.gstNumber} />
          {error ? (
            <div className="bq-field__error" style={{ gridColumn: "1 / -1" }}>
              {error}
            </div>
          ) : null}
          <div style={{ gridColumn: "1 / -1" }}>
            <Button type="submit" block>
              Continue
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
