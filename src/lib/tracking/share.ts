// Building the customer tracking link and the WhatsApp hand-off for it.
// Pure (no browser APIs) so it's unit-tested in tests/unit.

export function trackingUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/track/${encodeURIComponent(token)}`;
}

/**
 * Digits WhatsApp expects (country code, no "+"). Indian 10-digit mobiles get
 * 91 prepended; a leading 0 trunk prefix is dropped. Null if it can't be a
 * real number.
 */
export function whatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** wa.me link; without a number WhatsApp asks which chat to send it to. */
export function whatsappLink(number: string | null, text: string): string {
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;
}

export function trackingMessage(opts: { customerName: string; boutiqueName: string; orderCode: string; garment: string; url: string }): string {
  const first = opts.customerName.trim().split(/\s+/)[0] || "there";
  return `Hi ${first}, your ${opts.garment} order ${opts.orderCode} with ${opts.boutiqueName} is in our order book. Track its progress here: ${opts.url}`;
}
