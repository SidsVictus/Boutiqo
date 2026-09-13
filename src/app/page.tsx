import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Logo } from "@/components/app/Logo";

/**
 * Root landing — a role chooser. Boutiqo has three roles with three separate
 * entry points (owner signup/login, admin login, customer tracking link); a
 * production build would likely make this the marketing site, but Phase 2's
 * job is the app itself, so this is a minimal, real (not placeholder) way to
 * reach every role from a fresh load.
 */
export default function Home() {
  return (
    <main className="bq-auth-bg">
      <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="bq-auth-brand">
          <Logo size={32} />
          boutiqo
        </div>
        <div className="bq-g2">
          <Card title="Boutique owner" meta="Manage orders, customers and deliveries">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <Button as="a" href="/owner/login" block>
                Log in
              </Button>
              <Button as="a" href="/owner/signup" variant="secondary" block>
                Create an account
              </Button>
            </div>
          </Card>
          <Card title="Super admin" meta="Platform oversight and tenant access">
            <div style={{ marginTop: 8 }}>
              <Button as="a" href="/admin/login" variant="secondary" block>
                Admin log in
              </Button>
            </div>
          </Card>
        </div>
        <Card variant="blush" title="Tracking a boutique order?" meta="Open the WhatsApp link the boutique sent you">
          <div style={{ marginTop: 8 }}>
            <Button as="a" href="/track/demo00000000000000000000000000000000000000000000000000000001" variant="ghost" block>
              View a sample tracking page
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
