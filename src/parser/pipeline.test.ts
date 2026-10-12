/**
 * Worker pipeline coverage (E2-6): zip and plain-text imports, chat-file
 * selection, zip safety, error codes, on-demand media extraction, and the
 * progress phases E3-2 renders. Zips are built in memory with `fflate`, so the
 * tests exercise the real archive reader without committing binaries.
 */

import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { ParseResult } from '../types/chat.ts';
import { createParserSession } from './pipeline.ts';
import { MAX_UNCOMPRESSED_BYTES } from './zip.ts';
import { fixtures } from './fixtures/index.ts';

/** A `File` that works under jsdom (which has no `File#arrayBuffer`). */
function makeFile(bytes: Uint8Array<ArrayBuffer>, name: string): File {
  return new File([bytes], name, { type: 'application/octet-stream' });
}

function textFile(text: string, name = '_chat.txt'): File {
  return makeFile(new TextEncoder().encode(text), name);
}

function zipFile(entries: Record<string, Uint8Array>, name = 'export.zip'): File {
  return makeFile(zipSync(entries), name);
}

/**
 * Rewrite a stored entry's uncompressed size in the central directory, so the
 * 2 GB cap (PRD S-6) can be tested without building a giant archive.
 */
function withClaimedSize(zip: Uint8Array<ArrayBuffer>, size: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(zip);
  const view = new DataView(out.buffer);
  for (let i = 0; i + 4 <= out.length; i += 1) {
    if (view.getUint32(i, true) !== 0x02014b50) continue; // central directory header
    view.setUint32(i + 24, size, true);
    break;
  }
  return out;
}

async function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function parse(file: File, dateOrder: 'DMY' | 'MDY' | null = 'MDY') {
  const session = createParserSession();
  const phases: string[] = [];
  return session
    .parse(file, dateOrder, (progress) => phases.push(progress.phase))
    .then((result) => ({ result, phases, session }));
}

function expectOk(result: ParseResult) {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.chat;
}

describe('createParserSession: plain text', () => {
  it('parses a .txt export and reports the phases (E3-2)', async () => {
    const { result, phases } = await parse(
      textFile(fixtures['android-en-md-24h'], 'WhatsApp Chat with Mira Vale.txt'),
    );
    const chat = expectOk(result);
    expect(chat.meta.title).toBe('Mira Vale');
    expect(chat.meta.isGroup).toBe(false);
    expect(chat.messages.length).toBeGreaterThan(0);
    expect(phases).toEqual(['reading', 'reading', 'parsing', 'parsing', 'ready']);
  });

  it('never reads media bytes for a .txt import', async () => {
    const { result, session } = await parse(textFile(fixtures['txt-only'], 'txt-only.txt'));
    expectOk(result);
    await expect(session.extract('IMG-20260713-WA0000.jpg')).resolves.toBeNull();
    session.dispose();
  });

  it('reports an undecidable date order as a user choice (F-PAR-3)', async () => {
    const { result } = await parse(
      textFile('6/3/26, 10:00 - A: hi\n6/3/26, 10:01 - B: ok', 'chat.txt'),
      null,
    );
    expect(result).toMatchObject({ ok: false, needsUserChoice: true });
    if (result.ok || !('needsUserChoice' in result)) throw new Error('expected choice');
    expect(result.samples.length).toBeGreaterThan(0);
    expect(result.samples[0].asDMY).not.toBe(result.samples[0].asMDY);
  });

  it('applies a user-supplied date order without detecting (E3-3)', async () => {
    const { result } = await parse(
      textFile('6/3/26, 10:00 - A: hi\n6/3/26, 10:01 - B: ok', 'chat.txt'),
      'DMY',
    );
    expect(expectOk(result).meta.dateOrder).toBe('DMY');
  });

  it('rejects text with no header as an unrecognized format (F-IMP-4)', async () => {
    const { result } = await parse(textFile('just some words\nand more words', 'notes.txt'));
    expect(result).toEqual({ ok: false, error: { code: 'unrecognized-format' } });
  });
});

describe('createParserSession: zip', () => {
  const chatText = fixtures['android-en-md-24h'];

  it('finds the chat file, parses it and resolves attachments (F-IMP-2)', async () => {
    const { result, phases } = await parse(
      zipFile({
        'WhatsApp Chat with Mira Vale.txt': strToU8(chatText),
        'IMG-20260704-WA0000.jpg': strToU8('jpeg-bytes'),
        'PTT-20260801-WA0001.opus': strToU8('opus-bytes'),
      }),
    );
    const chat = expectOk(result);
    expect(chat.meta.title).toBe('Mira Vale');
    const media = chat.messages.filter((message) => message.kind === 'media');
    expect(media.length).toBeGreaterThan(0);
    const image = media.find(
      (message) => message.kind === 'media' && message.media.kind === 'image',
    );
    expect(image).toMatchObject({
      media: { resolved: true, entryName: 'IMG-20260704-WA0000.jpg' },
    });
    expect(phases).toContain('unzipping');
    expect(phases.at(-1)).toBe('ready');
  });

  it('prefers _chat.txt when several text files exist', async () => {
    const { result } = await parse(
      zipFile({
        '_chat.txt': strToU8('6/2/26, 21:36 - Lena Brooks: from ios'),
        'notes.txt': strToU8('x'.repeat(500)),
      }),
    );
    const chat = expectOk(result);
    expect(chat.meta.title).toBe('Lena Brooks');
  });

  it('falls back to the largest .txt when no known name matches', async () => {
    const { result } = await parse(
      zipFile({
        'a.txt': strToU8('6/2/26, 21:36 - Small Chat: hi'),
        'b.txt': strToU8(
          `6/2/26, 21:36 - Big Chat: hi\n${'6/2/26, 21:37 - Big Chat: more\n'.repeat(40)}`,
        ),
      }),
    );
    expect(expectOk(result).meta.title).toBe('Big Chat');
  });

  it('marks a referenced-but-absent media file unresolved (F-VIEW-12)', async () => {
    const { result } = await parse(zipFile({ '_chat.txt': strToU8(chatText) }));
    const chat = expectOk(result);
    const media = chat.messages.filter((message) => message.kind === 'media');
    expect(media.length).toBeGreaterThan(0);
    for (const message of media) {
      if (message.kind === 'media') expect(message.media.resolved).toBe(false);
    }
  });

  it('reports no-chat-file when the zip has no .txt', async () => {
    const { result } = await parse(zipFile({ 'IMG-1.jpg': strToU8('bytes') }));
    expect(result).toEqual({ ok: false, error: { code: 'no-chat-file' } });
  });

  it('reports corrupted-zip for bytes that are not an archive', async () => {
    const { result } = await parse(
      makeFile(new TextEncoder().encode('definitely not a zip file'), 'broken.zip'),
    );
    expect(result).toEqual({ ok: false, error: { code: 'corrupted-zip' } });
  });

  it('reports too-large when the uncompressed total exceeds the cap (S-6)', async () => {
    const zip = zipSync({ '_chat.txt': strToU8(fixtures['android-en-md-24h']) });
    const oversized = withClaimedSize(zip, MAX_UNCOMPRESSED_BYTES + 1);
    const { result } = await parse(makeFile(oversized, 'huge.zip'));
    expect(result).toEqual({ ok: false, error: { code: 'too-large' } });
  });

  it('ignores traversal and absolute entries (S-6)', async () => {
    const { result, session } = await parse(
      zipFile({
        '_chat.txt': strToU8(chatText),
        '../escape.txt': strToU8('6/2/26, 21:36 - Evil: hi'),
        '/etc/passwd.txt': strToU8('root:x:0:0'),
        'media/IMG-20260704-WA0000.jpg': strToU8('safe-bytes'),
      }),
    );
    const chat = expectOk(result);
    const image = chat.messages.find((message) => message.kind === 'media');
    expect(image).toMatchObject({
      media: { resolved: true, entryName: 'media/IMG-20260704-WA0000.jpg' },
    });
    await expect(session.extract('../escape.txt')).resolves.toBeNull();
    await expect(session.extract('/etc/passwd.txt')).resolves.toBeNull();
    session.dispose();
  });
});

describe('createParserSession: extract', () => {
  it('inflates one entry on demand and returns its bytes (E5-1)', async () => {
    const payload = new TextEncoder().encode('the media bytes');
    const { result, session } = await parse(
      zipFile({ '_chat.txt': strToU8(fixtures['android-en-md-24h']), 'IMG-1.jpg': payload }),
    );
    expectOk(result);
    const blob = await session.extract('IMG-1.jpg');
    expect(blob).not.toBeNull();
    expect(Array.from(await readBlob(blob as Blob))).toEqual(Array.from(payload));
    session.dispose();
  });

  it('returns null for a missing entry', async () => {
    const { result, session } = await parse(
      zipFile({ '_chat.txt': strToU8(fixtures['android-en-md-24h']) }),
    );
    expectOk(result);
    await expect(session.extract('IMG-nope.jpg')).resolves.toBeNull();
    session.dispose();
  });

  it('returns null after dispose (F-NAV-6)', async () => {
    const { result, session } = await parse(
      zipFile({ '_chat.txt': strToU8(fixtures['android-en-md-24h']), 'IMG-1.jpg': strToU8('x') }),
    );
    expectOk(result);
    session.dispose();
    await expect(session.extract('IMG-1.jpg')).resolves.toBeNull();
  });

  it('returns null before any parse has run', async () => {
    const session = createParserSession();
    await expect(session.extract('IMG-1.jpg')).resolves.toBeNull();
    session.dispose();
  });

  it('drops the previous archive when a new parse starts', async () => {
    const session = createParserSession();
    await session.parse(
      zipFile({ '_chat.txt': strToU8(fixtures['android-en-md-24h']), 'IMG-1.jpg': strToU8('one') }),
      'MDY',
      () => {},
    );
    await session.parse(textFile(fixtures['android-en-md-24h'], 'chat.txt'), 'MDY', () => {});
    await expect(session.extract('IMG-1.jpg')).resolves.toBeNull();
    session.dispose();
  });
});

describe('createParserSession: chat metadata', () => {
  it('detects a group from the group fixture', async () => {
    const { result } = await parse(
      zipFile({ '_chat.txt': strToU8(fixtures['group-android-en']) }),
      'DMY',
    );
    const chat = expectOk(result);
    expect(chat.meta.isGroup).toBe(true);
    expect(chat.participants.length).toBeGreaterThan(2);
    expect(chat.guessedMeId).toBeNull();
  });

  it('guesses "me" as the non-title sender in a personal chat (F-NAV-1)', async () => {
    const { result } = await parse(
      zipFile({ 'WhatsApp Chat with Grace Oduya.txt': strToU8(fixtures['android-no-media']) }),
    );
    const chat = expectOk(result);
    expect(chat.guessedMeId).toBe('Sam Reyes');
    expect(chat.messages.filter((m) => m.outgoing).length).toBeGreaterThan(0);
  });

  it('falls back to the first sender when the filename carries no title', async () => {
    const { result } = await parse(zipFile({ '_chat.txt': strToU8(fixtures['android-no-media']) }));
    const chat = expectOk(result);
    expect(chat.meta.title).toBe('Grace Oduya');
    expect(chat.guessedMeId).toBe('Sam Reyes');
  });

  it('keeps the export clock style (F-VIEW-2)', async () => {
    const { result } = await parse(
      zipFile({ '_chat.txt': strToU8(fixtures['android-en-md-12h']) }),
    );
    expect(expectOk(result).meta.clockStyle).toBe('12h');
  });

  it('reports the message count and timestamp range', async () => {
    const { result } = await parse(zipFile({ '_chat.txt': strToU8(fixtures['android-no-media']) }));
    const chat = expectOk(result);
    expect(chat.meta.messageCount).toBe(chat.messages.length);
    expect(chat.meta.firstTimestamp).toBeLessThanOrEqual(chat.meta.lastTimestamp);
    expect(chat.meta.firstTimestamp).toBeGreaterThan(0);
  });

  it('reclassifies the colon-split notice as a system message (E2-5)', async () => {
    const { result } = await parse(
      zipFile({ '_chat.txt': strToU8(fixtures['group-colon-notice']) }),
      'MDY',
    );
    const chat = expectOk(result);
    const subject = chat.messages.find(
      (message) => message.kind === 'system' && message.text.includes('changed the subject'),
    );
    expect(subject).toBeDefined();
    expect(chat.participants.some((p) => p.id.includes('changed the subject'))).toBe(false);
  });
});
