/**
 * Main-thread entry point to the parsing pipeline (backlog E2-6). The UI opens
 * an export through `openChatFile()` and never talks to the worker directly.
 *
 * Known limitation: `new Worker()` needs a browser. Every target browser has
 * one (PRD §9), so there is no main-thread fallback; if a worker cannot be
 * created the session reports an `unknown` error instead of freezing the tab.
 */

import type { DateOrder, ParseProgress, ParseResult } from '../types/chat.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

export interface OpenChatOptions {
  /** Set only when the user answered the DD/MM vs MM/DD prompt (E3-3). */
  dateOrder?: DateOrder;
  /** Called on every phase change, for the progress bar (E3-2). */
  onProgress?: (progress: ParseProgress) => void;
}

export interface ChatSession {
  /**
   * Resolves with the parse outcome. It never rejects: a failure arrives as
   * `{ ok: false, error }` and an undecidable date order as
   * `{ ok: false, needsUserChoice, samples }`.
   */
  result: Promise<ParseResult>;
  /** Inflate one media file from the archive (E5-1). Rejects once closed. */
  extract(entryName: string): Promise<Blob | null>;
  /** Terminate the worker and free the archive (E2-6 cancel, F-NAV-6 close). */
  close(): void;
}

export function openChatFile(file: File, options: OpenChatOptions = {}): ChatSession {
  const { dateOrder, onProgress } = options;

  if (typeof Worker === 'undefined') {
    return {
      result: Promise.resolve<ParseResult>({
        ok: false,
        error: { code: 'unknown', detail: 'Web Workers are unavailable here.' },
      }),
      extract: () => Promise.resolve(null),
      close: () => {},
    };
  }

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  // Request ids are numeric and inserted/removed at runtime, and `close()` clears
  // the whole set, which is the case the project rule reserves for Map.
  const pending = new Map<number, (blob: Blob | null) => void>();
  let nextRequestId = 1;
  let closed = false;

  const result = new Promise<ParseResult>((resolve) => {
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      switch (message.type) {
        case 'progress':
          onProgress?.(message.progress);
          break;
        case 'result':
          resolve(message.result);
          break;
        case 'media': {
          const settle = pending.get(message.id);
          pending.delete(message.id);
          settle?.(message.blob);
          break;
        }
      }
    });

    // A worker-level failure (script error, out of memory) would otherwise leave
    // `result` pending forever, which reads to the user as a stuck progress bar.
    worker.addEventListener('error', (event: ErrorEvent) => {
      resolve({ ok: false, error: { code: 'unknown', detail: event.message } });
    });

    const request: WorkerRequest = { type: 'parse', file, dateOrder: dateOrder ?? null };
    worker.postMessage(request);
  });

  return {
    result,

    extract(entryName: string): Promise<Blob | null> {
      if (closed) {
        return Promise.reject(new Error('The chat session is closed.'));
      }
      const id = nextRequestId++;
      return new Promise<Blob | null>((resolve) => {
        pending.set(id, resolve);
        const request: WorkerRequest = { type: 'extract', id, entryName };
        worker.postMessage(request);
      });
    },

    close(): void {
      if (closed) return;
      closed = true;
      pending.clear();
      worker.terminate();
    },
  };
}
