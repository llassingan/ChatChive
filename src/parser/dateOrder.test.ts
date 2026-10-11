import { describe, expect, it } from 'vitest';
import { detectDateOrder } from './dateOrder.ts';
import { fixtures } from './fixtures/index.ts';

describe('detectDateOrder — unambiguous data', () => {
  it('detects MDY when a second part exceeds 12', () => {
    const result = detectDateOrder('6/27/26, 22:44 - A: hi');
    expect(result).toEqual({ order: 'MDY' });
  });

  it('detects DMY when a first part exceeds 12', () => {
    const result = detectDateOrder('27/06/2026, 08.10 - A: hi');
    expect(result).toEqual({ order: 'DMY' });
  });

  it('decides from the first decisive header and ignores later ones', () => {
    const text = ['6/2/26, 10:00 - A: ambiguous', '27/6/26, 10:00 - A: decisive'].join('\n');
    expect(detectDateOrder(text)).toEqual({ order: 'DMY' });
  });
});

describe('detectDateOrder — fixtures', () => {
  it.each([
    ['android-en-md-24h', 'MDY'],
    ['android-en-md-12h', 'MDY'],
    ['android-no-media', 'MDY'],
    ['android-id-dm-24h', 'DMY'],
    ['ios-en-us', 'MDY'],
    ['ios-id-id', 'DMY'],
    ['txt-only', 'DMY'],
  ] as const)('%s resolves to %s', (name, order) => {
    expect(detectDateOrder(fixtures[name])).toEqual({ order });
  });
});

describe('detectDateOrder — ambiguous data', () => {
  it('returns a user choice with distinct previews for the group fixture', () => {
    const result = detectDateOrder(fixtures['group-android-en']);
    if (!('needsUserChoice' in result)) {
      throw new Error('expected the all-small-dates group fixture to be ambiguous');
    }
    expect(result.needsUserChoice).toBe(true);
    expect(result.samples.length).toBeGreaterThan(0);
    expect(result.samples.length).toBeLessThanOrEqual(2);
    const sample = result.samples[0];
    expect(sample.raw).toMatch(/^\d/);
    expect(sample.asDMY).not.toBe(sample.asMDY);
  });

  it('returns an empty sample set when there are no headers at all', () => {
    const result = detectDateOrder('just a line with no header\nanother line');
    if (!('needsUserChoice' in result)) throw new Error('expected ambiguous');
    expect(result.samples).toEqual([]);
  });
});
