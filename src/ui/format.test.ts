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
    // The expected names come from the same `Intl` call the module makes, not
    // from hardcoded English. `format.ts:19` builds its weekday formatter with
    // `Intl.DateTimeFormat(undefined, …)`, so it follows the HOST locale by
    // design (the module comment says so: "we render them in the viewer's
    // locale"). Asserting `/^Monday$/` made this test fail under `de-DE`
    // (`expected 'Montag' to match /^Monday$/`) for a reason unrelated to the
    // property it protects. What it really claims is that the label is the
    // weekday of the RIGHT day, and that is what is pinned below.
    const weekdayOf = (date: number) =>
      new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
    const monday = at(2026, 6, 8);
    const sunday = at(2026, 6, 7);

    // Two days before a Wednesday is a Monday, and three before is a Sunday.
    expect(formatDayLabel(monday, now)).toBe(weekdayOf(monday));
    expect(formatDayLabel(sunday, now)).toBe(weekdayOf(sunday));
    expect(formatDayLabel(at(2026, 6, 5), now)).toBe(weekdayOf(at(2026, 6, 5)));
    // Not merely "some weekday": the mapping to the correct day is the claim.
    expect(formatDayLabel(monday, now)).not.toBe(weekdayOf(sunday));
  });

  it('falls back to a full date at and beyond a week', () => {
    const label = formatDayLabel(at(2026, 6, 3), now);
    expect(label).toContain('2026');
    expect(label).not.toBe('Today');
    // Replaced a `not.toMatch(/^Monday$/)` that could not fail: the fallback
    // always carries a day number and a year, so it could never be a bare
    // weekday name whatever the implementation did. These two can fail, because a
    // weekday name has no digit and no year in it, and they pin the same
    // intent, that the label is the full-date branch and not the weekday one.
    expect(label).toMatch(/\d/);
    expect(label).not.toBe(
      new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(at(2026, 6, 3)),
    );
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
