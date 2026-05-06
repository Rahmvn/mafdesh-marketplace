import { describe, expect, it } from "vitest";
import {
  formatBusinessDeadline,
  formatBusinessRemaining,
  formatLagosDeadline,
  formatRemaining,
  getBusinessTimeRemainingMilliseconds,
  getBusinessUrgencyClass,
  getUrgencyClass,
} from "./timeUtils";

describe("timeUtils", () => {
  const now = new Date("2026-04-05T12:00:00Z");

  it("formats long calendar durations using days and hours", () => {
    expect(formatRemaining("2026-04-07T15:00:00Z", now)).toBe("2d 3h");
  });

  it("formats expired calendar deadlines clearly", () => {
    expect(formatRemaining("2026-04-05T11:59:00Z", now)).toBe("Expired");
  });

  it("returns high urgency styling for calendar deadlines under six hours", () => {
    expect(getUrgencyClass("2026-04-05T15:00:00Z", now)).toBe(
      "text-red-600 font-bold animate-pulse"
    );
  });

  it("returns neutral styling for calendar deadlines over one day away", () => {
    expect(getUrgencyClass("2026-04-07T12:00:00Z", now)).toBe("text-gray-600");
  });

  it("counts Friday to Tuesday as two business days in Lagos", () => {
    const fridayMorning = new Date("2026-05-08T09:00:00Z");
    const tuesdayMorning = new Date("2026-05-12T09:00:00Z");

    expect(formatBusinessRemaining(tuesdayMorning, fridayMorning)).toBe(
      "2 business days left"
    );
    expect(formatBusinessDeadline(tuesdayMorning, fridayMorning)).toBe(
      `2 business days left • Due ${formatLagosDeadline(tuesdayMorning)}`
    );
  });

  it("freezes business countdown depletion over the weekend", () => {
    const saturdayMorning = new Date("2026-05-09T09:00:00Z");
    const tuesdayMorning = new Date("2026-05-12T09:00:00Z");

    expect(formatBusinessRemaining(tuesdayMorning, saturdayMorning)).toBe(
      "1 business day left"
    );
  });

  it("resumes business countdown on Monday using business hours", () => {
    const mondayMorning = new Date("2026-05-11T09:00:00Z");
    const mondayAfternoon = new Date("2026-05-11T15:30:00Z");
    const tuesdayMorning = new Date("2026-05-12T09:00:00Z");

    expect(formatBusinessRemaining(tuesdayMorning, mondayMorning)).toBe(
      "1 business day left"
    );
    expect(formatBusinessRemaining(tuesdayMorning, mondayAfternoon)).toBe(
      "17h 30m left"
    );
  });

  it("uses business-time urgency for business timers", () => {
    const saturdayMorning = new Date("2026-05-09T09:00:00Z");
    const mondayNoon = new Date("2026-05-11T12:00:00Z");

    expect(getBusinessUrgencyClass(mondayNoon, saturdayMorning)).toBe(
      "text-orange-600 font-semibold"
    );
  });

  it("returns zero business milliseconds when the deadline has passed", () => {
    expect(
      getBusinessTimeRemainingMilliseconds(
        "2026-05-11T09:00:00Z",
        "2026-05-11T10:00:00Z"
      )
    ).toBe(0);
  });
});
