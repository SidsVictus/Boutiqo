import { NextResponse } from "next/server";
import { APK_URL } from "@/components/landing/download";

/** Permanent download link (used by the landing page QR): forwards to the latest APK. */
export function GET() {
  return NextResponse.redirect(APK_URL, 302);
}
