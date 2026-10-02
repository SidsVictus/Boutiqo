import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · Boutiqo",
  description: "How Boutiqo collects, uses, stores and protects information.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Boutiqo (&quot;Boutiqo&quot;, &quot;we&quot;, &quot;us&quot;) is an order book for boutiques and tailors. This policy explains what information we handle when you use the Boutiqo website at{" "}
        <a href="https://boutiqoo.netlify.app">boutiqoo.netlify.app</a> or the Boutiqo Android app (together, the &quot;Service&quot;), why, and the choices you have.
      </p>

      <h2>1. Who this policy covers</h2>
      <ul>
        <li>
          <strong>Boutique owners</strong> who create a Boutiqo account. For your own account details, Boutiqo decides how that information is used.
        </li>
        <li>
          <strong>Customers of a boutique</strong>, whose details a boutique records in Boutiqo. The boutique decides what to record and why. Boutiqo stores and processes it only on the boutique&apos;s behalf, to provide the Service. If you are a boutique&apos;s customer, contact that boutique first about your information.
        </li>
      </ul>

      <h2>2. Information we collect</h2>
      <p>
        <strong>Account information (boutique owners).</strong> Your name, email address and password (stored only in hashed form by our authentication provider) or, if you choose Google sign-in, the name, email address and profile picture Google shares with us. Also your boutique name, area, category, phone number and GST number (if you provide them), your boutique logo, and the date you accepted these policies.
      </p>
      <p>
        <strong>Information boutiques record about their customers.</strong> Customer name, phone number, address and Instagram handle; garment orders, including garment type, cloth description, style notes, tailor name, due date, order stage and amounts (total, advance, paid); body measurements entered for an order; and photos of cloth uploaded for an order.
      </p>
      <p>
        <strong>Technical information.</strong> A session cookie that keeps you signed in, and standard server logs (such as IP address, browser type and request time) kept by our hosting providers for security and troubleshooting. We do not use advertising cookies, third-party analytics or tracking pixels.
      </p>

      <h2>3. Google user data</h2>
      <p>
        If you sign in with Google, we request only the basic sign-in scopes (<code>openid</code>, <code>email</code>, <code>profile</code>). We use your Google name, email address and profile picture solely to create and identify your Boutiqo account and let you sign in. We do not access your Gmail, contacts, Drive or any other Google data. We do not sell Google user data, use it for advertising, or transfer it to anyone except as needed to provide sign-in (see section 6).
      </p>
      <p>
        Boutiqo&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>4. How we use information</h2>
      <ul>
        <li>To provide the Service: create accounts, store and show orders, customers, measurements and photos, and generate order codes and tracking links.</li>
        <li>To keep the Service secure: authenticate users, keep each boutique&apos;s data separate from every other boutique&apos;s, and prevent abuse.</li>
        <li>To support you and send essential service messages (for example about your account or changes to these policies).</li>
        <li>To meet legal obligations.</li>
      </ul>
      <p>We do not sell personal information, and we do not use boutique or customer data for advertising.</p>

      <h2>5. Customer tracking links</h2>
      <p>
        A boutique can share a private tracking link with its customer, for example on WhatsApp. Anyone who has that link can see that order&apos;s status, due date, amounts, cloth photo and the boutique&apos;s name, without logging in. Links are long, random and hard to guess, but please share them only with the intended customer.
      </p>

      <h2>6. Service providers</h2>
      <p>We use trusted providers to run the Service. They process information only on our instructions:</p>
      <ul>
        <li>
          <strong>Supabase</strong>: database and user authentication. Data is hosted in Supabase&apos;s Seoul, South Korea region.
        </li>
        <li>
          <strong>Cloudflare R2</strong>: storage for cloth photos and boutique logos.
        </li>
        <li>
          <strong>Netlify</strong>: hosting for the website.
        </li>
        <li>
          <strong>Google</strong>: optional sign-in.
        </li>
      </ul>
      <p>
        Because of this, your information may be stored and processed outside India. We may also disclose information if required by law, or to protect the rights, safety or security of users or the Service.
      </p>

      <h2>7. Security</h2>
      <p>
        All traffic is encrypted with HTTPS. Database access is enforced server-side with row-level security, so each boutique can only reach its own records. Photos are stored privately and shown only through short-lived signed links. No system is perfectly secure, but we work to protect your information and will act promptly on any incident.
      </p>

      <h2>8. Retention and deletion</h2>
      <p>
        We keep account and boutique data for as long as the account is active. A boutique owner can ask us to delete their account. We will then delete the boutique&apos;s data, including its customers, orders, measurements and photos, except where we must keep certain records by law. Server logs are kept only for a limited period by our hosting providers.
      </p>

      <h2>9. Your rights</h2>
      <p>
        Subject to applicable law, including India&apos;s Digital Personal Data Protection Act, 2023, you may ask to access, correct or delete your personal information, withdraw consent, or raise a grievance. Boutique owners can edit most information directly in the app. Customers of a boutique should contact the boutique, and may also contact us at <ContactLine />.
      </p>

      <h2>10. Android app</h2>
      <p>
        The Boutiqo Android app displays this same website and follows this policy. It requests only internet and network-status access. When you add a cloth photo, Android&apos;s own picker or camera app lets you choose or take the photo; the app itself has no camera, storage, contacts or location permission.
      </p>

      <h2>11. Children</h2>
      <p>The Service is meant for businesses and is not directed at children. Boutique owner accounts are for people aged 18 or over.</p>

      <h2>12. Changes to this policy</h2>
      <p>We may update this policy as the Service changes. We will change the &quot;Last updated&quot; date above and, for significant changes, notify boutique owners in the app or by email.</p>

      <h2>13. Contact</h2>
      <p>
        For privacy questions, requests or grievances, contact us at <ContactLine />. See also our <Link href="/terms">Terms &amp; Conditions</Link>.
      </p>
    </LegalPage>
  );
}
