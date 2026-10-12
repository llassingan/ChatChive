/**
 * Zip helper coverage (E2-6, S-6, F-IMP-2): path-traversal rejection, entry
 * listing, on-demand extraction and chat-file selection. The archive reader is
 * exercised through `openZip` on real in-memory zips rather than mocked bytes.
 */

import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { baseName, findChatFile, isUnsafePath, MAX_UNCOMPRESSED_BYTES, openZip } from './zip.ts';

function entry(name: string, size = 1) {
  return { name, size };
}

/** Patch the first entry's uncompressed size in the central directory. */
function withClaimedSize(zip: Uint8Array<ArrayBuffer>, size: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(zip);
  const view = new DataView(out.buffer);
  for (let i = 0; i + 4 <= out.length; i += 1) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;
    view.setUint32(i + 24, size, true);
    break;
  }
  return out;
}

describe('isUnsafePath', () => {
  it.each([
    ['../escape.txt', true],
    ['media/../../escape.txt', true],
    ['..\\escape.txt', true],
    ['/etc/passwd', true],
    ['\\windows\\system32', true],
    ['C:/Users/me/chat.txt', true],
    ['C:\\Users\\me\\chat.txt', true],
    ['_chat.txt', false],
    ['media/IMG-1.jpg', false],
    ['a..b/photo.jpg', false],
  ] as const)('isUnsafePath(%s) → %s', (name, expected) => {
    expect(isUnsafePath(name)).toBe(expected);
  });
});

describe('baseName', () => {
  it('strips POSIX and Windows directory parts', () => {
    expect(baseName('media/IMG-1.jpg')).toBe('IMG-1.jpg');
    expect(baseName('media\\IMG-1.jpg')).toBe('IMG-1.jpg');
    expect(baseName('_chat.txt')).toBe('_chat.txt');
  });
});

describe('findChatFile', () => {
  it('prefers _chat.txt over anything else', () => {
    expect(
      findChatFile([entry('WhatsApp Chat with Ana.txt'), entry('_chat.txt'), entry('notes.txt')]),
    ).toBe('_chat.txt');
  });

  it('prefers "WhatsApp Chat with X.txt" over the dash form', () => {
    expect(
      findChatFile([entry('WhatsApp Chat - Ana.txt'), entry('WhatsApp Chat with Ana.txt')]),
    ).toBe('WhatsApp Chat with Ana.txt');
  });

  it('accepts the dash form', () => {
    expect(findChatFile([entry('WhatsApp Chat - Ana.txt'), entry('photo.jpg')])).toBe(
      'WhatsApp Chat - Ana.txt',
    );
  });

  it('takes the only .txt when no name matches', () => {
    expect(findChatFile([entry('random.txt'), entry('photo.jpg')])).toBe('random.txt');
  });

  it('takes the largest .txt when several are unknown', () => {
    expect(
      findChatFile([entry('small.txt', 10), entry('big.txt', 900), entry('mid.txt', 50)]),
    ).toBe('big.txt');
  });

  it('matches the known names by basename, not the full path', () => {
    expect(findChatFile([entry('nested/WhatsApp Chat with Ana.txt')])).toBe(
      'nested/WhatsApp Chat with Ana.txt',
    );
  });

  it('returns null when there is no .txt at all', () => {
    expect(findChatFile([entry('IMG-1.jpg'), entry('PTT-1.opus')])).toBeNull();
  });

  it('is case-insensitive about the extension', () => {
    expect(findChatFile([entry('_CHAT.TXT')])).toBe('_CHAT.TXT');
  });
});

describe('openZip', () => {
  it('lists safe entries with their uncompressed sizes', () => {
    const zip = zipSync({ '_chat.txt': strToU8('hello'), 'IMG-1.jpg': strToU8('1234567') });
    const opened = openZip(zip);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const names = opened.archive.entries.map((entry) => entry.name).sort();
    expect(names).toEqual(['IMG-1.jpg', '_chat.txt']);
    const image = opened.archive.entries.find((entry) => entry.name === 'IMG-1.jpg');
    expect(image?.size).toBe(7);
  });

  it('drops unsafe entries from the listing', () => {
    const zip = zipSync({
      '_chat.txt': strToU8('hello'),
      '../escape.txt': strToU8('nope'),
      '/abs.txt': strToU8('nope'),
    });
    const opened = openZip(zip);
    if (!opened.ok) throw new Error('expected ok');
    expect(opened.archive.entries.map((entry) => entry.name)).toEqual(['_chat.txt']);
    expect(opened.archive.read('../escape.txt')).toBeNull();
  });

  it('rejects a corrupt archive', () => {
    expect(openZip(strToU8('not a zip'))).toEqual({ ok: false, code: 'corrupted-zip' });
  });

  it('accepts a total exactly at the cap and rejects one byte over (S-6)', () => {
    const zip = zipSync({ '_chat.txt': strToU8('x') });
    const atCap = withClaimedSize(zip, MAX_UNCOMPRESSED_BYTES);
    expect(openZip(atCap).ok).toBe(true);
    expect(openZip(withClaimedSize(zip, MAX_UNCOMPRESSED_BYTES + 1))).toEqual({
      ok: false,
      code: 'too-large',
    });
  });

  it('inflates a single entry on demand', () => {
    const zip = zipSync({ 'a.txt': strToU8('aaa'), 'b.txt': strToU8('bbb') });
    const opened = openZip(zip);
    if (!opened.ok) throw new Error('expected ok');
    const bytes = opened.archive.read('b.txt');
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes as Uint8Array)).toBe('bbb');
  });

  it('returns null for an entry that is absent or unsafe', () => {
    const zip = zipSync({ '_chat.txt': strToU8('x'), '../escape.txt': strToU8('nope') });
    const opened = openZip(zip);
    if (!opened.ok) throw new Error('expected ok');
    expect(opened.archive.read('missing.txt')).toBeNull();
    expect(opened.archive.read('../escape.txt')).toBeNull();
  });

  it('returns null for every entry after dispose (F-NAV-6)', () => {
    const zip = zipSync({ '_chat.txt': strToU8('x') });
    const opened = openZip(zip);
    if (!opened.ok) throw new Error('expected ok');
    opened.archive.dispose();
    expect(opened.archive.read('_chat.txt')).toBeNull();
    expect(opened.archive.entries).toHaveLength(0);
  });
});
