import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/session/SessionContext";
import { ToastProvider } from "@/lib/session/ToastContext";

export const metadata: Metadata = {
  title: "Boutiqo",
  description: "Order book for small boutiques and tailors.",
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
