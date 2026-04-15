import { describe, expect, it } from 'vitest';
import { formatRemaining, getUrgencyClass } from './timeUtils';

describe('timeUtils', () => {
  const now = new Date('2026-04-05T12:00:00Z');

  it('formats long durations using days and hours', () => {
    expect(formatRemaining('2026-04-07T15:00:00Z', now)).toBe('2d 3h');
  });

  it('formats expired deadlines clearly', () => {
    expect(formatRemaining('2026-04-05T11:59:00Z', now)).toBe('Expired');
  });

  it('returns high urgency styling for deadlines under six hours', () => {
    expect(getUrgencyClass('2026-04-05T15:00:00Z', now)).toBe('text-red-600 font-bold animate-pulse');
  });

  it('returns neutral styling for deadlines over one day away', () => {
    expect(getUrgencyClass('2026-04-07T12:00:00Z', now)).toBe('text-gray-600');
  });
});
