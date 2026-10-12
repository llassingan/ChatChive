/**
 * Chat metadata (backlog E2-5; PRD F-PAR-9, F-NAV-1).
 *
 * Builds the participant list, the chat title, group/personal detection and a
 * "me" guess from the header stream.
 *
 * It also repairs a Sprint 1 heuristic: `splitSender` reads a system notice
 * containing a colon as `Sender: body`, so `Rosa Lund changed the subject to
 * "Trip: Planning"` yields the fake sender `Rosa Lund changed the subject to
 * "Trip`. A candidate is reclassified as a system line when it carries a notice
 * phrase, or when it is a word-extension of a sender that stands alone
 * elsewhere in the file (see `analyzeSenders`).
 */

import type { Participant } from '../types/chat.ts';
import type { HeaderLine } from './header.ts';

/**
 * Notice phrases that only ever appear in a system line (E2-5, PRD F-PAR-9):
 * they mark a chat as a group, and they identify a line that a colon split into
 * a fake `Sender: body` pair (see the module comment).
 */
const NOTICE_PATTERN =
  /(created group|changed the subject|changed the group name|joined via an invite link|\badded\b|\bleft\b)/i;

/** A phone-number-looking sender: starts with a digit (or `+`) and has 6+ more. */
const PHONE = /^\+?\d[\d\s().-]{5,}$/;

/** True when a sender string is an unsaved phone number rather than a name. */
export function isPhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  return PHONE.test(trimmed) && trimmed.replace(/\D/g, '').length >= 7;
}

/** Stable id for an unsaved contact: `+1 555 019 2834` → `+15550192834`. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/\D/g, '');
}

/** Deterministic palette index into the sender-color set (DESIGN §1.2). */
export function colorIndexFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return (hash >>> 0) % 16;
}

/** Uppercase first letter for the letter avatar (DESIGN §3.4). */
export function initialFor(displayName: string): string {
  const match = displayName.match(/[A-Za-z0-9\u00C0-\u024F]/);
  return match ? match[0].toUpperCase() : '?';
}

/**
 * Title from the export filename (E2-5, PRD §5): `WhatsApp Chat with X` and
 * `WhatsApp Chat - X` both yield `X`. Returns null when the name carries no
 * title (`_chat.txt`), so the caller can fall back to a sender.
 */
export function titleFromFileName(fileName: string): string | null {
  const base = fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.(zip|txt)$/i, '')
    .trim();
  const withName = base.match(/^WhatsApp Chat with (.+)$/i);
  if (withName) return withName[1].trim();
  const dash = base.match(/^WhatsApp Chat - (.+)$/i);
  if (dash) return dash[1].trim();
  return null;
}

export interface SenderAnalysis {
  /** Real senders, in first-appearance order. */
  senders: string[];
  participants: Participant[];
  /** A group system notice was seen among the headers (E2-5). */
  hasGroupNotice: boolean;
  /** Map a real sender string to its participant id. */
  participantId(sender: string): string;
  /** True when a header's `sender` is really part of a system notice. */
  isSystemSender(sender: string): boolean;
}

/**
 * Resolve the header stream into real senders and participants, rejecting
 * mis-split system notices (see the module comment). Never throws.
 */
export function analyzeSenders(headers: HeaderLine[]): SenderAnalysis {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const header of headers) {
    if (header.sender === null) continue;
    if (!counts.has(header.sender)) order.push(header.sender);
    counts.set(header.sender, (counts.get(header.sender) ?? 0) + 1);
  }

  const rejected = new Set<string>();
  for (const candidate of order) {
    const candidateCount = counts.get(candidate) ?? 0;
    // A one-off string carrying a notice verb is the notice, not a participant.
    if (candidateCount <= 1 && NOTICE_PATTERN.test(candidate)) {
      rejected.add(candidate);
      continue;
    }
    for (const base of order) {
      if (base === candidate) continue;
      const baseCount = counts.get(base) ?? 0;
      // A confident sender (seen more than once) that a candidate merely
      // extends with more words is the real participant; the longer string is
      // the notice that a colon split in two (see the module comment).
      const extendsBase =
        candidate.length > base.length &&
        candidate.startsWith(base) &&
        candidate[base.length] === ' ';
      if (extendsBase && baseCount >= 2 && candidateCount <= baseCount) {
        rejected.add(candidate);
        break;
      }
    }
  }

  const senders = order.filter((sender) => !rejected.has(sender));
  const idBySender = new Map<string, string>();
  const participants: Participant[] = [];

  for (const sender of senders) {
    const phone = isPhoneNumber(sender);
    const id = phone ? normalizePhone(sender) : sender;
    idBySender.set(sender, id);

    const participant: Participant = {
      id,
      displayName: sender,
      colorIndex: colorIndexFor(id),
      initial: initialFor(sender),
    };
    if (phone) participant.phoneNumber = sender;

    participants.push(participant);
  }

  let hasGroupNotice = false;
  for (const header of headers) {
    const system = header.sender === null || rejected.has(header.sender);
    if (!system) continue;
    const text = header.sender === null ? header.body : `${header.sender}: ${header.body}`;
    if (NOTICE_PATTERN.test(text)) {
      hasGroupNotice = true;
      break;
    }
  }

  return {
    senders,
    participants,
    hasGroupNotice,
    participantId: (sender) =>
      idBySender.get(sender) ?? (isPhoneNumber(sender) ? normalizePhone(sender) : sender),
    isSystemSender: (sender) => rejected.has(sender),
  };
}

/** Group when more than two senders, or a group system notice was seen (E2-5). */
export function detectGroup(senders: string[], hasGroupNotice: boolean): boolean {
  return senders.length > 2 || hasGroupNotice;
}

/**
 * Guess "me" (F-NAV-1, PRD §5). A personal chat's title is the other person, so
 * the single remaining sender is the exporter. A group has no such signal, so
 * it returns null and the "Which one is you?" picker asks (E3-4); "Nobody" is
 * one of its options, so guessing there would only risk a wrong alignment.
 */
export function guessMeId(args: {
  isGroup: boolean;
  title: string;
  participants: Participant[];
}): string | null {
  if (args.isGroup) return null;
  const titleKey = args.title.trim().toLowerCase();
  const others = args.participants.filter(
    (participant) => participant.displayName.trim().toLowerCase() !== titleKey,
  );
  return others.length === 1 ? others[0].id : null;
}
