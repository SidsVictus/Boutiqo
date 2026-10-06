export const PARTNER_SUBJECT = "Hey boutiqo partner, this is an important message.";

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

/** Only a plain, single address is ever put into a compose link. */
export function isSafeEmail(email: string | null | undefined): email is string {
  return !!email && EMAIL_RE.test(email.trim());
}

/** Gmail's compose screen (opens in a new tab), prefilled. */
export function gmailComposeUrl(to: string, subject: string): string {
  const q = new URLSearchParams({ view: "cm", fs: "1", to: to.trim(), su: subject });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/** The device's default mail app. */
export function mailtoUrl(to: string, subject: string): string {
  return `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}`;
}
