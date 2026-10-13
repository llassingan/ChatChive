/**
 * Body classifier coverage (E2-4): attachments, omitted media, deleted, empty,
 * system, location and the never-throw fallback. Every fixture is parsed whole
 * so the classifier is exercised against the real formats, not just snippets.
 */

import { describe, expect, it } from 'vitest';
import type { Message } from '../types/chat.ts';
import { classifyMessages, mediaKindFor, type ClassifyContext } from './classifier.ts';
import { parseLine } from './header.ts';
import { splitLines } from './text.ts';
import { fixtureNames, fixtures } from './fixtures/index.ts';

function classify(text: string, overrides: Partial<ClassifyContext> = {}): Message[] {
  const ctx: ClassifyContext = {
    dateOrder: 'MDY',
    entries: [],
    meId: null,
    isSystemSender: () => false,
    participantId: (sender) => sender,
    ...overrides,
  };
  return classifyMessages(splitLines(text).map(parseLine), ctx);
}

describe('classifyMessages: text', () => {
  it('makes a text message with the body intact', () => {
    const [message] = classify('6/2/26, 21:36 - Mira Vale: Pagi kak');
    expect(message).toMatchObject({
      kind: 'text',
      senderId: 'Mira Vale',
      outgoing: false,
      text: 'Pagi kak',
    });
  });

  it('appends continuation lines to the previous message (F-PAR-4)', () => {
    const messages = classify(
      [
        '6/2/26, 21:36 - Mira Vale: *PAKET HEMAT*',
        'Berlaku sampai akhir bulan',
        'Hubungi kami dulu',
      ].join('\n'),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      kind: 'text',
      text: '*PAKET HEMAT*\nBerlaku sampai akhir bulan\nHubungi kami dulu',
    });
  });

  it('keeps an intentional blank line inside the body', () => {
    const [message] = classify(['6/2/26, 21:36 - A: one', '', 'two'].join('\n'));
    expect(message).toMatchObject({ kind: 'text', text: 'one\n\ntwo' });
  });

  it('keeps continuation lines that have no preceding header (F-PAR-10)', () => {
    const messages = classify(
      ['stray line one', 'stray line two', '6/2/26, 21:36 - A: hi'].join('\n'),
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ kind: 'text', text: 'stray line one\nstray line two' });
    expect(messages[1]).toMatchObject({ kind: 'text', text: 'hi' });
  });

  it('never throws on unknown content (F-PAR-10)', () => {
    const nasty = [
      '6/2/26, 21:36 - A: \u0000\uFFFD',
      '6/2/26, 21:36 - A: <script>alert(1)</script>',
    ];
    for (const line of nasty) {
      expect(() => classify(line)).not.toThrow();
    }
    expect(classify(nasty[1])[0]).toMatchObject({
      kind: 'text',
      text: '<script>alert(1)</script>',
    });
  });
});

describe('classifyMessages: attachments', () => {
  it('resolves an Android attachment marker against the entries (F-PAR-5)', () => {
    const [message] = classify('6/2/26, 21:36 - Mira Vale: IMG-1.jpg (file attached)', {
      entries: [{ name: 'IMG-1.jpg', size: 2048 }],
    });
    expect(message).toMatchObject({
      kind: 'media',
      media: {
        kind: 'image',
        entryName: 'IMG-1.jpg',
        fileName: 'IMG-1.jpg',
        mimeType: 'image/jpeg',
        byteSize: 2048,
        resolved: true,
      },
    });
  });

  it('takes the caption from the following continuation lines (F-PAR-4)', () => {
    const [message] = classify(
      ['6/2/26, 21:36 - Mira Vale: IMG-1.jpg (file attached)', 'Ini bukti transfernya kak'].join(
        '\n',
      ),
      { entries: [{ name: 'IMG-1.jpg', size: 10 }] },
    );
    expect(message).toMatchObject({ kind: 'media', caption: 'Ini bukti transfernya kak' });
  });

  it('omits the caption when there is none', () => {
    const [message] = classify('6/2/26, 21:36 - A: IMG-1.jpg (file attached)');
    expect(message).not.toHaveProperty('caption');
  });

  it('marks a missing file as unresolved (F-VIEW-12)', () => {
    const [message] = classify('6/2/26, 21:36 - A: IMG-404.jpg (file attached)');
    expect(message).toMatchObject({
      kind: 'media',
      media: { entryName: 'IMG-404.jpg', resolved: false },
    });
  });

  it('resolves by basename when the entry lives in a subfolder', () => {
    const [message] = classify('6/2/26, 21:36 - A: PTT-1.opus (file attached)', {
      entries: [{ name: 'media/PTT-1.opus', size: 5 }],
    });
    expect(message).toMatchObject({
      kind: 'media',
      media: { entryName: 'media/PTT-1.opus', kind: 'voice', resolved: true },
    });
  });

  it('parses the iOS <attached: …> marker', () => {
    const [message] = classify(
      '6/28/26, 7:06:01 AM - Theo Marsh: <attached: 00000012-PHOTO-2026-06-28.jpg>',
      { entries: [{ name: '00000012-PHOTO-2026-06-28.jpg', size: 99 }] },
    );
    expect(message).toMatchObject({
      kind: 'media',
      media: { kind: 'image', mimeType: 'image/jpeg', resolved: true },
    });
  });

  it.each([
    ['IMG-1.jpg', 'image'],
    ['PHOTO-1.jpg', 'image'],
    ['VID-1.mp4', 'video'],
    ['VIDEO-1.mp4', 'video'],
    ['PTT-1.opus', 'voice'],
    ['STK-1.webp', 'sticker'],
    ['STICKER-1.webp', 'sticker'],
    ['AUD-1.mp3', 'audio'],
    ['AUDIO-1.mp3', 'audio'],
    ['japreum.id.vcf', 'contact'],
    ['funny.gif', 'gif'],
    ['report.pdf', 'document'],
    ['archive.zip', 'document'],
  ] as const)('classifies %s as %s', (fileName, kind) => {
    expect(mediaKindFor(fileName)).toBe(kind);
  });

  it('guesses a MIME type from the extension', () => {
    const [message] = classify('6/2/26, 21:36 - A: report.pdf (file attached)');
    expect(message).toMatchObject({ media: { mimeType: 'application/pdf' } });
  });

  it('maps .webm to video/webm, which the media row plays', () => {
    const [message] = classify('6/2/26, 21:36 - A: VID-20260703-WA0004.webm (file attached)');
    expect(message).toMatchObject({ media: { mimeType: 'video/webm' } });
  });

  it('falls back to octet-stream for an unknown extension', () => {
    const [message] = classify('6/2/26, 21:36 - A: mystery.xyz (file attached)');
    expect(message).toMatchObject({ media: { mimeType: 'application/octet-stream' } });
  });
});

describe('classifyMessages: omitted, deleted, empty', () => {
  it.each([
    '<Media omitted>',
    'image omitted',
    'video omitted',
    'audio omitted',
    'sticker omitted',
    'GIF omitted',
    'document omitted',
    'Contact card omitted',
    'IMAGE OMITTED',
  ])('reads %s as an empty message (F-VIEW-12)', (body) => {
    const [message] = classify(`6/2/26, 21:36 - A: ${body}`);
    expect(message).toMatchObject({ kind: 'empty', senderId: 'A' });
  });

  it('reads a header with an empty body as empty', () => {
    const [message] = classify('6/3/26, 07:18 - Toko Senja:');
    expect(message).toMatchObject({ kind: 'empty', senderId: 'Toko Senja' });
  });

  it('reads "You deleted this message" as deleted by me', () => {
    const [message] = classify('6/2/26, 21:36 - A: You deleted this message', { meId: 'A' });
    expect(message).toMatchObject({ kind: 'deleted', byMe: true });
  });

  it('reads "This message was deleted" as deleted by someone else', () => {
    const [message] = classify('6/2/26, 21:36 - B: This message was deleted', { meId: 'A' });
    expect(message).toMatchObject({ kind: 'deleted', byMe: false });
  });

  it('uses the outgoing flag when the notice is the generic wording', () => {
    const [message] = classify('6/2/26, 21:36 - A: This message was deleted', { meId: 'A' });
    expect(message).toMatchObject({ kind: 'deleted', byMe: true });
  });
});

describe('classifyMessages: system notices', () => {
  it('reads a sender-less header as a generic system message', () => {
    const [message] = classify('6/2/26, 20:00 - Nadia Rush created group "Trip Planning"');
    expect(message).toMatchObject({ kind: 'system', senderId: null, system: 'generic' });
  });

  it('tags the E2E-encryption notice', () => {
    const [message] = classify(
      '6/2/26, 21:36 - Messages and calls are end-to-end encrypted. *Learn more*',
    );
    expect(message).toMatchObject({ kind: 'system', system: 'encryption' });
  });

  it('reclassifies a mis-split notice as a system message (E2-5)', () => {
    const [message] = classify(
      '7/2/26, 20:08 - Rosa Lund changed the subject to "Trip: Planning"',
      {
        isSystemSender: (sender) => sender.startsWith('Rosa Lund changed'),
      },
    );
    expect(message).toMatchObject({ kind: 'system', senderId: null });
    if (message.kind === 'system') {
      expect(message.text).toContain('changed the subject');
    }
  });
});

describe('classifyMessages: location', () => {
  it('reads a bare Google Maps link as a location media message', () => {
    const [message] = classify('6/2/26, 21:36 - A: https://maps.google.com/?q=-6.2,106.8');
    expect(message).toMatchObject({
      kind: 'media',
      media: { kind: 'location', resolved: false },
    });
  });

  it('reads a bare Apple Maps link as a location', () => {
    const [message] = classify('6/2/26, 21:36 - A: https://maps.apple.com/?ll=-6.2,106.8');
    expect(message).toMatchObject({ kind: 'media', media: { kind: 'location' } });
  });

  it('reads a dot-prefixed lat,lng pair as a location', () => {
    const [message] = classify('6/2/26, 21:36 - A: .-6.2088,106.8456');
    expect(message).toMatchObject({ kind: 'media', media: { kind: 'location' } });
  });

  it('keeps a maps link inside a sentence as plain text', () => {
    const [message] = classify(
      '6/2/26, 21:36 - A: meet here https://maps.google.com/?q=-6.2,106.8 tomorrow',
    );
    expect(message).toMatchObject({ kind: 'text' });
  });

  it('keeps a maps link with a caption as plain text', () => {
    const [message] = classify(
      ['6/2/26, 21:36 - A: https://maps.google.com/?q=-6.2,106.8', 'the cafe'].join('\n'),
    );
    expect(message).toMatchObject({ kind: 'text' });
  });
});

describe('classifyMessages: fixtures', () => {
  it.each(fixtureNames)('%s classifies without throwing', (name) => {
    expect(() => classify(fixtures[name])).not.toThrow();
  });

  it('gives every message a unique id and a known kind', () => {
    const messages = classify(fixtures['android-en-md-24h']);
    expect(messages.length).toBeGreaterThan(0);
    expect(new Set(messages.map((message) => message.id)).size).toBe(messages.length);
    for (const message of messages) {
      expect(['text', 'media', 'system', 'deleted', 'call', 'empty']).toContain(message.kind);
    }
  });

  it('classifies the android fixture media and its caption', () => {
    const messages = classify(fixtures['android-en-md-24h'], {
      entries: [
        { name: 'IMG-20260704-WA0000.jpg', size: 10 },
        { name: 'IMG-20260704-WA0002.jpg', size: 10 },
        { name: 'IMG-20260713-WA0000.jpg', size: 10 },
        { name: 'PTT-20260801-WA0001.opus', size: 10 },
        { name: 'STK-20260801-WA0003.webp', size: 10 },
      ],
    });
    const media = messages.filter((message) => message.kind === 'media');
    expect(media.map((message) => message.kind === 'media' && message.media.kind)).toEqual([
      'image',
      'image',
      'image',
      'voice',
      'sticker',
    ]);
    const captioned = messages.find(
      (message) => message.kind === 'media' && message.caption !== undefined,
    );
    expect(captioned).toMatchObject({ caption: 'boleh tanya ini kenapa ya' });
  });

  it('finds an empty message in the id fixture (Toko Pagi:)', () => {
    const messages = classify(fixtures['android-id-dm-24h']);
    expect(messages.some((message) => message.kind === 'empty')).toBe(true);
  });

  it('reads the omitted media in the text-only fixture as empty', () => {
    const messages = classify(fixtures['txt-only']);
    const empty = messages.find((message) => message.kind === 'empty');
    expect(empty).toMatchObject({ senderId: 'Elin Sato' });
  });

  it('keeps the text-only attachment marker unresolved (no zip entries)', () => {
    const messages = classify(fixtures['txt-only']);
    const media = messages.find((message) => message.kind === 'media');
    expect(media).toMatchObject({ media: { resolved: false, kind: 'image' } });
  });

  it('classifies the iOS attachment markers', () => {
    const messages = classify(fixtures['ios-en-us']);
    const media = messages.filter((message) => message.kind === 'media');
    expect(media.map((message) => message.kind === 'media' && message.media.kind)).toEqual([
      'image',
      'audio',
    ]);
  });
});
