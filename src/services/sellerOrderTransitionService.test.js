import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
  },
}));

import {
  getDeliveryDeadlineState,
  getSellerOrderTransitionMessage,
  markSellerOrderDelivered,
  markSellerOrderShipped,
  SELLER_DELIVERY_DEADLINE_REASONS,
} from "./sellerOrderTransitionService";

describe("getDeliveryDeadlineState", () => {
  it("allows a shipped delivery order before the delivery deadline", () => {
    const result = getDeliveryDeadlineState(
      {
        status: "SHIPPED",
        delivery_type: "delivery",
        delivery_deadline: "2026-04-30T10:00:00.000Z",
      },
      new Date("2026-04-29T10:00:00.000Z")
    );

    expect(result).toMatchObject({
      canMarkDelivered: true,
      reason: SELLER_DELIVERY_DEADLINE_REASONS.AVAILABLE,
    });
  });

  it("still allows a shipped delivery order after the delivery deadline while review is pending", () => {
    const result = getDeliveryDeadlineState(
      {
        status: "SHIPPED",
        delivery_type: "delivery",
        delivery_deadline: "2026-04-30T10:00:00.000Z",
      },
      new Date("2026-04-30T10:00:00.000Z")
    );

    expect(result).toMatchObject({
      canMarkDelivered: true,
      reason: SELLER_DELIVERY_DEADLINE_REASONS.EXPIRED,
    });
  });

  it("blocks a shipped delivery order with no delivery deadline", () => {
    const result = getDeliveryDeadlineState(
      {
        status: "SHIPPED",
        delivery_type: "delivery",
      },
      new Date("2026-04-29T10:00:00.000Z")
    );

    expect(result).toMatchObject({
      canMarkDelivered: false,
      reason: SELLER_DELIVERY_DEADLINE_REASONS.MISSING,
    });
  });
});

describe("seller order transition RPCs", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("marks an order shipped through the seller RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: "order-1" }, error: null });

    await expect(markSellerOrderShipped("order-1")).resolves.toEqual({ id: "order-1" });

    expect(rpcMock).toHaveBeenCalledWith("seller_mark_order_shipped", {
      p_order_id: "order-1",
    });
  });

  it("marks an order delivered through the seller RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: "order-2" }, error: null });

    await expect(markSellerOrderDelivered("order-2")).resolves.toEqual({ id: "order-2" });

    expect(rpcMock).toHaveBeenCalledWith("seller_mark_order_delivered", {
      p_order_id: "order-2",
    });
  });

  it("maps an expired delivery deadline error", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Delivery deadline has passed. This order will be refunded automatically." },
    });

    await expect(markSellerOrderDelivered("order-3")).rejects.toThrow(
      "The 14-day delivery target has passed. You can still mark this order delivered while admin review is pending."
    );
  });
});

describe("getSellerOrderTransitionMessage", () => {
  it("maps missing delivery deadline errors", () => {
    expect(
      getSellerOrderTransitionMessage({
        message: "Delivery deadline is missing. Please contact support.",
      })
    ).toBe("Delivery deadline is missing. Please contact support.");
  });
});
