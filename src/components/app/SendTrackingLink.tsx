"use client";

import * as React from "react";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { Send } from "./icons";
import { useToast } from "@/lib/session/ToastContext";
import { updateCustomerPhone } from "@/lib/data/customers";
import { ApiError } from "@/lib/data/store";
import { customerCreateSchema } from "@/lib/validation/customer";
import { trackingMessage, trackingUrl, whatsappLink, whatsappNumber } from "@/lib/tracking/share";
import type { Customer, Order } from "@/lib/supabase/types";

/**
 * Sends the customer their no-login tracking link on WhatsApp. Opens WhatsApp
 * with the customer's chat and a ready message (the owner taps Send there),
 * so it never claims "sent" on its own. Without a phone number on file it asks
 * for one first; the link can always be copied instead.
 */
export function SendTrackingLink({ order, customer, boutiqueName, onCustomerUpdated }: { order: Order; customer: Customer; boutiqueName: string; onCustomerUpdated?: (c: Customer) => void }) {
  const { flash } = useToast();
  const [phoneDraft, setPhoneDraft] = React.useState("");
  const [phoneError, setPhoneError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window is only available after mount.
    setOrigin(window.location.origin);
  }, []);

  const url = origin ? trackingUrl(origin, order.tracking_token) : "";
  const garment = order.garment_type === "Other" ? order.garment_type_other || "garment" : order.garment_type;
  const message = trackingMessage({ customerName: customer.name, boutiqueName, orderCode: order.order_code, garment, url });
  const number = whatsappNumber(customer.phone);

  async function savePhone() {
    const parsed = customerCreateSchema.shape.phone.safeParse(phoneDraft);
    if (!phoneDraft.trim() || !parsed.success || !whatsappNumber(phoneDraft)) {
      setPhoneError("Enter a valid mobile number, e.g. 98480 12345");
      return;
    }
    setSaving(true);
    setPhoneError(null);
    try {
      const updated = await updateCustomerPhone(customer.id, phoneDraft.trim());
      onCustomerUpdated?.(updated);
      flash(`Saved ${customer.name}'s number. Tap "Send on WhatsApp" now.`, "success");
    } catch (err) {
      setPhoneError(err instanceof ApiError ? err.message : "Couldn't save the phone number. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      flash("Tracking link copied.", "success");
    } catch {
      flash("Couldn't copy automatically. Press and hold the link to copy it.", "danger");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {number ? (
        <Button
          as="a"
          href={whatsappLink(number, message)}
          target="_blank"
          rel="noopener noreferrer"
          variant="whatsapp"
          iconLeft={<Send size={16} />}
          block
          onClick={() => flash(`Opening WhatsApp for ${customer.name}. Tap Send there to deliver the link.`)}
        >
          Send tracking link on WhatsApp
        </Button>
      ) : (
        <div className="bq-card" style={{ background: "var(--surface-sunken)", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontWeight: 600 }}>{customer.name} has no phone number yet.</span>
          <Input label="Customer's WhatsApp number" type="tel" inputMode="tel" placeholder="e.g. 98480 12345" value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} error={phoneError ?? undefined} />
          <Button variant="secondary" onClick={() => void savePhone()} disabled={saving}>
            {saving ? "Saving…" : "Save number"}
          </Button>
        </div>
      )}
      {url ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code style={{ flex: "1 1 200px", wordBreak: "break-all", fontSize: 13, color: "var(--text-muted)" }}>{url}</code>
          <Button variant="ghost" size="sm" onClick={() => void copyLink()}>
            Copy link
          </Button>
        </div>
      ) : null}
    </div>
  );
}
