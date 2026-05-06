const BUSINESS_DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;
const LAGOS_TIME_ZONE = "Africa/Lagos";
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

const lagosDeadlineFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LAGOS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRemainingMilliseconds(deadline, now = new Date()) {
  const deadlineDate = toDate(deadline);
  const nowDate = toDate(now) || new Date();

  if (!deadlineDate) {
    return null;
  }

  return deadlineDate.getTime() - nowDate.getTime();
}

function formatDuration(milliseconds) {
  const diff = Math.max(0, milliseconds);
  const days = Math.floor(diff / BUSINESS_DAY_MS);
  const hours = Math.floor((diff % BUSINESS_DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((diff % MINUTE_MS) / SECOND_MS);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getUrgencyClassFromMilliseconds(milliseconds) {
  if (milliseconds == null || Number.isNaN(milliseconds)) {
    return "";
  }

  if (milliseconds <= 0) {
    return "text-red-600 font-bold";
  }

  const hours = milliseconds / HOUR_MS;
  if (hours < 6) return "text-red-600 font-bold animate-pulse";
  if (hours < 24) return "text-orange-600 font-semibold";
  return "text-gray-600";
}

function toLagosShiftedDate(date) {
  return new Date(date.getTime() + LAGOS_OFFSET_MS);
}

function getLagosDayStart(date) {
  const lagosDate = toLagosShiftedDate(date);

  return new Date(
    Date.UTC(
      lagosDate.getUTCFullYear(),
      lagosDate.getUTCMonth(),
      lagosDate.getUTCDate()
    ) - LAGOS_OFFSET_MS
  );
}

function isWeekendInLagos(date) {
  const day = toLagosShiftedDate(date).getUTCDay();
  return day === 0 || day === 6;
}

export function getBusinessTimeRemainingMilliseconds(deadline, now = new Date()) {
  const deadlineDate = toDate(deadline);
  const nowDate = toDate(now) || new Date();

  if (!deadlineDate) {
    return null;
  }

  if (deadlineDate <= nowDate) {
    return 0;
  }

  let total = 0;
  let cursor = getLagosDayStart(nowDate);

  while (cursor.getTime() < deadlineDate.getTime()) {
    const nextCursor = new Date(cursor.getTime() + BUSINESS_DAY_MS);

    if (!isWeekendInLagos(cursor)) {
      const sliceStart = Math.max(cursor.getTime(), nowDate.getTime());
      const sliceEnd = Math.min(nextCursor.getTime(), deadlineDate.getTime());

      if (sliceEnd > sliceStart) {
        total += sliceEnd - sliceStart;
      }
    }

    cursor = nextCursor;
  }

  return total;
}

export function formatRemaining(deadline, now = new Date()) {
  const remainingMilliseconds = getRemainingMilliseconds(deadline, now);

  if (remainingMilliseconds == null) return null;
  if (remainingMilliseconds <= 0) return "Expired";

  return formatDuration(remainingMilliseconds);
}

export function getUrgencyClass(deadline, now = new Date()) {
  return getUrgencyClassFromMilliseconds(getRemainingMilliseconds(deadline, now));
}

export function formatBusinessRemaining(deadline, now = new Date()) {
  const remainingMilliseconds = getBusinessTimeRemainingMilliseconds(deadline, now);

  if (remainingMilliseconds == null) return null;
  if (remainingMilliseconds <= 0) return "Expired";

  const businessDays = Math.floor(remainingMilliseconds / BUSINESS_DAY_MS);
  if (businessDays >= 1) {
    return `${businessDays} business day${businessDays === 1 ? "" : "s"} left`;
  }

  const hours = Math.floor(remainingMilliseconds / HOUR_MS);
  const minutes = Math.floor((remainingMilliseconds % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((remainingMilliseconds % MINUTE_MS) / SECOND_MS);

  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}

export function getBusinessUrgencyClass(deadline, now = new Date()) {
  return getUrgencyClassFromMilliseconds(
    getBusinessTimeRemainingMilliseconds(deadline, now)
  );
}

export function formatLagosDeadline(deadline) {
  const deadlineDate = toDate(deadline);
  if (!deadlineDate) {
    return null;
  }

  return lagosDeadlineFormatter.format(deadlineDate);
}

export function formatBusinessDeadline(deadline, now = new Date()) {
  const remainingLabel = formatBusinessRemaining(deadline, now);
  const dueLabel = formatLagosDeadline(deadline);

  if (!remainingLabel || !dueLabel) {
    return remainingLabel;
  }

  if (remainingLabel === "Expired") {
    return remainingLabel;
  }

  return `${remainingLabel} • Due ${dueLabel}`;
}

export { LAGOS_TIME_ZONE };
