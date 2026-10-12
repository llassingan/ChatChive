/**
 * Formatting coverage (E4-2, E4-5). The day labels are checked against a fixed
 * `now` so the suite does not change with the calendar, and the clock style is
 * checked in both the shapes an export can carry.
 */

import { describe, expect, it } from 'vitest';
import { dayKey, formatBytes, formatClock, formatDayLabel } from './format.ts';

/** A local-time timestamp for a wall-clock moment, the convention `/chat.ts` uses. */
function at(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

describe('formatClock', () => {
  it('renders 24h exactly as the export wrote it', () => {
    const evening = at(2026, 6, 2, 21, 36);
    expect(formatClock(evening, '24h')).toMatch(/21[:.]36/);
  });

  it('renders 12h with a meridiem', () => {
    const evening = at(2026, 6, 2, 21, 36);
    expect(formatClock(evening, '12h')).toMatch(/9[:.]36\s?(PM|pm)/);
  });

  it('keeps midnight and noon distinct in 12h', () => {
    expect(formatClock(at(2026, 6, 2, 0, 5), '12h')).toMatch(/12[:.]05\s?(AM|am)/);
    expect(formatClock(at(2026, 6, 2, 12, 5), '12h')).toMatch(/12[:.]05\s?(PM|pm)/);
  });
});

describe('dayKey', () => {
  it('groups messages by local day regardless of the hour', () => {
    expect(dayKey(at(2026, 6, 2, 0, 1))).toBe('2026-06-02');
    expect(dayKey(at(2026, 6, 2, 23, 59))).toBe('2026-06-02');
  });

  it('separates adjacent days', () => {
    expect(dayKey(at(2026, 6, 2, 23, 59))).not.toBe(dayKey(at(2026, 6, 3, 0, 1)));
  });
});

describe('formatDayLabel', () => {
  const now = at(2026, 6, 10, 9);

  it('names today and yesterday', () => {
    expect(formatDayLabel(at(2026, 6, 10, 1), now)).toBe('Today');
    expect(formatDayLabel(at(2026, 6, 9, 23), now)).toBe('Yesterday');
  });

  it('names the weekday within the last week', () => {
    // Two days before a Wednesday is a Monday.
    expect(formatDayLabel(at(2026, 6, 8), now)).toMatch(/^Monday$/);
    expect(formatDayLabel(at(2026, 6, 5), now)).toMatch(/^Friday$/);
  });

  it('falls back to a full date at and beyond a week', () => {
    const label = formatDayLabel(at(2026, 6, 3), now);
    expect(label).toContain('2026');
    expect(label).not.toBe('Today');
    expect(label).not.toMatch(/^Monday$/);
  });
});

describe('formatBytes', () => {
  it('scales to the right unit and drops the decimal above ten', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1024 * 1024 * 3)).toBe('3 MB');
    expect(formatBytes(1024 * 1024 * 12.5)).toBe('13 MB');
  });

  it('returns null for an unknown or empty size', () => {
    expect(formatBytes(undefined)).toBeNull();
    expect(formatBytes(0)).toBeNull();
  });
});
