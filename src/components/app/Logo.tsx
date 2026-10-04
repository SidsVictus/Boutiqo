/**
 * The Boutiqo brand mark (the "b." monogram, same artwork as the app icon and
 * browser-tab favicon), shown beside the "boutiqo" wordmark text that each
 * call site sets itself. `onDark` adds a light ring so it reads on dark bars.
 */
export function Logo({ size = 28, onDark }: { size?: number; onDark?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static brand mark; next/image adds nothing here.
    <img
      src="/brand/boutiqo-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: "50%", flex: "none", boxShadow: onDark ? "0 0 0 1.5px rgba(255,255,255,0.6)" : undefined }}
    />
  );
}
