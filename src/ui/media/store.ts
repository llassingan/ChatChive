/**
 * Lazy media loader (backlog E5-1; PRD F-VIEW-7, §10).
 *
 * One archive entry is inflated only when a row asks for it, and what comes
 * back is remembered as a `blob:` URL. This module owns every one of those
 * URLs: it asks the parse session for one entry at a time, wraps the bytes in a
 * blob carrying the MIME type the parser guessed from the filename, and keeps
 * at most `limit` URLs alive with an LRU ordered by read-recency, revoking the
 * rest (E5-1's cap of ~200, which is what keeps memory flat on a chat holding
 * hundreds of photos).
 *
 * Deliberately free of any framework and of the page: the list that creates the
 * store does the subscribing, the rows read `get()` during render, and the only
 * globals used are `URL.createObjectURL` / `URL.revokeObjectURL`. That is what
 * makes the whole policy testable outside a browser (jsdom defines neither
 * `URL` method, so the unit tests stub both, the same ruling as Sprint 4's
 * `matchMedia`).
 *
 * A `blob:` URL is internal currency: it is handed to an element's `src` and
 * nowhere else. It is never logged, and it is never rendered as text (E5-1's
 * honesty rule, and the reason `get()` exposes URLs only through `ready.url`).
 */
import type { MediaRef } from '../../types/chat.ts';
import type { ChatSession } from '../../parser/client.ts';

/**
 * One entry's state. `get()` returns a stable object per entry, replaced only
 * when the status changes, so a memo'd row compares it by identity.
 */
export type MediaEntry =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'unavailable' } // the archive has no such entry (null from extract)
  | { status: 'error' }; // extraction rejected, or the session closed

/** The `ready` arm, named so the LRU can hold URLs and nothing else. */
type ReadyEntry = Extract<MediaEntry, { status: 'ready' }>;

export interface MediaStore {
  /** Current state, or null when nothing has been requested. Never triggers work. */
  get(entryName: string): MediaEntry | null;
  /** Ask for one file. Idempotent: a second call for a known entry does nothing. */
  request(ref: MediaRef): void;
  subscribe(listener: () => void): () => void;
  /** A counter that changes when any entry changed, for `useSyncExternalStore`. */
  getVersion(): number;
  /** Revoke every URL this store created. Safe to call twice. */
  dispose(): void;
}

/** Live blob URLs allowed before the least recently read one is revoked (E5-1). */
const DEFAULT_LIMIT = 200;

/**
 * Re-type a blob the worker sent. `extract` returns `new Blob([bytes])` with no
 * type, which an element still plays (measured in both engines), so this is not
 * a playback fix: it makes the element's `type` honest. A `''` or
 * `application/octet-stream` type means "we do not know", and guessing there
 * would be a lie, so the blob is passed through unchanged.
 */
function retyped(blob: Blob, mimeType: string): Blob {
  if (mimeType === '' || mimeType === 'application/octet-stream') return blob;
  return new Blob([blob], { type: mimeType });
}

export function createMediaStore(
  session: ChatSession | null,
  options: { limit?: number } = {},
): MediaStore {
  // At least one URL: a store that kept none would revoke every URL the moment
  // it arrived and re-extract on every read, which is worse than useless.
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);

  /** Every known entry, whether or not it currently holds a URL. */
  const entries = new Map<string, MediaEntry>();
  /** The live URLs in read-recency order: the first key is the next eviction.
   *  Only `ready` entries are in here, which is what makes "never evict an
   *  extraction still in flight" automatic rather than a special case. */
  const live = new Map<string, ReadyEntry>();
  const listeners = new Set<() => void>();
  let version = 0;
  let disposed = false;

  function notify(): void {
    version += 1;
    // Over a copy: a listener is allowed to unsubscribe while being told.
    for (const listener of [...listeners]) listener();
  }

  function setEntry(name: string, entry: MediaEntry): void {
    entries.set(name, entry);
    notify();
  }

  /** Drop the least recently read URL: revoke it, then forget it, so no later
   *  `get()` can hand a revoked URL to an element. */
  function evictOldest(): void {
    const oldest = live.keys().next();
    if (oldest.done) return;
    const entry = live.get(oldest.value);
    live.delete(oldest.value);
    entries.delete(oldest.value);
    if (entry) URL.revokeObjectURL(entry.url);
  }

  function insertReady(name: string, url: string): void {
    const entry: ReadyEntry = { status: 'ready', url };
    entries.set(name, entry);
    live.set(name, entry);
    while (live.size > limit) evictOldest();
    notify();
  }

  /** A read, which is what the LRU is ordered by: `request` is not a read. */
  function touch(name: string): void {
    const entry = live.get(name);
    if (!entry) return;
    live.delete(name);
    live.set(name, entry);
  }

  function get(entryName: string): MediaEntry | null {
    const entry = entries.get(entryName);
    if (entry === undefined) return null;
    if (entry.status === 'ready') touch(entryName);
    return entry;
  }

  function request(ref: MediaRef): void {
    if (disposed) return;

    const name = ref.entryName;
    // Idempotent: a known name is never asked for twice, in flight or landed.
    if (entries.has(name)) return;
    // Nothing to ask for. The zip directory already answered "no such file", so
    // a round trip can only return null; the row renders its "not included in
    // export" tile straight from `media.resolved` instead (E5-7).
    if (!ref.resolved) return;

    setEntry(name, { status: 'loading' });
    if (session === null) {
      // No archive to read from, ever: an error, not a spinner that never ends.
      setEntry(name, { status: 'error' });
      return;
    }

    const mimeType = ref.mimeType;
    void session.extract(name).then(
      (blob) => {
        if (disposed || entries.get(name)?.status !== 'loading') return;
        if (blob === null) {
          setEntry(name, { status: 'unavailable' });
          return;
        }
        insertReady(name, URL.createObjectURL(retyped(blob, mimeType)));
      },
      () => {
        // A closed session is the normal case here (F-NAV-6): the row shows the
        // "cannot be shown" tile. Swallowed on purpose, so a rejection the user
        // did not cause never reaches the console as an unhandled one.
        if (disposed || entries.get(name)?.status !== 'loading') return;
        setEntry(name, { status: 'error' });
      },
    );
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const entry of live.values()) URL.revokeObjectURL(entry.url);
    live.clear();
    entries.clear();
    notify();
  }

  return { get, request, subscribe, getVersion: () => version, dispose };
}
