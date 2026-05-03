import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockInvoke,
  mockGetSessionWithRetry,
  mockGetUserWithRetry,
  mockRefreshSessionWithRetry,
  mockSignOut,
} = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockGetSessionWithRetry: vi.fn(),
  mockGetUserWithRetry: vi.fn(),
  mockRefreshSessionWithRetry: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      signOut: mockSignOut,
    },
    functions: {
      invoke: mockInvoke,
    },
  },
}));

vi.mock("../utils/authResilience", () => ({
  getSessionWithRetry: mockGetSessionWithRetry,
  getUserWithRetry: mockGetUserWithRetry,
  refreshSessionWithRetry: mockRefreshSessionWithRetry,
}));

import {
  getOrderDeadlineProcessingKey,
  processOrderDeadline,
} from "./orderDeadlineService";

describe("orderDeadlineService", () => {
  beforeEach(() => {
    mockGetSessionWithRetry.mockResolvedValue({
      data: { session: { access_token: "token-123" } },
      error: null,
    });
    mockGetUserWithRetry.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockRefreshSessionWithRetry.mockResolvedValue({
      data: { session: { access_token: "token-456" } },
      error: null,
    });
    mockInvoke.mockResolvedValue({
      data: { success: true, processed: true, results: ["Updated order"] },
      error: null,
      response: { status: 200 },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a shipping deadline key for expired paid orders", () => {
    const result = getOrderDeadlineProcessingKey(
      {
        id: "order-1",
        status: "PAID_ESCROW",
        ship_deadline: "2026-05-03T10:00:00Z",
      },
      { now: new Date("2026-05-03T10:00:01Z") }
    );

    expect(result).toBe("ship:order-1:2026-05-03T10:00:00Z");
  });

  it("skips shipped delivery orders during an active review buffer", () => {
    const result = getOrderDeadlineProcessingKey(
      {
        id: "order-2",
        status: "SHIPPED",
        delivery_type: "delivery",
        delivery_deadline: "2026-05-03T10:00:00Z",
        review_deadline_at: "2026-05-04T10:00:00Z",
      },
      { now: new Date("2026-05-03T12:00:00Z") }
    );

    expect(result).toBeNull();
  });

  it("returns a delivery review key after the review buffer expires", () => {
    const result = getOrderDeadlineProcessingKey(
      {
        id: "order-3",
        status: "SHIPPED",
        delivery_type: "delivery",
        delivery_deadline: "2026-05-01T10:00:00Z",
        review_deadline_at: "2026-05-02T10:00:00Z",
      },
      { now: new Date("2026-05-03T12:00:00Z") }
    );

    expect(result).toBe("delivery-review:order-3:2026-05-02T10:00:00Z");
  });

  it("does not return a key for final states", () => {
    const result = getOrderDeadlineProcessingKey(
      {
        id: "order-4",
        status: "COMPLETED",
        dispute_deadline: "2026-05-03T10:00:00Z",
      },
      { now: new Date("2026-05-03T12:00:00Z") }
    );

    expect(result).toBeNull();
  });

  it("invokes the deadline processor with the authenticated access token", async () => {
    const result = await processOrderDeadline("order-9");

    expect(mockInvoke).toHaveBeenCalledWith("process-order-deadlines", {
      headers: {
        Authorization: "Bearer token-123",
      },
      body: { orderId: "order-9" },
    });
    expect(result).toEqual({
      success: true,
      processed: true,
      results: ["Updated order"],
    });
  });
});
