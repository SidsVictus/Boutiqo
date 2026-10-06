/**
 * The Boutiqo brand mark: the "b" with its pink dot on a transparent
 * background (same artwork as the browser-tab icon), shown beside the
 * "Boutiqo" wordmark text that each call site sets. `onDark` uses the
 * blush-pink "b" so it stays visible on the plum sidebar.
 */
export function Logo({ size = 30, onDark }: { size?: number; onDark?: boolean }) {
  const height = Math.round(size * 1.15);
  const width = Math.round((height * 176) / 256);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static brand mark; next/image adds nothing here.
    <img
      src={onDark ? "/brand/boutiqo-b-light.png" : "/brand/boutiqo-b.png"}
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      style={{ width, height, flex: "none", display: "block" }}
    />
  );
}
