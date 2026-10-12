import { describe, expect, it } from 'vitest';
import { parseLine, toEpochMs, type HeaderLine } from './header.ts';
import { splitLines } from './text.ts';
import { fixtureNames, fixtures } from './fixtures/index.ts';

function headersOf(text: string): HeaderLine[] {
  return splitLines(text)
    .map(parseLine)
    .filter((p): p is HeaderLine => p.type === 'header');
}

describe('parseLine: Android', () => {
  it('parses a 24h header with sender and body', () => {
    const line = parseLine('6/2/26, 21:36 - Mira Vale: Pagi kak');
    expect(line).toMatchObject({
      type: 'header',
      platform: 'android',
      sender: 'Mira Vale',
      body: 'Pagi kak',
    });
    if (line.type === 'header') {
      expect(line.timestamp).toMatchObject({
        first: 6,
        second: 2,
        year: 2026,
        hour: 21,
        minute: 36,
        clockStyle: '24h',
      });
    }
  });

  it('parses a 12h header and records the meridiem', () => {
    const line = parseLine('6/28/26, 7:05 AM - Owen Clarke: Morning');
    if (line.type !== 'header') throw new Error('expected header');
    expect(line.timestamp.clockStyle).toBe('12h');
    expect(line.timestamp.meridiem).toBe('am');
    expect(line.timestamp.hour).toBe(7);
  });

  it('treats a 4-digit year and dot-time (id locale) as a header', () => {
    const line = parseLine('02/06/2026, 21.36 - Pesan dienkripsi');
    if (line.type !== 'header') throw new Error('expected header');
    expect(line.timestamp.year).toBe(2026);
    expect(line.timestamp.minute).toBe(36);
    expect(line.sender).toBeNull();
  });

  it('reads a header with no Sender as a system line', () => {
    const line = parseLine(
      '6/2/26, 21:36 - Messages and calls are end-to-end encrypted. *Learn more*',
    );
    if (line.type !== 'header') throw new Error('expected header');
    expect(line.sender).toBeNull();
    expect(line.body).toContain('end-to-end encrypted');
  });

  it('keeps an empty body (no text after the sender colon)', () => {
    const line = parseLine('6/3/26, 07:18 - Toko Senja:');
    if (line.type !== 'header') throw new Error('expected header');
    expect(line.sender).toBe('Toko Senja');
    expect(line.body).toBe('');
  });
});

describe('parseLine: iOS', () => {
  it('parses a bracketed header with seconds and strips invisible chars', () => {
    const line = parseLine('[6/28/26, 7:06:01\u202FAM] Theo Marsh: \u200E<attached: file.jpg>');
    if (line.type !== 'header') throw new Error('expected header');
    expect(line.platform).toBe('ios');
    expect(line.timestamp.secondOfMinute).toBe(1);
    expect(line.timestamp.meridiem).toBe('am');
    expect(line.sender).toBe('Theo Marsh');
    expect(line.body).toBe('<attached: file.jpg>');
    expect(line.raw).not.toContain('\u200E');
  });

  it('parses an iOS dot-time 24h header', () => {
    const line = parseLine('[02/06/26, 21.36.05] Pesan dienkripsi');
    if (line.type !== 'header') throw new Error('expected header');
    expect(line.timestamp.clockStyle).toBe('24h');
    expect(line.timestamp.secondOfMinute).toBe(5);
    expect(line.sender).toBeNull();
  });
});

describe('parseLine: continuations and malformed lines', () => {
  it('reports a non-header line as a continuation', () => {
    const line = parseLine('boleh tanya ini kenapa ya');
    expect(line.type).toBe('continuation');
    if (line.type === 'continuation') {
      expect(line.text).toBe('boleh tanya ini kenapa ya');
    }
  });

  it('reports a blank line as a continuation', () => {
    expect(parseLine('').type).toBe('continuation');
  });

  it('never throws on garbage input', () => {
    const nasty = ['[[[', '/// - :', '12/', '::::', '🔥', '[6/2/'];
    for (const value of nasty) {
      expect(() => parseLine(value)).not.toThrow();
    }
  });
});

describe('toEpochMs', () => {
  it('maps 12h AM/PM to 24h hours', () => {
    const base = { first: 6, second: 28, year: 2026, minute: 0, secondOfMinute: 0 } as const;
    const midnight = toEpochMs({ ...base, hour: 12, clockStyle: '12h', meridiem: 'am' }, 'MDY');
    const noon = toEpochMs({ ...base, hour: 12, clockStyle: '12h', meridiem: 'pm' }, 'MDY');
    const onePm = toEpochMs({ ...base, hour: 1, clockStyle: '12h', meridiem: 'pm' }, 'MDY');
    expect(new Date(midnight).getHours()).toBe(0);
    expect(new Date(noon).getHours()).toBe(12);
    expect(new Date(onePm).getHours()).toBe(13);
  });

  it('applies date order when choosing day vs month', () => {
    const ts = {
      first: 7,
      second: 4,
      year: 2026,
      hour: 15,
      minute: 33,
      secondOfMinute: 0,
      clockStyle: '24h',
    } as const;
    const mdy = new Date(toEpochMs(ts, 'MDY'));
    const dmy = new Date(toEpochMs(ts, 'DMY'));
    expect(mdy.getMonth()).toBe(6); // July
    expect(mdy.getDate()).toBe(4);
    expect(dmy.getMonth()).toBe(3); // April
    expect(dmy.getDate()).toBe(7);
  });
});

describe('every fixture parses into headers without throwing', () => {
  it.each(fixtureNames)('%s', (name) => {
    const text = fixtures[name];
    expect(() => splitLines(text).map(parseLine)).not.toThrow();
    expect(headersOf(text).length).toBeGreaterThan(0);
  });

  it('finds the expected senders in the group fixture', () => {
    const senders = new Set(
      headersOf(fixtures['group-android-en'])
        .map((h) => h.sender)
        .filter((s): s is string => s !== null),
    );
    expect(senders.has('Nadia Rush')).toBe(true);
    expect(senders.has('Felix Dorn')).toBe(true);
    expect(senders.has('Priya Noor')).toBe(true);
    expect(senders.has('+1 555 019 2834')).toBe(true);
  });

  it('every iOS fixture header is recognized as the ios platform', () => {
    for (const name of ['ios-en-us', 'ios-id-id'] as const) {
      for (const header of headersOf(fixtures[name])) {
        expect(header.platform).toBe('ios');
      }
    }
  });
});
