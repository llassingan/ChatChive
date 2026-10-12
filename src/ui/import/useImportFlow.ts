/**
 * Import flow: one state machine over `openChatFile()` (E3-1, E3-2, and the
 * E3-3 date prompt pulled forward). It owns the session so Cancel can terminate
 * the worker and free the archive at any point.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { openChatFile, type ChatSession } from '../../parser/client.ts';
import type { Chat, DateOrder, ParseError, ParsePhase } from '../../types/chat.ts';

export type ImportState =
  | { status: 'landing' }
  | { status: 'working'; file: File; phase: ParsePhase; fraction: number | undefined }
  | { status: 'choice'; file: File; samples: Array<{ raw: string; asDMY: string; asMDY: string }> }
  | { status: 'chat'; file: File; chat: Chat }
  | { status: 'error'; error: ParseError };

/** Phases in the order the pipeline reports them; `ready` is the last one. */
const PHASE_ORDER: ParsePhase[] = ['reading', 'unzipping', 'parsing', 'ready'];

/** Only these two extensions are chat exports; anything else is rejected up
 *  front so a dropped folder or photo gets a real message instead of a parse
 *  that cannot succeed. */
const EXPORT_NAME = /\.(zip|txt)$/i;

/**
 * Collapse the per-phase fraction into one 0..1 value across the three work
 * phases. `undefined` means the current phase cannot report progress yet, which
 * the bar renders as indeterminate rather than guessing.
 */
export function overallFraction(
  phase: ParsePhase,
  fraction: number | undefined,
): number | undefined {
  const index = PHASE_ORDER.indexOf(phase);
  if (index >= PHASE_ORDER.length - 1) return 1;
  if (fraction === undefined) return undefined;
  return Math.min(1, (index + fraction) / (PHASE_ORDER.length - 1));
}

export interface ImportFlow {
  state: ImportState;
  /** A picked or dropped file; `null` when a drop carried no readable file. */
  pick: (file: File | null) => void;
  /** Abandon the current import, free the session and return to the landing
   *  screen. Serves Cancel, "Choose another file" and "Close chat". */
  cancel: () => void;
  chooseDateOrder: (order: DateOrder) => void;
}

export function useImportFlow(): ImportFlow {
  const [state, setState] = useState<ImportState>({ status: 'landing' });
  const sessionRef = useRef<ChatSession | null>(null);

  // Terminating on unmount keeps the worker from outliving the view that owns it.
  useEffect(() => () => sessionRef.current?.close(), []);

  const run = useCallback((file: File, dateOrder?: DateOrder) => {
    sessionRef.current?.close();
    sessionRef.current = null;

    setState({ status: 'working', file, phase: 'reading', fraction: undefined });

    const session = openChatFile(file, {
      ...(dateOrder ? { dateOrder } : {}),
      onProgress: (progress) => {
        setState((current) =>
          current.status === 'working'
            ? { ...current, phase: progress.phase, fraction: progress.fraction }
            : current,
        );
      },
    });
    sessionRef.current = session;

    void session.result
      .then((result) => {
        // A newer run (or a cancel) took over while this one was in flight.
        if (sessionRef.current !== session) return;

        if (result.ok) {
          // The chat view renders from the parsed `Chat` and does not read media
          // bytes yet (E5 lands next sprint), so releasing the archive now keeps
          // memory flat (F-NAV-6). `file` stays in state so E5 can reopen a
          // session and call `extract()` lazily.
          session.close();
          sessionRef.current = null;
          setState({ status: 'chat', file, chat: result.chat });
          return;
        }

        if ('needsUserChoice' in result) {
          setState({ status: 'choice', file, samples: result.samples });
          return;
        }

        session.close();
        sessionRef.current = null;
        setState({ status: 'error', error: result.error });
      })
      .catch(() => {
        if (sessionRef.current !== session) return;
        session.close();
        sessionRef.current = null;
        setState({ status: 'error', error: { code: 'unknown' } });
      });
  }, []);

  const pick = useCallback(
    (file: File | null) => {
      // No file at all (a dropped folder) and a wrong extension both mean "this
      // is not an export we can open", so they share one message.
      if (!file || !EXPORT_NAME.test(file.name)) {
        sessionRef.current?.close();
        sessionRef.current = null;
        setState({ status: 'error', error: { code: 'unrecognized-format' } });
        return;
      }
      run(file);
    },
    [run],
  );

  const cancel = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setState({ status: 'landing' });
  }, []);

  const chooseDateOrder = useCallback(
    (order: DateOrder) => {
      if (state.status === 'choice') run(state.file, order);
    },
    [state, run],
  );

  return { state, pick, cancel, chooseDateOrder };
}
