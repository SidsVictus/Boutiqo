/**
 * Brand wordmark accent — a fixed 7px signal-red dot, per
 * CLAUDE_CODE_HANDOFF.md §7: the bundled raster lockup
 * (`_ds/.../assets/logo-lockup.jpeg`) is explicitly NOT used in the product —
 * it's a leftover raster with the background baked in. The wordmark text
 * itself ("boutiqo") is set by each call site directly in Svetze (via the
 * `.bq-auth-brand`/`.bq-sidebar__brand` classes' `font-family`); this
 * component renders only the dot.
 *
 * `size`/`onDark` are accepted for call-site compatibility (callers pass a
 * context size like 28/30 expecting an icon) but intentionally ignored for
 * the dot's own dimensions — the handoff fixes the dot at 7px regardless of
 * where it appears; only the surrounding wordmark text size differs by
 * context (24px top bar / 28px sidebar), which is controlled by CSS, not
 * this component.
 *
 * Phase 3 note: an earlier Phase 2 revision of this component rendered a
 * user-supplied raster image instead, added at an explicit user request
 * mid-session. That request was real, but Phase 3's brief directs reverting
 * to the handoff's documented wordmark treatment since no such override is
 * recorded anywhere in the project's actual source-of-truth docs — done here.
 */
export function Logo({ size, onDark }: { size?: number; onDark?: boolean }) {
  void size;
  void onDark;
  return <span aria-hidden="true" style={{ display: "inline-block", width: 7, height: 7, borderRadius: "999px", background: "var(--action-accent)", flex: "none" }} />;
}
