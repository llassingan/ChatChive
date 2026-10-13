/**
 * Session lifetime in the import flow (E5-1, plan §2.4).
 *
 * Sprint 4 closed the session the moment a parse succeeded, because nothing
 * read media bytes. E5's rows inflate entries with `session.extract()`, so the
 * session now outlives the parse and travels with the `chat` state: these are
 * the four cases that would otherwise break silently (session alive in `chat`,
 * closed by `cancel()`, closed by unmount, closed when a second import starts),
 * plus the guard that stops a superseded parse from overwriting the screen.
 *
 * `openChatFile` is mocked: jsdom has no `Worker`, so the real client answers
 * `unknown` and none of the chat-state lifetime is reachable without it. The
 * fake session behaves like the real one where it matters: `extract` remembers
 * what was asked and rejects once the session is closed.
 */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '../../parser/client.ts';
import type { Chat, ParseResult } from '../../types/chat.ts';
import { useImportFlow, type ImportFlow, type ImportState } from './useImportFlow.ts';

const mocks = vi.hoisted(() => ({ openChatFile: vi.fn() }));

vi.mock('../../parser/client.ts', () => ({ openChatFile: mocks.openChatFile }));

declare global {
  // React only flushes effects synchronously inside act() when this is set.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

/**
 * `Promise.withResolvers()` (ES2024), the shape the project asks for. The repo
 * compiles against `lib: ES2023`, which has no declaration for it yet, so the
 * platform function is named once here instead of writing the executor form at
 * every call site.
 */
function resolvers<T>() {
  const platform = Promise as unknown as {
    withResolvers: <V>() => {
      promise: Promise<V>;
      resolve: (value: V) => void;
      reject: (reason?: unknown) => void;
    };
  };
  return platform.withResolvers<T>();
}

function chatOf(title: string): Chat {
  return {
    meta: {
      title,
      isGroup: false,
      clockStyle: '12h',
      dateOrder: 'DMY',
      messageCount: 7,
      firstTimestamp: 1_769_000_000_000,
      lastTimestamp: 1_769_000_600_000,
    },
    participants: [],
    messages: [],
    guessedMeId: null,
  };
}

function exportFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/zip' });
}

/**
 * A session the test drives: `settle` answers the parse the way the worker
 * would, `fail` rejects it, and `close` records that it happened.
 */
function fakeSession() {
  const { promise, resolve, reject } = resolvers<ParseResult>();
  const close = vi.fn();
  const extracts: string[] = [];
  let closed = false;
  close.mockImplementation(() => {
    closed = true;
  });

  const session: ChatSession = {
    result: promise,
    extract(entryName) {
      if (closed) return Promise.reject(new Error('The chat session is closed.'));
      extracts.push(entryName);
      return Promise.resolve(new Blob());
    },
    close,
  };

  return { session, close, extracts, settle: resolve, fail: reject };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: ImportFlow | null = null;

/**
 * The harness captures the flow after every render. The tests then read the
 * current one through `latestFlow()`: `state` is a fresh object per render, so
 * snapshot taken at mount would never show the result of a pick.
 */
function Harness() {
  const flow = useImportFlow();
  useEffect(() => {
    latest = flow;
  });
  return null;
}

function mount(): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Harness />);
  });
}

function unmount(): void {
  const current = root;
  root = null;
  if (current) {
    act(() => current.unmount());
  }
  container?.remove();
  container = null;
  latest = null;
}

/** The flow as of the last render. */
function latestFlow(): ImportFlow {
  if (latest === null) throw new Error('the hook is not mounted');
  return latest;
}

/** The `chat` state, or a failure that names what was on screen instead. */
function chatState(): Extract<ImportState, { status: 'chat' }> {
  const state = latestFlow().state;
  if (state.status !== 'chat') {
    throw new Error(`expected a chat, got ${state.status}`);
  }
  return state;
}

beforeEach(() => {
  mocks.openChatFile.mockReset();
});

afterEach(() => {
  unmount();
});

describe('the session outlives the parse', () => {
  it('stays open, and travels in the `chat` state', async () => {
    const session = fakeSession();
    mocks.openChatFile.mockReturnValue(session.session);
    mount();
    const file = exportFile('WhatsApp Chat with Nadia Rush.zip');
    const chat = chatOf('Nadia Rush');

    act(() => latestFlow().pick(file));
    await act(async () => {
      session.settle({ ok: true, chat });
    });

    const state = chatState();
    expect(state.file).toBe(file);
    expect(state.chat).toBe(chat);
    // The same object, not a copy: `extract` is a live worker round trip.
    expect(state.session).toBe(session.session);
    expect(session.close).not.toHaveBeenCalled();

    await act(async () => {
      await state.session.extract('media/IMG-20260702-WA0001.jpg');
    });
    expect(session.extracts).toEqual(['media/IMG-20260702-WA0001.jpg']);
  });

  it('closes it once on cancel, and returns to the landing screen', async () => {
    const session = fakeSession();
    mocks.openChatFile.mockReturnValue(session.session);
    mount();

    act(() => latestFlow().pick(exportFile('WhatsApp Chat with Nadia Rush.zip')));
    await act(async () => {
      session.settle({ ok: true, chat: chatOf('Nadia Rush') });
    });

    act(() => latestFlow().cancel());
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(latestFlow().state).toEqual({ status: 'landing' });

    // Unmounting afterwards must not close it a second time.
    unmount();
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('closes it once on unmount, with the chat still open', async () => {
    const session = fakeSession();
    mocks.openChatFile.mockReturnValue(session.session);
    mount();

    act(() => latestFlow().pick(exportFile('WhatsApp Chat with Nadia Rush.zip')));
    await act(async () => {
      session.settle({ ok: true, chat: chatOf('Nadia Rush') });
    });
    expect(session.close).not.toHaveBeenCalled();

    unmount();
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('closes the first session when a second import starts', async () => {
    const first = fakeSession();
    const second = fakeSession();
    mocks.openChatFile.mockReturnValueOnce(first.session).mockReturnValueOnce(second.session);
    mount();

    act(() => latestFlow().pick(exportFile('first.zip')));
    await act(async () => {
      first.settle({ ok: true, chat: chatOf('First') });
    });
    expect(chatState().session).toBe(first.session);

    act(() => latestFlow().pick(exportFile('second.zip')));
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(first.extracts).toEqual([]);

    await act(async () => {
      second.settle({ ok: true, chat: chatOf('Second') });
    });
    const state = chatState();
    expect(state.session).toBe(second.session);
    expect(state.chat.meta.title).toBe('Second');
    expect(second.close).not.toHaveBeenCalled();
  });

  it('still closes it when the parse fails', async () => {
    const session = fakeSession();
    mocks.openChatFile.mockReturnValue(session.session);
    mount();

    act(() => latestFlow().pick(exportFile('broken.zip')));
    await act(async () => {
      session.settle({ ok: false, error: { code: 'corrupted-zip' } });
    });

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(latestFlow().state).toEqual({ status: 'error', error: { code: 'corrupted-zip' } });
  });

  it('closes it when the parse result itself rejects', async () => {
    const session = fakeSession();
    mocks.openChatFile.mockReturnValue(session.session);
    mount();

    act(() => latestFlow().pick(exportFile('broken.zip')));
    await act(async () => {
      session.fail(new Error('worker died'));
    });

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(latestFlow().state).toEqual({ status: 'error', error: { code: 'unknown' } });
  });
});

describe('a superseded import never overwrites the screen', () => {
  it('ignores the first result once a second file was picked', async () => {
    const first = fakeSession();
    const second = fakeSession();
    mocks.openChatFile.mockReturnValueOnce(first.session).mockReturnValueOnce(second.session);
    mount();
    const secondFile = exportFile('second.zip');

    act(() => latestFlow().pick(exportFile('first.zip')));
    act(() => latestFlow().pick(secondFile));
    expect(latestFlow().state).toMatchObject({ status: 'working', file: secondFile });

    // The abandoned parse answers late: no state change, no chat for `first`.
    await act(async () => {
      first.settle({ ok: true, chat: chatOf('First') });
    });
    expect(latestFlow().state).toMatchObject({ status: 'working', file: secondFile });

    await act(async () => {
      second.settle({ ok: true, chat: chatOf('Second') });
    });
    expect(chatState().chat.meta.title).toBe('Second');
  });
});
