import { describe, expect, it } from "vitest";
import {
  formatTimeUntil,
  getRefundEligibility,
  getRefundReviewDeadline,
} from "./refundRequestService";

describe("getRefundEligibility", () => {
  it("allows refund requests immediately for paid escrow orders with no seller fulfillment", () => {
    const result = getRefundEligibility(
      {
        id: "order-1",
        status: "PAID_ESCROW",
        created_at: "2026-04-21T10:00:00.000Z",
      },
      [],
      new Date("2026-04-21T10:05:00.000Z")
    );

    expect(result).toMatchObject({
      eligible: true,
      pendingRequest: null,
      reason: "eligible",
    });
  });

  it("blocks refund requests once the seller has shipped", () => {
    const result = getRefundEligibility(
      {
        id: "order-2",
        status: "SHIPPED",
        created_at: "2026-04-21T10:00:00.000Z",
      },
      [],
      new Date("2026-04-21T10:05:00.000Z")
    );

    expect(result).toMatchObject({
      eligible: false,
      reason: "blocked_status",
    });
  });

  it("blocks refund requests when there is already a pending request", () => {
    const result = getRefundEligibility(
      {
        id: "order-3",
        status: "PAID_ESCROW",
        created_at: "2026-04-21T10:00:00.000Z",
      },
      [{ id: "refund-1", status: "pending" }],
      new Date("2026-04-21T10:05:00.000Z")
    );

    expect(result).toMatchObject({
      eligible: false,
      reason: "pending_request",
    });
  });
});

describe("refund review helpers", () => {
  it("builds a ten-day admin review deadline from the request creation time", () => {
    expect(
      getRefundReviewDeadline({
        created_at: "2026-04-21T10:00:00.000Z",
      })
    ).toBe("2026-05-01T10:00:00.000Z");
  });

  it("formats remaining time until the admin deadline", () => {
    expect(
      formatTimeUntil(
        "2026-05-01T10:00:00.000Z",
        new Date("2026-04-24T08:30:00.000Z")
      )
    ).toBe("7d 1h left");
  });
});
