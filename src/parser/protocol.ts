/**
 * Message protocol between the main thread and the parsing worker (backlog
 * E2-6). Frozen interface: `client.ts` implements the calling side and
 * `worker.ts` the answering side, so a change here touches both.
 *
 * Why a worker at all (PRD S-6): unzipping and parsing a large export on the
 * main thread freezes the tab. The worker also keeps the archive in memory
 * after parsing, so one media file can be inflated on demand instead of
 * unpacking a whole export up front (PRD §10, backlog E5-1).
 */

import type { DateOrder, ParseProgress, ParseResult } from '../types/chat.ts';

/**
 * Start parsing an export. `dateOrder` is non-null only when the user answered
 * the DD/MM vs MM/DD prompt (E3-3); otherwise the pipeline detects it, and may
 * come back with `needsUserChoice`.
 */
export interface ParseRequest {
  type: 'parse';
  file: File;
  dateOrder: DateOrder | null;
}

/** Inflate one archive entry by name, for lazy media loading (E5-1). */
export interface ExtractRequest {
  type: 'extract';
  /** Correlates the response with the pending caller. */
  id: number;
  entryName: string;
}

export type WorkerRequest = ParseRequest | ExtractRequest;

/** Emitted while parsing: one per phase change, plus a final one before the result. */
export interface ProgressResponse {
  type: 'progress';
  progress: ParseProgress;
}

/** The parse outcome. Sent exactly once per ParseRequest, never both here and via error. */
export interface ResultResponse {
  type: 'result';
  result: ParseResult;
}

/**
 * The bytes of one entry as a Blob, or null when the entry is missing or was
 * rejected by the zip-safety rules (path traversal, size cap).
 */
export interface MediaResponse {
  type: 'media';
  id: number;
  blob: Blob | null;
}

export type WorkerResponse = ProgressResponse | ResultResponse | MediaResponse;
