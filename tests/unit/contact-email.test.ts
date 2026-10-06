import { describe, expect, it } from "vitest";
import { PARTNER_SUBJECT, gmailComposeUrl, isSafeEmail, mailtoUrl } from "@/lib/contact/email";

describe("contact boutique links", () => {
  it("builds a Gmail compose link with recipient and subject", () => {
    const url = new URL(gmailComposeUrl("siddarthram777@gmail.com", PARTNER_SUBJECT));
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("siddarthram777@gmail.com");
    expect(url.searchParams.get("su")).toBe("Hey boutiqo partner, this is an important message.");
  });
  it("builds a mailto link", () => {
    expect(mailtoUrl("a.b@gmail.com", PARTNER_SUBJECT)).toBe("mailto:a.b@gmail.com?subject=Hey%20boutiqo%20partner%2C%20this%20is%20an%20important%20message.");
  });
  it("refuses anything but a single plain address", () => {
    expect(isSafeEmail("a@b.co")).toBe(true);
    expect(isSafeEmail("a@b.co,evil@x.com")).toBe(false);
    expect(isSafeEmail("a@b.co?bcc=x@y.z")).toBe(false);
    expect(isSafeEmail(null)).toBe(false);
  });
});
