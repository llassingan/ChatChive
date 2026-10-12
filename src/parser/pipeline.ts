/**
 * Parsing pipeline entry point (backlog E2-4 body classifier, E2-5 chat
 * metadata, E2-6 worker pipeline).
 *
 * This is the frozen seam of the parsing track. `worker.ts` binds a session to
 * the worker scope, and `client.ts` is the main-thread caller, so the exported
 * signature is fixed; the implementation behind it is not.
 *
 * The session deliberately outlives a single parse: it must keep the archive so
 * a media file can be inflated later, one entry at a time (E5-1), and it must
 * release that memory on `dispose()` (F-NAV-6 close chat).
 *
 * Requirement traceability: PRD §7.2, §8 S-6, §9 speed and memory targets.
 */

import type {
  Chat,
  ChatMeta,
  DateOrder,
  Message,
  ParseProgress,
  ParseResult,
} from '../types/chat.ts';
import { classifyMessages, type MediaEntry } from './classifier.ts';
import { detectDateOrder } from './dateOrder.ts';
import { parseLine, toEpochMs, type HeaderLine, type ParsedLine } from './header.ts';
import { analyzeSenders, detectGroup, guessMeId, titleFromFileName } from './metadata.ts';
import { splitLines } from './text.ts';
import { findChatFile, openZip, type ZipArchive } from './zip.ts';

export interface ParserSession {
  /**
   * Unzip (when needed) and parse one export. Never throws: every failure comes
   * back as `{ ok: false, error }`, and an undecidable date order as
   * `{ ok: false, needsUserChoice, samples }`. Calls `onProgress` as it moves
   * through the phases (E3-2).
   */
  parse(
    file: File,
    dateOrder: DateOrder | null,
    onProgress: (progress: ParseProgress) => void,
  ): Promise<ParseResult>;

  /**
   * Inflate one entry from the archive kept by the last parse (E5-1). Resolves
   * null when the entry is absent or rejected by zip safety.
   */
  extract(entryName: string): Promise<Blob | null>;

  /** Drop the archive and any parsed state, freeing memory (F-NAV-6). */
  dispose(): void;
}

/** Read a `File` to bytes, working in a worker and in jsdom (no `arrayBuffer`). */
async function readFileBytes(file: File): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Decode export bytes as UTF-8. Lossy on purpose: a stray invalid byte in a
 * large export must not discard the whole chat, and a file that is not text at
 * all still fails the header check below, which is the real format signal.
 */
function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

export interface ParseTextOptions {
  /** Title fallback source; usually the export file name (E2-5). */
  fileName?: string;
  /** Zip entries, for resolving attachment markers (F-PAR-5). */
  entries?: MediaEntry[];
  /** The user's date-order answer; null/undefined detects it (F-PAR-3). */
  dateOrder?: DateOrder | null;
}

/**
 * Parse export text into a `Chat`, or report why it cannot be parsed. Pure and
 * worker-safe: no DOM beyond the text primitives. Never throws.
 */
export function parseChatText(text: string, options: ParseTextOptions = {}): ParseResult {
  const lines: ParsedLine[] = splitLines(text).map(parseLine);
  const headers = lines.filter((line): line is HeaderLine => line.type === 'header');

  if (headers.length === 0) {
    return { ok: false, error: { code: 'unrecognized-format' } };
  }

  let dateOrder = options.dateOrder ?? null;
  if (dateOrder === null) {
    const detection = detectDateOrder(text);
    if ('needsUserChoice' in detection) {
      return { ok: false, needsUserChoice: true, samples: detection.samples };
    }
    dateOrder = detection.order;
  }

  const analysis = analyzeSenders(headers);
  const isGroup = detectGroup(analysis.senders, analysis.hasGroupNotice);

  // Title from the filename, else the first non-self sender (E2-5, PRD F-PAR-9).
  const title = titleFromFileName(options.fileName ?? '') ?? analysis.senders[0] ?? 'Chat';

  const guessedMeId = guessMeId({
    isGroup,
    title,
    participants: analysis.participants,
  });

  const messages: Message[] = classifyMessages(lines, {
    dateOrder,
    entries: options.entries ?? [],
    meId: guessedMeId,
    isSystemSender: analysis.isSystemSender,
    participantId: analysis.participantId,
  });

  // A 100k-message export (PRD §9) would blow the argument limit of
  // `Math.min(...)`, so the range is folded in a loop.
  let firstTimestamp = Number.POSITIVE_INFINITY;
  let lastTimestamp = Number.NEGATIVE_INFINITY;
  for (const header of headers) {
    const time = toEpochMs(header.timestamp, dateOrder);
    if (time < firstTimestamp) firstTimestamp = time;
    if (time > lastTimestamp) lastTimestamp = time;
  }

  const meta: ChatMeta = {
    title,
    isGroup,
    // The first header fixes the clock style the UI mirrors (F-VIEW-2).
    clockStyle: headers[0].timestamp.clockStyle,
    dateOrder,
    messageCount: messages.length,
    firstTimestamp,
    lastTimestamp,
  };

  const chat: Chat = { meta, participants: analysis.participants, messages, guessedMeId };
  return { ok: true, chat };
}

export function createParserSession(): ParserSession {
  let archive: ZipArchive | null = null;

  async function parse(
    file: File,
    dateOrder: DateOrder | null,
    onProgress: (progress: ParseProgress) => void,
  ): Promise<ParseResult> {
    archive?.dispose();
    archive = null;

    try {
      onProgress({ phase: 'reading', fraction: 0 });
      const bytes = await readFileBytes(file);
      onProgress({ phase: 'reading', fraction: 1 });

      const isZip = /\.zip$/i.test(file.name);
      let text: string;
      let entries: MediaEntry[] = [];
      let titleSource = file.name;

      if (isZip) {
        onProgress({ phase: 'unzipping', fraction: 0 });
        const opened = openZip(bytes);
        if (!opened.ok) {
          return { ok: false, error: { code: opened.code } };
        }
        archive = opened.archive;
        entries = archive.entries;

        const chatName = findChatFile(archive.entries);
        if (chatName === null) {
          archive.dispose();
          archive = null;
          return { ok: false, error: { code: 'no-chat-file' } };
        }
        const chatBytes = archive.read(chatName);
        if (chatBytes === null) {
          archive.dispose();
          archive = null;
          return { ok: false, error: { code: 'unrecognized-format' } };
        }
        text = decodeText(chatBytes);
        // The inner text file carries the contact name on Android; the outer
        // zip name is the fallback for an iOS `_chat.txt` export (E2-5).
        titleSource = titleFromFileName(chatName) !== null ? chatName : file.name;
        onProgress({ phase: 'unzipping', fraction: 1 });
      } else {
        text = decodeText(bytes);
      }

      onProgress({ phase: 'parsing', fraction: 0 });
      const result = parseChatText(text, { fileName: titleSource, entries, dateOrder });
      onProgress({ phase: 'parsing', fraction: 1 });

      // The archive is only worth keeping when a chat came out of it; a failed
      // parse has no media to extract later (F-NAV-6).
      if (!result.ok && archive !== null) {
        archive.dispose();
        archive = null;
      }

      onProgress({ phase: 'ready', fraction: 1 });
      return result;
    } catch (error) {
      archive?.dispose();
      archive = null;
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: { code: 'unknown', detail } };
    }
  }

  return {
    parse,

    async extract(entryName: string): Promise<Blob | null> {
      if (archive === null) return null;
      const bytes = archive.read(entryName);
      if (bytes === null) return null;
      return new Blob([bytes]);
    },

    dispose(): void {
      archive?.dispose();
      archive = null;
    },
  };
}
