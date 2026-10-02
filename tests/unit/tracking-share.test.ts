import { describe, expect, it } from "vitest";
import { trackingMessage, trackingUrl, whatsappLink, whatsappNumber } from "@/lib/tracking/share";

describe("whatsappNumber", () => {
  it("normalises Indian numbers", () => {
    expect(whatsappNumber("98480 12345")).toBe("919848012345");
    expect(whatsappNumber("+91 98480-12345")).toBe("919848012345");
    expect(whatsappNumber("09848012345")).toBe("919848012345");
    expect(whatsappNumber("0091 9848012345")).toBe("919848012345");
    expect(whatsappNumber("+44 7700 900123")).toBe("447700900123");
  });
  it("rejects missing or impossible numbers", () => {
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappNumber("12345")).toBeNull();
  });
});

describe("tracking links", () => {
  it("builds the tracking URL and a WhatsApp link with the message", () => {
    const url = trackingUrl("https://boutiqoo.netlify.app/", "abc123");
    expect(url).toBe("https://boutiqoo.netlify.app/track/abc123");
    const text = trackingMessage({ customerName: "Aisha Fatima", boutiqueName: "Lotus", orderCode: "LB-0007", garment: "Blouse", url });
    expect(text).toContain("Hi Aisha");
    expect(text).toContain(url);
    expect(whatsappLink("919848012345", text)).toBe(`https://wa.me/919848012345?text=${encodeURIComponent(text)}`);
    expect(whatsappLink(null, "x")).toBe("https://wa.me/?text=x");
  });
});
