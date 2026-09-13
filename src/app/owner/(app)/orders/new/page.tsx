"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/SessionContext";
import { listCustomers } from "@/lib/data/customers";
import { createOrder, listOrders } from "@/lib/data/orders";
import { ApiError } from "@/lib/data/store";
import { StepperPills, type StepDef } from "@/components/app/StepperPills";
import { MeasurementGrid, type MeasurementValues } from "@/components/app/MeasurementGrid";
import { MeasurementGuide } from "@/components/app/MeasurementGuide";
import { VoiceTypeToggle, VoiceListeningDisc } from "@/components/app/VoiceTypeToggle";
import { ClothPhotoUpload, uploadDeferredClothPhoto } from "@/components/app/ClothPhotoUpload";
import { CalendarGrid } from "@/components/app/CalendarGrid";
import { Input } from "@/components/ds/Input";
import { Select } from "@/components/ds/Select";
import { Button } from "@/components/ds/Button";
import { commonDressTypes } from "@/lib/validation/order";
import { computeLoadByDate } from "@/lib/calc/calendarLoad";
import { formatMoney, formatShortDate } from "@/lib/calc/format";
import type { Customer, Order } from "@/lib/supabase/types";
import { MEASUREMENT_FIELDS, type MeasurementField } from "@/lib/supabase/types";

const STEPS: StepDef[] = [
  { key: "measurements", letter: "A", label: "Measurements" },
  { key: "photo", letter: "B", label: "Cloth photo" },
  { key: "work", letter: "C", label: "Work details" },
  { key: "delivery", letter: "D", label: "Delivery date" },
  { key: "billing", letter: "E", label: "Billing" },
];

export default function NewOrderPage() {
  const { session } = useSession();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  const router = useRouter();
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [existingOrders, setExistingOrders] = React.useState<Order[]>([]);
  const [step, setStep] = React.useState(0);
  const [inputMode, setInputMode] = React.useState<"voice" | "text">("text");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [customerId, setCustomerId] = React.useState("");
  const [measurements, setMeasurements] = React.useState<MeasurementValues>({});
  // Deferred: the real presign route requires an existing order id for a
  // cloth_photo upload, which doesn't exist until step E succeeds — so this
  // step only holds the selected File, and the actual upload happens after
  // createOrder returns. See docs/phase3-report.md "Cloth-photo-in-wizard mismatch".
  const [clothPhotoFile, setClothPhotoFile] = React.useState<File | null>(null);
  const [garmentType, setGarmentType] = React.useState("");
  const [garmentTypeOther, setGarmentTypeOther] = React.useState("");
  const [tailorName, setTailorName] = React.useState("");
  const [clothDescription, setClothDescription] = React.useState("");
  const [styleNotes, setStyleNotes] = React.useState("");
  const [dueDate, setDueDate] = React.useState<string | null>(null);
  const [totalAmount, setTotalAmount] = React.useState("");
  const [advanceAmount, setAdvanceAmount] = React.useState("");

  React.useEffect(() => {
    if (!boutique) return;
    listCustomers(boutique.id).then(setCustomers);
    // "New order" prefills step A with the last order's figures (handoff §6);
    // the same fetched list also drives the delivery-date calendar's load.
    listOrders(boutique.id).then((rows) => {
      setExistingOrders(rows);
      if (rows.length === 0) return;
      const last = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const prefill: MeasurementValues = {};
      for (const field of MEASUREMENT_FIELDS) {
        const v = last[field];
        if (typeof v === "number") prefill[field] = String(v);
      }
      setMeasurements(prefill);
      setTotalAmount(String(last.total_amount));
      setAdvanceAmount(String(last.advance_amount));
    });
  }, [boutique]);

  if (!boutique) return null;
  const activeBoutique = boutique;

  function setMeasurement(field: MeasurementField, value: string) {
    setMeasurements((m) => ({ ...m, [field]: value }));
  }

  async function handleSave() {
    setError(null);
    if (!customerId) {
      setError("Choose a customer in Work details");
      setStep(2);
      return;
    }
    if (!garmentType) {
      setError("Choose a garment type in Work details");
      setStep(2);
      return;
    }
    if (!dueDate) {
      setError("Choose a delivery date");
      setStep(3);
      return;
    }
    const total = Number(totalAmount || 0);
    const advance = Number(advanceAmount || 0);
    setSaving(true);
    try {
      const measurementPayload = Object.fromEntries(
        Object.entries(measurements)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, Number(v)]),
      );
      const order = await createOrder({
        boutiqueId: activeBoutique.id,
        customerId,
        garmentType,
        garmentTypeOther,
        dueDate,
        totalAmount: total,
        advanceAmount: advance,
        tailorName,
        clothDescription,
        styleNotes,
        measurements: measurementPayload,
      });
      if (clothPhotoFile) {
        // A failed photo upload shouldn't block the (already-saved) order —
        // surface it, but still continue to the confirm screen.
        try {
          await uploadDeferredClothPhoto(activeBoutique.id, order.id, clothPhotoFile);
        } catch {
          setError("Order saved, but the cloth photo failed to upload. Add it from the order record.");
        }
      }
      router.push(`/owner/orders/${order.id}/confirm`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the order. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else void handleSave();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <StepperPills steps={STEPS} currentIndex={step} onJump={setStep} />

      {error ? <div className="bq-field__error">{error}</div> : null}

      {step === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <VoiceTypeToggle mode={inputMode} onChange={setInputMode} />
          {inputMode === "voice" ? (
            <VoiceListeningDisc />
          ) : (
            <>
              <MeasurementGrid values={measurements} onChange={setMeasurement} />
              <MeasurementGuide />
            </>
          )}
        </div>
      )}

      {step === 1 && <ClothPhotoUpload boutiqueId={boutique.id} orderId={null} onFileSelected={setClothPhotoFile} />}

      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
          <Select label="Customer" required placeholder="Choose a customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Garment type" required placeholder="Choose a type" value={garmentType} onChange={(e) => setGarmentType(e.target.value)} options={[...commonDressTypes]} />
          {garmentType === "Other" ? <Input label="Describe the garment" required value={garmentTypeOther} onChange={(e) => setGarmentTypeOther(e.target.value)} /> : null}
          <Input label="Tailor" hint="Optional" value={tailorName} onChange={(e) => setTailorName(e.target.value)} />
          <Input label="Cloth" hint="e.g. Wine raw silk, 1.5 m" value={clothDescription} onChange={(e) => setClothDescription(e.target.value)} />
          <Input label="Style notes" multiline value={styleNotes} onChange={(e) => setStyleNotes(e.target.value)} />
        </div>
      )}

      {step === 3 && (
        <DeliveryDateStep
          dueDate={dueDate}
          onSelect={setDueDate}
          customerName={customers.find((c) => c.id === customerId)?.name}
          garmentType={garmentType}
          loadByDate={computeLoadByDate(existingOrders)}
        />
      )}

      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 360 }}>
          <Input label="Total amount" required numeric iconLeft={<span>₹</span>} value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
          <Input label="Advance received" numeric iconLeft={<span>₹</span>} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} />
          <div className="bq-card" style={{ background: "var(--surface-sunken)" }}>
            Balance: <span className="bq-num">{formatMoney(Number(totalAmount || 0) - Number(advanceAmount || 0))}</span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid var(--line-hairline)" }}>
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </Button>
        <Button onClick={next} disabled={saving}>
          {step === STEPS.length - 1 ? (saving ? "Saving…" : "Save order") : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function DeliveryDateStep({
  dueDate,
  onSelect,
  customerName,
  garmentType,
  loadByDate,
}: {
  dueDate: string | null;
  onSelect: (d: string) => void;
  customerName?: string;
  garmentType: string;
  loadByDate: Record<string, number>;
}) {
  const today = new Date();
  const otherOrdersOnDay = dueDate ? (loadByDate[dueDate] ?? 0) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CalendarGrid year={today.getFullYear()} month={today.getMonth()} loadByDate={loadByDate} selectedDate={dueDate} disablePast onSelectDate={onSelect} />
      {dueDate ? (
        <div className="bq-card" style={{ background: "var(--surface-inverse)", color: "var(--text-inverse)" }}>
          <div className="bq-num" style={{ fontSize: 18, marginBottom: 4 }}>
            {formatShortDate(dueDate)}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            {otherOrdersOnDay} other order{otherOrdersOnDay === 1 ? "" : "s"} due that day
            {customerName ? ` · ${customerName}` : ""}
            {garmentType ? ` · ${garmentType}` : ""}
          </div>
        </div>
      ) : (
        <div className="bq-field__hint">Choose a delivery date.</div>
      )}
    </div>
  );
}
