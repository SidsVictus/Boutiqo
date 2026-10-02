import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms & Conditions · Boutiqo",
  description: "The terms that apply to using Boutiqo.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions">
      <p>
        These Terms &amp; Conditions (&quot;Terms&quot;) govern your use of Boutiqo, the order book for boutiques and tailors available at{" "}
        <a href="https://boutiqoo.netlify.app">boutiqoo.netlify.app</a> and through the Boutiqo Android app (the &quot;Service&quot;). By creating an account or using the Service, you agree to these Terms and to our{" "}
        <Link href="/privacy">Privacy Policy</Link>. If you don&apos;t agree, please don&apos;t use the Service.
      </p>

      <h2>1. Who can use Boutiqo</h2>
      <p>
        You must be at least 18 and able to enter into a binding contract. If you register on behalf of a boutique or business, you confirm you are authorised to accept these Terms for it.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>Provide accurate information and keep it up to date.</li>
        <li>Keep your password and devices secure. You are responsible for activity under your account.</li>
        <li>Tell us promptly at <ContactLine /> if you suspect unauthorised access.</li>
      </ul>

      <h2>3. Your data and your customers</h2>
      <ul>
        <li>
          You own the information you add to Boutiqo, including customer details, orders, measurements and photos (&quot;Your Data&quot;). You give us permission to store and process Your Data only as needed to provide and secure the Service.
        </li>
        <li>
          You are responsible for having a lawful basis, and where required your customers&apos; consent, to record their details in Boutiqo and to share tracking links with them. You must handle their information in line with applicable law, including India&apos;s Digital Personal Data Protection Act, 2023.
        </li>
        <li>Share a tracking link only with the customer it belongs to. Anyone with the link can view that order without logging in.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service for anything unlawful, fraudulent or harmful;</li>
        <li>upload content you have no right to use, or that is offensive or infringes others&apos; rights;</li>
        <li>try to access another boutique&apos;s data, probe or bypass security, or disrupt the Service;</li>
        <li>copy, resell or reverse-engineer the Service except as the law allows.</li>
      </ul>

      <h2>5. Fees</h2>
      <p>
        Boutiqo may offer free and paid plans. Any fees, and what they include, will be shown in the app before you are charged. If we introduce or change fees for features you already use, we will give you notice first.
      </p>

      <h2>6. Availability and changes</h2>
      <p>
        We work to keep Boutiqo available and reliable, but we don&apos;t guarantee uninterrupted or error-free service. We may improve, change or discontinue features. We recommend keeping your own records of important orders.
      </p>

      <h2>7. Suspension and termination</h2>
      <p>
        You may stop using Boutiqo at any time and ask us to delete your account. We may put an account on hold or disable it if you breach these Terms, if required by law, or to protect users or the Service. Where reasonable, we will tell you first. After an account is closed, we delete Your Data as described in the Privacy Policy.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        The Service, including its software, design and the Boutiqo name and logo, belongs to Boutiqo and its licensors. These Terms give you a limited, non-exclusive, non-transferable right to use the Service for your business while your account is active.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;. To the extent the law allows, we disclaim implied warranties, such as fitness for a particular purpose. Calculations shown in the app, such as balances and due dates, are aids: you remain responsible for your business decisions and dealings with your customers.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the extent the law allows, Boutiqo is not liable for indirect, incidental or consequential losses, or for lost profits, revenue or data. Our total liability for any claim relating to the Service is limited to the amount you paid us for the Service in the 12 months before the claim, or ₹1,000 if you paid nothing. Nothing in these Terms limits liability that cannot be limited by law.
      </p>

      <h2>11. Indemnity</h2>
      <p>
        You agree to compensate Boutiqo for claims and losses arising from Your Data or from your breach of these Terms or of the law, including claims by your customers.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms. We will change the &quot;Last updated&quot; date above and, for significant changes, notify you in the app or by email. If you keep using Boutiqo after changes take effect, you accept the updated Terms.
      </p>

      <h2>13. Governing law</h2>
      <p>These Terms are governed by the laws of India. Courts in Hyderabad, Telangana have exclusive jurisdiction, subject to any rights you have under applicable consumer law.</p>

      <h2>14. Contact</h2>
      <p>
        Questions about these Terms? Contact us at <ContactLine />.
      </p>
    </LegalPage>
  );
}
