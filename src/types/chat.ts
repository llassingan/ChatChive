/**
 * Shared data model — the contract between the parsing track (src/parser, owned
 * by the backend specialist) and the view track (src/ui, owned by the frontend
 * specialist). Changing a type here is a cross-track change: raise it with the
 * tech lead first.
 *
 * Requirement traceability: PRD §7.2 (parsing), §7.3 (chat view), BACKLOG E2.
 *
 * Design constraints baked into these types:
 *  - The parser never fetches media. It records how to locate a media file
 *    inside the zip (`mediaRef`); the UI extracts it lazily to a blob: URL
 *    (PRD §10, backlog E5-1).
 *  - Message bodies are plain strings, never HTML. Formatting (*bold*, links,
 *    etc.) is parsed at render time into React text nodes (PRD S-5, E4-6).
 *  - Timestamps are epoch milliseconds plus the original clock style, so the
 *    UI can render 24h vs 12h exactly as the export did (F-VIEW-2).
 */

/** Media classification, keyed off filename and attachment markers (F-PAR-5, E2-4). */
export type MediaKind =
  | 'image'
  | 'video'
  | 'gif'
  | 'sticker'
  | 'voice'
  | 'audio'
  | 'document'
  | 'contact'
  | 'location';

/** Clock style detected from the export, so the UI mirrors it (F-VIEW-2). */
export type ClockStyle = '12h' | '24h';

/** Date component order detected from the data (F-PAR-3, E2-3). */
export type DateOrder = 'DMY' | 'MDY';

/**
 * A pointer to a media file inside the source zip. The parser resolves the
 * attachment marker to a real zip entry name; the UI loads bytes on demand.
 * `resolved: false` means the export referenced media that is not in the zip
 * (shown as a placeholder, F-VIEW-12).
 */
export interface MediaRef {
  kind: MediaKind;
  /** Zip entry name, e.g. "IMG-20260704-WA0000.jpg". */
  entryName: string;
  /** Original filename as written in the chat text. */
  fileName: string;
  /** MIME type guessed from the extension, e.g. "image/jpeg". */
  mimeType: string;
  /** Uncompressed size in bytes, when known from the zip directory. */
  byteSize?: number;
  /** False when the referenced file is absent from the zip. */
  resolved: boolean;
}

/** A participant in the chat. Colors/initials are assigned by the parser (E2-5). */
export interface Participant {
  /** Stable key: a saved name, or a normalized phone number. */
  id: string;
  /** Display name, or the phone number when there is no saved name. */
  displayName: string;
  /** Phone number shown as a secondary identifier for unsaved contacts. */
  phoneNumber?: string;
  /** Deterministic palette index into the sender-color set (DESIGN §1.2). */
  colorIndex: number;
  /** Uppercase first letter for the letter avatar (DESIGN §3.4). */
  initial: string;
}

/**
 * Discriminated union over message kinds (F-PAR-5). Every message carries the
 * common fields; `kind` selects the extra payload. Unknown content never
 * throws — it degrades to a `text` message (F-PAR-10, E2-4).
 */
export type MessageKind = 'text' | 'media' | 'system' | 'deleted' | 'call' | 'empty';

interface MessageBase {
  /** Stable id within a chat (index-based is fine; used as a React key). */
  id: string;
  kind: MessageKind;
  /** Author participant id. `null` for system messages with no author. */
  senderId: string | null;
  /** Epoch milliseconds in the export's local time (no timezone in exports). */
  timestamp: number;
  /** True when authored by the "me" participant (F-VIEW-1). Resolved post-parse. */
  outgoing: boolean;
  /** `<This message was edited>` seen and stripped (F-PAR-6, E2-7). */
  edited?: boolean;
}

/** Plain text message. `text` is raw (markers intact) for render-time formatting. */
export interface TextMessage extends MessageBase {
  kind: 'text';
  text: string;
}

/** Media message. `caption` is text that followed the attachment line (F-PAR-4). */
export interface MediaMessage extends MessageBase {
  kind: 'media';
  media: MediaRef;
  caption?: string;
}

/** System / notice message rendered as a centered pill (F-VIEW-6, E4-7). */
export interface SystemMessage extends MessageBase {
  kind: 'system';
  text: string;
  /** The E2E-encryption notice gets a distinct style (DESIGN §3.6). */
  system: 'generic' | 'encryption';
}

/** Deleted message placeholder (DESIGN §3.14). */
export interface DeletedMessage extends MessageBase {
  kind: 'deleted';
  /** You-deleted vs someone-else-deleted changes the copy. */
  byMe: boolean;
}

/** Call log entry, iOS exports only in v1 (F-PAR-7, E2-7, DESIGN §3.13). */
export interface CallMessage extends MessageBase {
  kind: 'call';
  callType: 'voice' | 'video';
  outcome: 'missed' | 'answered' | 'no-answer';
  /** Duration in seconds for answered calls. */
  durationSec?: number;
}

/** Empty body — "Message not included in export" (F-PAR-5, F-VIEW-12). */
export interface EmptyMessage extends MessageBase {
  kind: 'empty';
}

export type Message =
  | TextMessage
  | MediaMessage
  | SystemMessage
  | DeletedMessage
  | CallMessage
  | EmptyMessage;

/** Chat-level metadata (E2-5). */
export interface ChatMeta {
  /** Title from the export filename, or the first non-self sender. */
  title: string;
  isGroup: boolean;
  clockStyle: ClockStyle;
  dateOrder: DateOrder;
  messageCount: number;
  /** First and last message timestamps (epoch ms), for the footer (F-RES-5). */
  firstTimestamp: number;
  lastTimestamp: number;
}

/** The fully parsed chat the UI renders. */
export interface Chat {
  meta: ChatMeta;
  participants: Participant[];
  messages: Message[];
  /** Participant id guessed as "me" for the "Which one is you?" picker (F-NAV-1). */
  guessedMeId: string | null;
}

/**
 * Returned by date-order detection when the data is ambiguous (F-PAR-3, E2-3).
 * The import flow (E3-3) prompts the user to choose, then re-parses.
 */
export interface DateOrderChoice {
  needsUserChoice: true;
  /** Two sample lines rendered under each interpretation for the prompt. */
  samples: Array<{ raw: string; asDMY: string; asMDY: string }>;
}

/** Progress events posted from the worker pipeline (S-6, E2-6, E3-2). */
export type ParsePhase = 'reading' | 'unzipping' | 'parsing' | 'ready';

export interface ParseProgress {
  phase: ParsePhase;
  /** 0..1 within the current phase, when determinable. */
  fraction?: number;
}

/** Discriminated result of a parse attempt. */
export type ParseResult =
  | { ok: true; chat: Chat }
  | { ok: false; error: ParseError }
  | ({ ok: false } & DateOrderChoice);

/** User-facing error categories for friendly messages (F-IMP-4, E3-2). */
export type ParseErrorCode =
  | 'no-chat-file'
  | 'unrecognized-format'
  | 'corrupted-zip'
  | 'too-large'
  | 'unknown';

export interface ParseError {
  code: ParseErrorCode;
  /** Developer-facing detail; never contains chat content. */
  detail?: string;
}
