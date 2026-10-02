// Mirrors the web design tokens (src/styles/tokens/colors.css) so the native
// splash, loading and error states match the web app they hand off to.
export const colors = {
  page: "#fffbfa", // --surface-page
  blush: "#fad3d0", // logo background
  plum: "#4a071e", // --action-primary / --text-strong
  plumInk: "#fdf7f6", // --action-primary-ink
  body: "#3b3232", // --text-body
  muted: "#756767", // --text-muted
  accent: "#ff254c", // --action-accent
  bannerBg: "#2b0411", // --plum-900
} as const;
