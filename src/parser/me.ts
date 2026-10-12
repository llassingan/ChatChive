/**
 * "Which one is you?" resolution (backlog E3-4; PRD F-NAV-1).
 *
 * The classifier sets `outgoing` from the guessed "me" participant, but the
 * guess is right only for a personal chat whose filename names the other
 * person. A group has no such signal, and anyone can change the answer later
 * from the chat header, so alignment has to be re-derivable without re-parsing:
 * the archive is gone by then (the session closes after import, F-NAV-6).
 *
 * `alignToMe` is pure and touches no media, so it is cheap enough to run on a
 * 100k-message chat the moment the user picks (PRD §9). It rewrites only
 * `outgoing`, `guessedMeId` and `isGroup` is left alone.
 */

import type { Chat, Message } from '../types/chat.ts';

/**
 * Re-align a parsed chat to a chosen participant. `meId` is an id from
 * `chat.participants`, or null for "Nobody" (everyone on the left, which is what
 * an unknown exporter should look like rather than a wrongly-aligned half).
 *
 * The returned chat carries the choice in `guessedMeId`, so the field is the
 * single source of truth downstream: the view reads it as "me" whether it came
 * from the heuristic or from the user.
 */
export function alignToMe(chat: Chat, meId: string | null): Chat {
  if (chat.guessedMeId === meId) return chat;

  const messages: Message[] = chat.messages.map((message) =>
    message.outgoing === (message.senderId !== null && message.senderId === meId)
      ? message
      : { ...message, outgoing: message.senderId !== null && message.senderId === meId },
  );

  return { ...chat, guessedMeId: meId, messages };
}

/**
 * Whether to ask outright instead of trusting the guess. A personal chat has
 * one possible other person, so the heuristic is reliable (PRD §5) and asking
 * would only interrupt. A group has several senders and no filename hint, so
 * the exporter is a real question (E3-4).
 */
export function needsMeChoice(chat: Chat): boolean {
  return chat.meta.isGroup && chat.guessedMeId === null;
}

/** A participant id that is really in this chat, or null for "Nobody". */
export function normalizeMeId(chat: Chat, meId: string | null): string | null {
  if (meId === null) return null;
  return chat.participants.some((participant) => participant.id === meId) ? meId : null;
}
