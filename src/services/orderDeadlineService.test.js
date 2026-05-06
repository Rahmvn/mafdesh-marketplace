import { renderHook, waitFor } from "@testing-library/react";
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
  getOrderDeadlineCatchUpTargets,
  getOrderDeadlineProcessingKey,
  processOrderDeadline,
  useOrderDeadlineAutoProcessing,
} from "./orderDeadlineService";

describe("orderDeadlineService", () => {
  let consoleInfoSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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
      data: { success: true, processed: true, reason: "processed", results: ["Updated order"] },
      error: null,
      response: { status: 200 },
    });
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
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

  it("collects unique overdue catch-up targets and skips blocked orders", () => {
    const result = getOrderDeadlineCatchUpTargets(
      [
        {
          id: "order-1",
          status: "PAID_ESCROW",
          ship_deadline: "2026-05-03T10:00:00Z",
        },
        {
          id: "order-2",
          status: "READY_FOR_PICKUP",
          auto_cancel_at: "2026-05-03T10:00:00Z",
          has_active_hold: true,
        },
        {
          id: "order-1",
          status: "PAID_ESCROW",
          ship_deadline: "2026-05-03T10:00:00Z",
        },
      ],
      { now: new Date("2026-05-03T10:00:01Z") }
    );

    expect(result).toEqual([
      {
        orderId: "order-1",
        key: "ship:order-1:2026-05-03T10:00:00Z",
      },
    ]);
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
      reason: "processed",
      results: ["Updated order"],
    });
  });

  it("processes a visible overdue order only once per deadline key and reloads after success", async () => {
    const processOrder = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        processed: true,
        reason: "processed",
        results: ["Refunded 1 order"],
      })
      .mockResolvedValueOnce({
        success: true,
        processed: false,
        reason: "blocked_by_hold",
        results: [],
      });
    const onProcessed = vi.fn().mockResolvedValue(undefined);
    const firstOrder = {
      id: "order-7",
      status: "PAID_ESCROW",
      ship_deadline: "2026-05-03T10:00:00Z",
    };

    const { rerender } = renderHook(
      ({ orders, now }) =>
        useOrderDeadlineAutoProcessing({
          orders,
          now,
          onProcessed,
          processOrder,
          debugLabel: "test auto-processing",
        }),
      {
        initialProps: {
          orders: [firstOrder],
          now: new Date("2026-05-03T10:00:01Z"),
        },
      }
    );

    await waitFor(() => {
      expect(processOrder).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onProcessed).toHaveBeenCalledTimes(1);
    });

    rerender({
      orders: [firstOrder],
      now: new Date("2026-05-03T10:30:00Z"),
    });

    await waitFor(() => {
      expect(processOrder).toHaveBeenCalledTimes(1);
    });

    rerender({
      orders: [
        {
          ...firstOrder,
          ship_deadline: "2026-05-04T10:00:00Z",
        },
      ],
      now: new Date("2026-05-04T10:00:01Z"),
    });

    await waitFor(() => {
      expect(processOrder).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(onProcessed).toHaveBeenCalledTimes(1);
    });
  });
});
