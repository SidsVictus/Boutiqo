import { describe, expect, it, beforeEach } from "vitest";
import { createOrder, markOrderPaid, updateOrderStage } from "@/lib/data/orders";
import { createCustomer } from "@/lib/data/customers";
import { getOrderTracking } from "@/lib/data/tracking";
import { setBoutiqueStatus } from "@/lib/data/boutiques";
import { MockApiError, boutiques, orders, setForceFailure } from "@/lib/data/store";

describe("mock data layer — orders", () => {
  beforeEach(() => setForceFailure(false));

  it("createOrder assigns a sequential per-boutique BQ-#### code", async () => {
    const boutique = boutiques.find((b) => b.id === "b1")!;
    const before = boutique.order_seq;
    const customer = await createCustomer({ boutiqueId: "b1", name: "Test Customer" });
    const order = await createOrder({
      boutiqueId: "b1",
      customerId: customer.id,
      garmentType: "Kurta",
      dueDate: "2027-01-01",
      totalAmount: 1000,
      advanceAmount: 200,
    });
    expect(order.order_code).toBe(`BQ-${String(before + 1).padStart(4, "0")}`);
    expect(order.stage).toBe("received");
    expect(order.tracking_token).toHaveLength(64);
  });

  it("createOrder is rejected when the boutique is not active (on_hold/disabled block new orders)", async () => {
    const customer = await createCustomer({ boutiqueId: "b2", name: "On Hold Customer" });
    // b2 is seeded on_hold
    await expect(
      createOrder({ boutiqueId: "b2", customerId: customer.id, garmentType: "Kurta", dueDate: "2027-01-01", totalAmount: 100, advanceAmount: 0 }),
    ).rejects.toBeInstanceOf(MockApiError);
  });

  it("createOrder rejects advance greater than total", async () => {
    const customer = await createCustomer({ boutiqueId: "b1", name: "Bad Advance" });
    await expect(
      createOrder({ boutiqueId: "b1", customerId: customer.id, garmentType: "Kurta", dueDate: "2027-01-01", totalAmount: 100, advanceAmount: 200 }),
    ).rejects.toBeInstanceOf(MockApiError);
  });

  it("markOrderPaid sets advance = total and paid = true, is idempotent", async () => {
    const order = orders.find((o) => o.id === "o2")!;
    const updated = await markOrderPaid(order.id);
    expect(updated.paid).toBe(true);
    expect(updated.advance_amount).toBe(updated.total_amount);
    const again = await markOrderPaid(order.id);
    expect(again.paid).toBe(true);
  });

  it("updateOrderStage moves the order to the given stage", async () => {
    const updated = await updateOrderStage("o5", "cutting");
    expect(updated.stage).toBe("cutting");
  });

  it("simulate() rejects when a failure is forced", async () => {
    setForceFailure(true);
    await expect(updateOrderStage("o1", "ready")).rejects.toBeInstanceOf(MockApiError);
    setForceFailure(false);
  });
});

describe("mock data layer — tracking", () => {
  it("resolves a valid token to the safe subset", async () => {
    const view = await getOrderTracking("demo00000000000000000000000000000000000000000000000000000001");
    expect(view).not.toBeNull();
    expect(view?.orderCode).toBe("BQ-1042");
  });

  it("returns null for an unknown token (no distinguishing error)", async () => {
    const view = await getOrderTracking("not-a-real-token");
    expect(view).toBeNull();
  });
});

describe("mock data layer — admin sub-role boutique status matrix", () => {
  it("support_admin can put on hold but cannot disable", async () => {
    await expect(setBoutiqueStatus("b1", "on_hold", "support_admin")).resolves.toMatchObject({ status: "on_hold" });
    await expect(setBoutiqueStatus("b1", "disabled", "support_admin")).rejects.toThrow(/cannot disable/i);
    await setBoutiqueStatus("b1", "active", "owner_admin"); // reset
  });

  it("billing_admin and viewer cannot change status at all", async () => {
    await expect(setBoutiqueStatus("b1", "on_hold", "billing_admin")).rejects.toThrow();
    await expect(setBoutiqueStatus("b1", "on_hold", "viewer")).rejects.toThrow();
  });

  it("owner_admin can disable", async () => {
    await expect(setBoutiqueStatus("b1", "disabled", "owner_admin")).resolves.toMatchObject({ status: "disabled" });
    await setBoutiqueStatus("b1", "active", "owner_admin"); // reset
  });
});
