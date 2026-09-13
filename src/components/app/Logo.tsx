import Image from "next/image";

/**
 * Brand lockup — user-supplied raster (public/brand/logo.png), used throughout
 * the app per explicit user direction. Note: CLAUDE_CODE_HANDOFF.md's own
 * design system explicitly says NOT to use the bundled raster lockup
 * (`_ds/.../assets/logo-lockup.jpeg`) and instead set the wordmark live in
 * Svetze + a signal-red dot — this is a deliberate override of that guidance,
 * using a different (user-provided) lockup image instead. See
 * docs/phase2-report.md for this judgment call.
 */
export function Logo({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "999px",
        overflow: "hidden",
        background: onDark ? "var(--surface-blush)" : "transparent",
        flex: "none",
      }}
    >
      <Image src="/brand/logo.png" alt="Boutiqo" width={size} height={size} style={{ objectFit: "cover", width: "100%", height: "100%" }} priority />
    </span>
  );
}
