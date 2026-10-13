/**
 * Media store coverage (E5-1, the seven rules of the Sprint 5 plan §2.2).
 *
 * jsdom defines neither `URL.createObjectURL` nor `URL.revokeObjectURL`, so both
 * are stubbed here: that stub is what lets the LRU be asserted exactly, down to
 * which URL was revoked and when (Sprint 4's `matchMedia` ruling, same reason).
 * The extracted blobs are untyped on purpose, mirroring what the worker sends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '../../parser/client.ts';
import type { MediaRef, ParseResult } from '../../types/chat.ts';
import storeSource from './store.ts?raw';
import { createMediaStore, type MediaStore } from './store.ts';

/** A blob with no type, exactly what `extract` resolves with. */
function untyped(bytes: number[] = [1, 2, 3]): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

function ref(entryName: string, overrides: Partial<MediaRef> = {}): MediaRef {
  return {
    kind: 'image',
    entryName,
    fileName: entryName,
    mimeType: 'image/jpeg',
    byteSize: 3,
    resolved: true,
    ...overrides,
  };
}

/**
 * `Promise.withResolvers` (ES2024), the shape the project rules ask for. The
 * repo compiles against `lib: ES2023`, which has no declaration for it yet, so
 * the platform function is named once here instead of writing the executor form
 * at each call site.
 */
function resolvers<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  const platform = Promise as unknown as {
    withResolvers: <V>() => { promise: Promise<V>; resolve: (value: V) => void };
  };
  return platform.withResolvers<T>();
}

/** A session whose `extract` the test drives; `result` is never read. */
function makeSession(extract: ChatSession['extract']): ChatSession {
  return { result: resolvers<ParseResult>().promise, extract, close: () => {} };
}

/** A session that answers immediately from a map of entry name to bytes. */
function resolvingSession(resolve: (name: string) => Promise<Blob | null>) {
  const calls: string[] = [];
  const session = makeSession((name) => {
    calls.push(name);
    return resolve(name);
  });
  return { session, calls };
}

interface Deferred {
  promise: Promise<Blob | null>;
  settle: (blob: Blob | null) => void;
}

function deferred(): Deferred {
  const { promise, resolve } = resolvers<Blob | null>();
  return { promise, settle: resolve };
}

/**
 * Let every pending extraction land. Deterministic, and no clock: `extract`
 * answers from an already-fulfilled promise in these tests, so the store's
 * `.then(…)` reaction is queued before the first turn, and a few more turns
 * leave room for anything that follows it. Microtasks run FIFO, so this lands
 * the result rather than racing it.
 */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
}

let createdUrls: string[] = [];
let createdBlobs: Blob[] = [];
let revokedUrls: string[] = [];
let nextUrlId = 1;

beforeEach(() => {
  createdUrls = [];
  createdBlobs = [];
  revokedUrls = [];
  nextUrlId = 1;
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:media/${nextUrlId}`;
    nextUrlId += 1;
    createdUrls.push(url);
    createdBlobs.push(blob);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    revokedUrls.push(url);
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rule 1: one extraction per entry name', () => {
  it('asks once for two requests made before the bytes arrive', async () => {
    const gate = deferred();
    const { session, calls } = resolvingSession(() => gate.promise);
    const store = createMediaStore(session);

    store.request(ref('media/IMG-1.jpg'));
    store.request(ref('media/IMG-1.jpg'));
    expect(calls).toHaveLength(1);
    expect(store.get('media/IMG-1.jpg')).toEqual({ status: 'loading' });

    gate.settle(untyped());
    await flush();
    expect(createdUrls).toHaveLength(1);
  });

  it('asks once for a request made after the entry landed', async () => {
    const { session, calls } = resolvingSession(() => Promise.resolve(untyped()));
    const store = createMediaStore(session);

    store.request(ref('media/IMG-1.jpg'));
    await flush();
    const landed = store.get('media/IMG-1.jpg');

    store.request(ref('media/IMG-1.jpg'));
    expect(calls).toHaveLength(1);
    expect(createdUrls).toHaveLength(1);
    // The entry itself is stable: the same object, not a second `loading`.
    expect(store.get('media/IMG-1.jpg')).toBe(landed);
  });

  it('does not ask for media the archive does not have (F-VIEW-12)', () => {
    const { session, calls } = resolvingSession(() => Promise.resolve(untyped()));
    const store = createMediaStore(session);

    store.request(ref('media/IMG-missing.jpg', { resolved: false }));
    expect(calls).toEqual([]);
    expect(store.get('media/IMG-missing.jpg')).toBeNull();
  });

  it('a read of an unknown entry never triggers work', () => {
    const { session, calls } = resolvingSession(() => Promise.resolve(untyped()));
    const store = createMediaStore(session);

    expect(store.get('media/never-asked.jpg')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('rule 2: the blob carries the MIME type the parser guessed', () => {
  it('re-types an untyped blob', async () => {
    const original = untyped([7, 7, 7, 7]);
    const store = createMediaStore(makeSession(() => Promise.resolve(original)));

    store.request(ref('media/VID-1.webm', { mimeType: 'video/webm' }));
    await flush();

    const [blob] = createdBlobs;
    expect(blob).not.toBe(original);
    expect(blob.type).toBe('video/webm');
    expect(blob.size).toBe(4);
    expect(original.type).toBe('');
  });

  it.each(['', 'application/octet-stream'])('passes an %s blob through unchanged', async (mime) => {
    const original = untyped();
    const store = createMediaStore(makeSession(() => Promise.resolve(original)));

    store.request(ref('media/mystery.bin', { mimeType: mime }));
    await flush();

    expect(createdBlobs[0]).toBe(original);
  });
});

describe('rule 3: LRU by read-recency', () => {
  /** Four distinct entries, all answered immediately. */
  function fourEntryStore(limit: number) {
    const { session, calls } = resolvingSession(() => Promise.resolve(untyped()));
    const store = createMediaStore(session, { limit });
    return { store, calls };
  }

  it('revokes the least recently read URL past the limit, exactly once each', async () => {
    const { store } = fourEntryStore(3);
    for (const name of ['a', 'b', 'c']) store.request(ref(name));
    await flush();
    expect(createdUrls).toEqual(['blob:media/1', 'blob:media/2', 'blob:media/3']);

    // A read is a use: `a` becomes the most recent, so `b` is next out.
    expect(store.get('a')).toEqual({ status: 'ready', url: 'blob:media/1' });

    store.request(ref('d'));
    await flush();
    expect(revokedUrls).toEqual(['blob:media/2']);

    store.request(ref('e'));
    await flush();
    expect(revokedUrls).toEqual(['blob:media/2', 'blob:media/3']);
    expect(createdUrls).toHaveLength(5);

    // An evicted entry is forgotten, not left holding a revoked URL.
    expect(store.get('b')).toBeNull();
    expect(store.get('c')).toBeNull();
    expect(store.get('a')).toEqual({ status: 'ready', url: 'blob:media/1' });
  });

  it('keeps exactly `limit` URLs alive over 250 requests (E5-1 default 200)', async () => {
    const { session, calls } = resolvingSession(() => Promise.resolve(untyped()));
    const store = createMediaStore(session);

    for (let index = 0; index < 250; index += 1) store.request(ref(`media/f${index}.jpg`));
    await flush();

    expect(calls).toHaveLength(250);
    expect(createdUrls).toHaveLength(250);
    expect(revokedUrls).toEqual(createdUrls.slice(0, 50));
    expect(store.get('media/f0.jpg')).toBeNull();
    expect(store.get('media/f49.jpg')).toBeNull();
    expect(store.get('media/f50.jpg')).toEqual({ status: 'ready', url: createdUrls[50] });
    expect(store.get('media/f249.jpg')).toEqual({ status: 'ready', url: createdUrls[249] });
  });

  it('never evicts an entry whose extraction is still in flight', async () => {
    const slow = deferred();
    const { session } = resolvingSession((name) =>
      name === 'slow' ? slow.promise : Promise.resolve(untyped()),
    );
    const store = createMediaStore(session, { limit: 2 });

    store.request(ref('slow'));
    store.request(ref('fast-1'));
    store.request(ref('fast-2'));
    await flush();

    // Two live URLs fill the cap, and the pending extraction is untouched.
    expect(revokedUrls).toEqual([]);
    expect(store.get('slow')).toEqual({ status: 'loading' });

    slow.settle(untyped());
    await flush();

    // `slow` landed with a URL of its own; the oldest read URL paid for it.
    expect(store.get('slow')).toEqual({ status: 'ready', url: createdUrls[2] });
    expect(revokedUrls).toEqual([createdUrls[0]]);
  });

  it('re-requests an evicted entry instead of returning its dead URL', async () => {
    const { store, calls } = fourEntryStore(3);
    store.request(ref('a'));
    store.request(ref('b'));
    store.request(ref('c'));
    await flush();

    store.request(ref('d'));
    await flush();
    const revoked = createdUrls[0];
    expect(revokedUrls).toEqual([revoked]);
    expect(store.get('a')).toBeNull();

    store.request(ref('a'));
    expect(store.get('a')).toEqual({ status: 'loading' });
    await flush();

    expect(calls.filter((name) => name === 'a')).toHaveLength(2);
    // A fresh URL, not the revoked one: the fourth entry is the live one, and
    // evicting for it revoked a second URL (`b`, now the oldest read).
    const revived = createdUrls.at(-1);
    expect(store.get('a')).toEqual({ status: 'ready', url: revived });
    expect(revived).not.toBe(revoked);
    expect(revokedUrls).not.toContain(revived);
  });

  it('informs subscribers of every status change, and stops when they leave', async () => {
    const { session } = resolvingSession(() => Promise.resolve(untyped()));
    const store = createMediaStore(session);
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    const before = store.getVersion();
    store.request(ref('a'));
    await flush();
    // loading, then ready.
    expect(notified).toBe(2);
    expect(store.getVersion()).toBeGreaterThan(before);

    unsubscribe();
    store.request(ref('b'));
    await flush();
    expect(notified).toBe(2);
  });
});

describe('rule 4: nothing throws, whatever the archive answers', () => {
  it('records a rejected extraction as an error and stays usable', async () => {
    const { session } = resolvingSession((name) =>
      name === 'closed'
        ? Promise.reject(new Error('The chat session is closed.'))
        : Promise.resolve(untyped()),
    );
    const store = createMediaStore(session);

    store.request(ref('closed'));
    await flush();
    expect(store.get('closed')).toEqual({ status: 'error' });

    store.request(ref('next'));
    await flush();
    expect(store.get('next')).toEqual({ status: 'ready', url: createdUrls[0] });
  });

  it('records a null blob as unavailable (the entry is not in the archive)', async () => {
    const store = createMediaStore(makeSession(() => Promise.resolve(null)));

    store.request(ref('media/gone.jpg'));
    await flush();
    expect(store.get('media/gone.jpg')).toEqual({ status: 'unavailable' });
    expect(createdUrls).toEqual([]);
  });

  it('reports an error rather than loading forever with no session', () => {
    const store = createMediaStore(null);

    store.request(ref('media/IMG-1.jpg'));
    expect(store.get('media/IMG-1.jpg')).toEqual({ status: 'error' });
  });

  it('lets no rejection escape as an unhandled one', async () => {
    const seen: unknown[] = [];
    const listener = (reason: unknown) => seen.push(reason);
    process.on('unhandledRejection', listener);
    try {
      const store = createMediaStore(makeSession(() => Promise.reject(new Error('closed'))));
      store.request(ref('media/a.jpg'));
      await flush();
      expect(store.get('media/a.jpg')).toEqual({ status: 'error' });
      await flush();
      expect(seen).toEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  it('ignores a request made after dispose', () => {
    const { session, calls } = resolvingSession(() => Promise.resolve(untyped()));
    const store = createMediaStore(session);

    store.dispose();
    store.request(ref('a'));
    expect(calls).toEqual([]);
    expect(store.get('a')).toBeNull();
  });
});

describe('rule 5: dispose', () => {
  it('revokes every URL it created, and is safe to call twice', async () => {
    const { session } = resolvingSession(() => Promise.resolve(untyped()));
    const store = createMediaStore(session);
    for (const name of ['a', 'b']) store.request(ref(name));
    await flush();
    expect(createdUrls).toHaveLength(2);

    store.dispose();
    expect(revokedUrls).toEqual(createdUrls);
    expect(store.get('a')).toBeNull();

    store.dispose();
    expect(revokedUrls).toEqual(createdUrls);
  });

  it('drops an extraction that lands after the close, creating no URL', async () => {
    const gate = deferred();
    const store = createMediaStore(makeSession(() => gate.promise));

    store.request(ref('a'));
    store.dispose();
    gate.settle(untyped());
    await flush();

    expect(createdUrls).toEqual([]);
    expect(store.get('a')).toBeNull();
  });

  it('tells subscribers the entries are gone', async () => {
    const { session } = resolvingSession(() => Promise.resolve(untyped()));
    const store = createMediaStore(session);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.request(ref('a'));
    await flush();
    const before = notified;
    store.dispose();
    expect(notified).toBe(before + 1);
  });

  it('a store created after another one was disposed is unaffected', async () => {
    const first = createMediaStore(makeSession(() => Promise.resolve(untyped())));
    first.dispose();

    const { session } = resolvingSession(() => Promise.resolve(untyped()));
    const second = createMediaStore(session);
    second.request(ref('a'));
    await flush();

    expect(second.get('a')).toEqual({ status: 'ready', url: createdUrls[0] });
    second.dispose();
    expect(revokedUrls).toEqual([createdUrls[0]]);
  });
});

describe('rules 6 and 7: no React, no DOM, no URL on the page', () => {
  // `?raw` (Vite's) rather than reading from disk: the assertion is about the
  // module the test imports, and it keeps the test free of Node's fs.
  const source = storeSource;

  it('imports neither React nor the page', () => {
    expect(source).not.toContain("from 'react'");
    expect(/\bdocument\b/.test(source)).toBe(false);
    expect(/\bwindow\./.test(source)).toBe(false);
  });

  it('never logs, and never formats a blob URL into text', () => {
    expect(/\bconsole\.\w+\(/.test(source)).toBe(false);
    // The only place a URL leaves the module is `ready.url`, for an element src.
    expect(source).not.toContain('<${url}');
  });

  it('logs nothing while loading, evicting and disposing', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
    ];
    const { session } = resolvingSession(() => Promise.resolve(untyped()));
    const store: MediaStore = createMediaStore(session, { limit: 1 });
    for (const name of ['a', 'b']) store.request(ref(name));
    await flush();
    store.get('b');
    store.dispose();

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
