/**
 * Edge-to-edge: the WebView fills the whole screen, behind the status bar and
 * the navigation bar, like a native app. The page keeps its content clear of
 * those bars using these sizes, passed in as CSS variables
 * (--bq-shell-inset-top/bottom, read by the web app's --safe-top/--safe-bottom).
 */
export function insetsScript(insets: { top: number; bottom: number }): string {
  const top = Math.max(0, Math.round(insets.top));
  const bottom = Math.max(0, Math.round(insets.bottom));
  // Also kept on window: React re-renders <html> on hydration and drops inline
  // styles, so the web app re-applies these itself (ShellBridge.tsx).
  return `(function(){window.BoutiqoInsets={top:${top},bottom:${bottom}};var s=document.documentElement.style;s.setProperty("--bq-shell-inset-top","${top}px");s.setProperty("--bq-shell-inset-bottom","${bottom}px");window.dispatchEvent(new Event("boutiqo:insets"));})();true;`;
}

export const STATUSBAR_MESSAGE_TYPE = "boutiqo:statusbar";

/** "light" | "dark" status-bar icons requested by a page of the web app, or null. */
export function parseStatusBarRequest(data: string, senderUrl: string, appOrigin: string): "light" | "dark" | null {
  if (senderUrl !== appOrigin && !senderUrl.startsWith(`${appOrigin}/`)) return null;
  try {
    const m = JSON.parse(data) as { type?: unknown; style?: unknown };
    if (m?.type !== STATUSBAR_MESSAGE_TYPE) return null;
    return m.style === "light" || m.style === "dark" ? m.style : null;
  } catch {
    return null;
  }
}
