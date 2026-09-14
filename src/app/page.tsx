import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Logo } from "@/components/app/Logo";

/**
 * Root landing. One login entry point for everyone — admins authenticate
 * through the same form and are routed to the admin console after their
 * identity resolves, so the platform console is never advertised here.
 * /admin/login still exists as an unlinked direct URL.
 */
export default function Home() {
  return (
    <main className="bq-auth-bg">
      <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="bq-auth-brand">
          <Logo size={32} />
          boutiqo
        </div>
        <Card title="Boutiqo" meta="Manage orders, customers and deliveries">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <Button as="a" href="/owner/login" block>
              Log in
            </Button>
            <Button as="a" href="/owner/signup" variant="secondary" block>
              Create an account
            </Button>
          </div>
        </Card>
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
