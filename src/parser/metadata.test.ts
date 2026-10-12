/**
 * Chat metadata coverage (E2-5): title extraction, group detection, the
 * participant list (ids, colors, initials) and the "me" guess. The colon-split
 * repair is covered with the dedicated fixture (Sprint 1 open thread).
 */

import { describe, expect, it } from 'vitest';
import { parseLine, type HeaderLine } from './header.ts';
import { splitLines } from './text.ts';
import {
  analyzeSenders,
  colorIndexFor,
  detectGroup,
  guessMeId,
  initialFor,
  isPhoneNumber,
  normalizePhone,
  titleFromFileName,
} from './metadata.ts';
import { fixtures } from './fixtures/index.ts';

function headersOf(text: string): HeaderLine[] {
  return splitLines(text)
    .map(parseLine)
    .filter((line): line is HeaderLine => line.type === 'header');
}

describe('titleFromFileName', () => {
  it.each([
    ['WhatsApp Chat with No Hp besar.zip', 'No Hp besar'],
    ['WhatsApp Chat with No Hp besar.txt', 'No Hp besar'],
    ['WhatsApp Chat - Mira Vale.zip', 'Mira Vale'],
    ['WhatsApp Chat - Mira Vale.txt', 'Mira Vale'],
    ['/downloads/WhatsApp Chat with Ana.zip', 'Ana'],
  ])('reads %s as %s', (fileName, title) => {
    expect(titleFromFileName(fileName)).toBe(title);
  });

  it.each([['_chat.txt'], ['chat.txt'], ['export.zip']])(
    'returns null for %s so the caller falls back to a sender',
    (fileName) => {
      expect(titleFromFileName(fileName)).toBeNull();
    },
  );
});

describe('phone numbers', () => {
  it.each([
    ['+1 555 019 2834', true],
    ['+62 896-7816-8872', true],
    ['08123456789', true],
    ['Mira Vale', false],
    ['Toko Senja', false],
    ['12', false],
  ] as const)('isPhoneNumber(%s) → %s', (value, expected) => {
    expect(isPhoneNumber(value)).toBe(expected);
  });

  it('normalizes a formatted number to its stable id', () => {
    expect(normalizePhone('+1 555 019 2834')).toBe('+15550192834');
    expect(normalizePhone('+62 896-7816-8872')).toBe('+6289678168872');
  });
});

describe('participant presentation', () => {
  it('assigns a color index in 0..15, deterministically', () => {
    for (const id of ['Mira Vale', 'Toko Senja', '+15550192834']) {
      const index = colorIndexFor(id);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(15);
      expect(colorIndexFor(id)).toBe(index);
    }
  });

  it('gives different senders different colors in a small sample', () => {
    const indexes = ['Mira Vale', 'Toko Senja', 'Nadia Rush', 'Felix Dorn'].map(colorIndexFor);
    expect(new Set(indexes).size).toBeGreaterThan(1);
  });

  it('uppercases the first letter for the avatar', () => {
    expect(initialFor('mira vale')).toBe('M');
    expect(initialFor('+1 555 019 2834')).toBe('1');
    expect(initialFor('éclair')).toBe('É');
    expect(initialFor('🔒')).toBe('?');
  });
});

describe('analyzeSenders', () => {
  it('collects senders in first-appearance order', () => {
    const headers = headersOf(
      ['6/2/26, 21:36 - A: one', '6/2/26, 21:37 - B: two', '6/2/26, 21:38 - A: three'].join('\n'),
    );
    const analysis = analyzeSenders(headers);
    expect(analysis.senders).toEqual(['A', 'B']);
    expect(analysis.participants.map((participant) => participant.id)).toEqual(['A', 'B']);
    expect(analysis.hasGroupNotice).toBe(false);
  });

  it('turns a formatted number into a participant with a phone number', () => {
    const headers = headersOf(
      ['6/2/26, 21:36 - +1 555 019 2834: hi', '6/2/26, 21:37 - Nadia Rush: hello'].join('\n'),
    );
    const analysis = analyzeSenders(headers);
    const phone = analysis.participants.find((p) => p.id === '+15550192834');
    expect(phone).toMatchObject({
      displayName: '+1 555 019 2834',
      phoneNumber: '+1 555 019 2834',
      initial: '1',
    });
  });

  it('rejects a mis-split notice whose sender never stands alone (E2-5)', () => {
    const headers = headersOf(fixtures['group-colon-notice']);
    const analysis = analyzeSenders(headers);
    expect(analysis.senders).toContain('Rosa Lund');
    expect(analysis.senders).toContain('Felix Dorn');
    expect(analysis.senders.some((sender) => sender.includes('changed the subject'))).toBe(false);
    expect(analysis.hasGroupNotice).toBe(true);
  });

  it('reports a mis-split notice through isSystemSender', () => {
    const headers = headersOf(fixtures['group-colon-notice']);
    const analysis = analyzeSenders(headers);
    const misSplit = headers.find((header) => header.sender?.includes('changed the subject'));
    expect(misSplit).toBeDefined();
    expect(analysis.isSystemSender(misSplit?.sender ?? '')).toBe(true);
  });

  it('flags a group notice among sender-less headers', () => {
    const headers = headersOf(
      '6/2/26, 20:00 - Priya Noor left\n6/2/26, 20:01 - A: hi\n6/2/26, 20:02 - B: ok',
    );
    expect(analyzeSenders(headers).hasGroupNotice).toBe(true);
  });

  it('does not flag the E2E notice as a group notice', () => {
    const headers = headersOf(fixtures['android-en-md-24h']);
    expect(analyzeSenders(headers).hasGroupNotice).toBe(false);
  });
});

describe('detectGroup', () => {
  it('is true with more than two senders', () => {
    expect(detectGroup(['A', 'B', 'C'], false)).toBe(true);
  });

  it('is true with a group notice even for two senders', () => {
    expect(detectGroup(['A', 'B'], true)).toBe(true);
  });

  it('is false for a personal chat', () => {
    expect(detectGroup(['A', 'B'], false)).toBe(false);
  });

  it('detects every group fixture as a group', () => {
    for (const name of ['group-android-en', 'group-colon-notice'] as const) {
      const analysis = analyzeSenders(headersOf(fixtures[name]));
      expect(detectGroup(analysis.senders, analysis.hasGroupNotice)).toBe(true);
    }
  });

  it('detects the personal fixtures as personal', () => {
    for (const name of ['android-no-media', 'android-en-md-12h', 'txt-only'] as const) {
      const analysis = analyzeSenders(headersOf(fixtures[name]));
      expect(detectGroup(analysis.senders, analysis.hasGroupNotice)).toBe(false);
    }
  });
});

describe('guessMeId', () => {
  it('picks the sender that is not the title (F-NAV-1)', () => {
    const analysis = analyzeSenders(headersOf(fixtures['android-no-media']));
    expect(
      guessMeId({
        isGroup: false,
        title: 'Grace Oduya',
        participants: analysis.participants,
      }),
    ).toBe('Sam Reyes');
  });

  it('returns null when the title matches nobody', () => {
    const analysis = analyzeSenders(headersOf('6/2/26, 21:36 - A: hi\n6/2/26, 21:37 - B: ok'));
    expect(
      guessMeId({
        isGroup: false,
        title: 'Someone Else',
        participants: analysis.participants,
      }),
    ).toBeNull();
  });

  it('returns null for a group so the picker asks (E3-4)', () => {
    const analysis = analyzeSenders(
      headersOf(
        [
          '6/2/26, 20:05 - Rosa Lund: one',
          '6/2/26, 20:06 - Felix Dorn: two',
          '6/2/26, 20:07 - Rosa Lund: three',
          '6/2/26, 20:08 - Rosa Lund: four',
        ].join('\n'),
      ),
    );
    expect(
      guessMeId({
        isGroup: true,
        title: 'Weekend Trip',
        participants: analysis.participants,
      }),
    ).toBeNull();
  });

  it('returns null when a single sender is also the title', () => {
    const analysis = analyzeSenders(headersOf('6/2/26, 21:36 - A: hi'));
    expect(
      guessMeId({
        isGroup: false,
        title: 'A',
        participants: analysis.participants,
      }),
    ).toBeNull();
  });
});
