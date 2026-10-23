/**
 * The landing page's button and QR code point at this permanent address.
 * It never changes, so the QR never needs regenerating: /download forwards
 * to the APK attached to the latest GitHub release (APK_URL below).
 *
 * New app version: create a GitHub release and attach the APK named
 * exactly `boutiqo.apk`. Nothing in the code changes.
 */
export const DOWNLOAD_URL = "https://boutiqoo.netlify.app/download";
export const APK_URL = "https://github.com/SidsVictus/Boutiqo/releases/latest/download/boutiqo.apk";
export const APP_VERSION = "1.1.1";
