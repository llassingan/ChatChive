/**
 * Zip handling for the parsing pipeline (backlog E2-6; PRD F-IMP-2, S-6).
 *
 * Wraps `fflate` so the rest of the pipeline never touches archive internals:
 * it lists entries (cheap, no decompression), enforces zip-safety rules, and
 * inflates a single entry on demand so media stays in the archive until the UI
 * asks for it (E5-1). Nothing here throws: a corrupt archive comes back as a
 * `corrupted-zip` result.
 */

import { unzipSync } from 'fflate';

/** One file in the archive, with the uncompressed size from the directory. */
export interface ArchiveEntry {
  /** Full zip entry name, e.g. "media/IMG-20260704-WA0000.jpg". */
  name: string;
  /** Uncompressed size in bytes. */
  size: number;
}

export interface ZipArchive {
  /** Safe entries only, in archive order. */
  entries: ArchiveEntry[];
  /** Inflate one entry's bytes, or null when absent/rejected/disposed. */
  read(name: string): Uint8Array<ArrayBuffer> | null;
  /** Drop the archive bytes and entries (F-NAV-6). */
  dispose(): void;
}

export type OpenZipResult =
  | { ok: true; archive: ZipArchive }
  | { ok: false; code: 'corrupted-zip' | 'too-large' };

/** Uncompressed total above which we refuse the archive (PRD S-6, ~2 GB). */
export const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Reject entries that would escape the archive root (S-6): absolute POSIX or
 * Windows paths, or any `..` path segment.
 */
export function isUnsafePath(name: string): boolean {
  if (name.startsWith('/') || name.startsWith('\\')) return true;
  if (/^[A-Za-z]:[\\/]/.test(name)) return true;
  return name.split(/[\\/]/).includes('..');
}

/** The basename of a zip entry path (handles both `/` and `\`). */
export function baseName(name: string): string {
  return name.replace(/^.*[\\/]/, '');
}

/**
 * Open an archive: list entries, drop unsafe ones, and check the uncompressed
 * total. Keeps the raw bytes so `read()` can inflate a single entry later.
 */
export function openZip(bytes: Uint8Array): OpenZipResult {
  const entries: ArchiveEntry[] = [];
  let total = 0;

  try {
    unzipSync(bytes, {
      filter: (info) => {
        if (!isUnsafePath(info.name)) {
          entries.push({ name: info.name, size: info.originalSize });
          total += info.originalSize;
        }
        return false;
      },
    });
  } catch {
    return { ok: false, code: 'corrupted-zip' };
  }

  if (total > MAX_UNCOMPRESSED_BYTES) {
    return { ok: false, code: 'too-large' };
  }

  const names = new Set(entries.map((entry) => entry.name));
  let alive = true;

  return {
    ok: true,
    archive: {
      entries,
      read(name: string): Uint8Array<ArrayBuffer> | null {
        if (!alive || !names.has(name)) return null;
        try {
          const out = unzipSync(bytes, { filter: (info) => info.name === name });
          return out[name] ?? null;
        } catch {
          return null;
        }
      },
      dispose(): void {
        alive = false;
        entries.length = 0;
        names.clear();
      },
    },
  };
}

/**
 * Find the chat text file inside the archive (F-IMP-2): `_chat.txt`, then
 * `WhatsApp Chat with *.txt`, then `WhatsApp Chat - *.txt`, then the only or
 * largest `.txt`. Returns the entry name, or null when there is no `.txt`.
 */
export function findChatFile(entries: ArchiveEntry[]): string | null {
  const txt = entries.filter((entry) => /\.txt$/i.test(entry.name));
  if (txt.length === 0) return null;

  const exact = txt.find((entry) => baseName(entry.name).toLowerCase() === '_chat.txt');
  if (exact) return exact.name;

  const withName = txt.find((entry) => /^WhatsApp Chat with .+\.txt$/i.test(baseName(entry.name)));
  if (withName) return withName.name;

  const dash = txt.find((entry) => /^WhatsApp Chat - .+\.txt$/i.test(baseName(entry.name)));
  if (dash) return dash.name;

  if (txt.length === 1) return txt[0].name;

  return txt.reduce((largest, entry) => (entry.size > largest.size ? entry : largest)).name;
}
