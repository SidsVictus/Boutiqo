import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session/SessionContext";
import { ToastProvider } from "@/lib/session/ToastContext";
import { ShellBridge } from "@/components/app/ShellBridge";

// Serif used across the sign-in and account screens (see .bq-auth-card).
const authSerif = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-auth", display: "swap" });

export const metadata: Metadata = {
  title: "Boutiqo",
  description: "Order book for small boutiques and tailors.",
  // Google Search Console ownership of boutiqoo.netlify.app (needed for Google
  // OAuth brand verification). The HTML-file method is also served from
  // public/googlecb36037aae910ac8.html; keep both while verification is in use.
  verification: { google: "RGuqx9NV8EVKuZocaf0S3sIEfMQfITGeX1cfBvOvHME" },
};

// viewport-fit=cover is required for env(safe-area-inset-*) to report real
// values on notched/gesture-bar phones — without it the tab bar's safe-area
// padding below always resolves to 0, and the bar sits flush against the
// system gesture area on a real device (invisible in a browser devtools
// viewport, which never has an inset to report).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={authSerif.variable}>
      <body>
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
          <ShellBridge />
        </SessionProvider>
      </body>
    </html>
  );
}
