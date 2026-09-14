import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/session/SessionContext";
import { ToastProvider } from "@/lib/session/ToastContext";

export const metadata: Metadata = {
  title: "Boutiqo",
  description: "Order book for small boutiques and tailors.",
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
    <html lang="en">
      <body>
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
