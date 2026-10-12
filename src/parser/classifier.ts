/**
 * Body classifier (backlog E2-4; PRD F-PAR-4, F-PAR-5, F-PAR-10).
 *
 * Turns the header/continuation stream from `header.ts` into `Message[]`:
 * attachments, omitted media, deleted messages, system notices, locations,
 * empty bodies, and plain text. Nothing here throws: unknown content degrades
 * to a text message (F-PAR-10).
 */

import type { DateOrder, MediaKind, MediaRef, Message } from '../types/chat.ts';
import { toEpochMs, type HeaderLine, type ParsedLine } from './header.ts';

/** One file in the source archive, used to resolve attachment markers. */
export interface MediaEntry {
  /** Full zip entry name, e.g. "media/IMG-20260704-WA0000.jpg". */
  name: string;
  /** Uncompressed size in bytes. */
  size: number;
}

export interface ClassifyContext {
  dateOrder: DateOrder;
  /** Zip entries, for resolving attachment markers (F-PAR-5). */
  entries: MediaEntry[];
  /**
   * The guessed "me" participant id, or null. Set once the whole file has been
   * analyzed (E2-5), so `outgoing` is resolved here and not per line (F-VIEW-1).
   */
  meId: string | null;
  /** True when a header's `sender` is really part of a system notice (E2-5). */
  isSystemSender(sender: string): boolean;
  /** Map a real sender string to its participant id. */
  participantId(sender: string): string;
}

/** Android attachment marker: `IMG-1.jpg (file attached)`. */
const ANDROID_ATTACHED = /^(.*?)\s*\(file attached\)\s*$/i;

/** iOS attachment marker: `<attached: IMG-1.jpg>`. */
const IOS_ATTACHED = /^<attached:\s*(.+?)\s*>$/i;

/** Omitted-media notices, case-insensitive and locale-tolerant (F-PAR-5). */
const OMITTED = [
  /^<media omitted>$/i,
  /^media omitted$/i,
  /\bimage omitted\b/i,
  /\bvideo omitted\b/i,
  /\baudio omitted\b/i,
  /\bsticker omitted\b/i,
  /\bgif omitted\b/i,
  /\bdocument omitted\b/i,
  /\bcontact card omitted\b/i,
];

/** WhatsApp's deleted-message notices (DESIGN §3.14). */
const DELETED_BY_ME = /^you deleted this message\.?$/i;
const DELETED_BY_OTHER = /^this message was deleted\.?$/i;

/** The E2E-encryption notice gets a distinct system style (DESIGN §3.6). */
const ENCRYPTION = /end-to-end encrypted/i;

/** A bare location share: a maps link, or a `.`-prefixed lat,lng pair. */
const MAPS_LINK = /^https:\/\/maps\.(?:google\.com\/\?q=|apple\.com\/)[^\s]+$/i;
const LAT_LNG = /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
  mkv: 'video/x-matroska',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  amr: 'audio/amr',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
  vcf: 'text/vcard',
  apk: 'application/vnd.android.package-archive',
};

function extensionOf(fileName: string): string {
  const match = fileName.match(/\.([A-Za-z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function mimeTypeFor(fileName: string): string {
  return MIME_BY_EXT[extensionOf(fileName)] ?? 'application/octet-stream';
}

/**
 * Classify a media filename into a `MediaKind` (F-PAR-5, E2-4). Android names
 * are prefixed (`IMG-…`, `PTT-…`); iOS names are prefixed too but carry a
 * numeric id first (`00000012-PHOTO-….jpg`), so the marker is matched anywhere
 * in the name rather than only at the start.
 */
export function mediaKindFor(fileName: string): MediaKind {
  if (/\.vcf$/i.test(fileName)) return 'contact';
  if (/GIF/i.test(fileName)) return 'gif';
  if (/PHOTO-|IMG-/i.test(fileName)) return 'image';
  if (/VIDEO-|VID-/i.test(fileName)) return 'video';
  if (/PTT-/i.test(fileName)) return 'voice';
  if (/STICKER-|STK-/i.test(fileName)) return 'sticker';
  if (/AUDIO-|AUD-/i.test(fileName)) return 'audio';
  return 'document';
}

/** Match an attachment marker's filename to a zip entry (basename-tolerant). */
function resolveEntry(fileName: string, entries: MediaEntry[]): MediaEntry | null {
  const target = fileName.toLowerCase();
  const base = fileName.replace(/^.*[\\/]/, '').toLowerCase();
  let suffix: MediaEntry | null = null;
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (name === target || name.replace(/^.*[\\/]/, '') === base) return entry;
    if (suffix === null && name.endsWith(`/${base}`)) suffix = entry;
  }
  return suffix;
}

/** Build the `MediaRef` for an attachment marker, resolving it if possible. */
function buildMediaRef(fileName: string, entries: MediaEntry[]): MediaRef {
  const entry = resolveEntry(fileName, entries);
  const ref: MediaRef = {
    kind: mediaKindFor(fileName),
    entryName: entry ? entry.name : fileName,
    fileName,
    mimeType: mimeTypeFor(fileName),
    resolved: entry !== null,
  };
  if (entry) ref.byteSize = entry.size;
  return ref;
}

/** A bare location share (maps link or `.`-prefixed lat,lng); else null. */
function locationUrl(body: string): string | null {
  let value = body.trim();
  const prefixed = value.match(/^location:\s*(.+)$/i);
  if (prefixed) value = prefixed[1].trim();
  if (value.startsWith('.')) value = value.slice(1).trim();
  return MAPS_LINK.test(value) || LAT_LNG.test(value) ? value : null;
}

function isOmitted(body: string): boolean {
  const value = body.trim();
  return OMITTED.some((pattern) => pattern.test(value));
}

interface HeaderRecord {
  header: HeaderLine;
  continuations: string[];
}

/** Group parsed lines into header records, keeping orphan continuations. */
function toRecords(lines: ParsedLine[]): { leading: string[]; records: HeaderRecord[] } {
  const leading: string[] = [];
  const records: HeaderRecord[] = [];
  let current: HeaderRecord | null = null;

  for (const line of lines) {
    if (line.type === 'header') {
      current = { header: line, continuations: [] };
      records.push(current);
    } else if (current === null) {
      leading.push(line.text);
    } else {
      current.continuations.push(line.text);
    }
  }

  return { leading, records };
}

/** Join body lines, dropping blank lines at the edges but keeping inner ones. */
function joinBody(parts: string[]): string {
  let start = 0;
  let end = parts.length;
  while (start < end && parts[start].trim() === '') start += 1;
  while (end > start && parts[end - 1].trim() === '') end -= 1;
  return parts.slice(start, end).join('\n');
}

export function classifyMessages(lines: ParsedLine[], ctx: ClassifyContext): Message[] {
  const messages: Message[] = [];
  const { leading, records } = toRecords(lines);

  if (leading.length > 0) {
    messages.push({
      id: 'm0',
      kind: 'text',
      senderId: null,
      timestamp: 0,
      outgoing: false,
      text: joinBody(leading),
    });
  }

  for (const { header, continuations } of records) {
    const id = `m${messages.length}`;
    const timestamp = toEpochMs(header.timestamp, ctx.dateOrder);

    // A sender-less header, or a sender that is really part of a notice, is a
    // system message (E2-2, E2-5).
    if (header.sender === null || ctx.isSystemSender(header.sender)) {
      const notice = header.sender === null ? header.body : `${header.sender}: ${header.body}`;
      const text = joinBody([notice, ...continuations]);
      messages.push({
        id,
        kind: 'system',
        senderId: null,
        timestamp,
        outgoing: false,
        text,
        system: ENCRYPTION.test(text) ? 'encryption' : 'generic',
      });
      continue;
    }

    const senderId = ctx.participantId(header.sender);
    const base = {
      id,
      senderId,
      timestamp,
      outgoing: senderId === ctx.meId,
    } as const;
    const body = header.body.trim();

    // Two phrasings: WhatsApp writes "You deleted this message" for the
    // exporter's own deletions and "This message was deleted" otherwise, so
    // either signal alone is enough (DESIGN §3.14).
    if (DELETED_BY_ME.test(body)) {
      messages.push({ ...base, kind: 'deleted', byMe: true });
      continue;
    }
    if (DELETED_BY_OTHER.test(body)) {
      messages.push({ ...base, kind: 'deleted', byMe: base.outgoing });
      continue;
    }

    if (isOmitted(header.body)) {
      messages.push({ ...base, kind: 'empty' });
      continue;
    }

    const attached = header.body.match(IOS_ATTACHED) ?? header.body.match(ANDROID_ATTACHED);
    if (attached) {
      const media = buildMediaRef(attached[1].trim(), ctx.entries);
      const caption = joinBody(continuations);
      const message: Message = { ...base, kind: 'media', media };
      if (caption !== '') message.caption = caption;
      messages.push(message);
      continue;
    }

    const location = locationUrl(header.body);
    if (location !== null && continuations.every((line) => line.trim() === '')) {
      messages.push({
        ...base,
        kind: 'media',
        media: {
          kind: 'location',
          entryName: '',
          fileName: location,
          mimeType: '',
          resolved: false,
        },
      });
      continue;
    }

    const text = joinBody([header.body, ...continuations]);
    if (text.trim() === '') {
      messages.push({ ...base, kind: 'empty' });
      continue;
    }

    messages.push({ ...base, kind: 'text', text });
  }

  return messages;
}
