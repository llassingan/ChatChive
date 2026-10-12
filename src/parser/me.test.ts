/**
 * "Which one is you?" resolution (E3-4). The interesting cases are the ones the
 * heuristic cannot answer (a group) and the ones where re-aligning must flip
 * both directions in one pass.
 */

import { describe, expect, it } from 'vitest';
import { parseChatText } from './pipeline.ts';
import { alignToMe, needsMeChoice, normalizeMeId } from './me.ts';
import { fixtures } from './fixtures/index.ts';

function chatOf(text: string, fileName = '') {
  // Both fixtures could be read either way; the group one is used for alignment
  // only, so pin the order the parser would have been given by the E3-3 prompt.
  const result = parseChatText(text, { fileName, dateOrder: 'MDY' });
  if (!result.ok) throw new Error('fixture failed to parse');
  return result.chat;
}

const group = chatOf(fixtures['group-android-en'], 'WhatsApp Chat with Trip Planning.txt');
const personal = chatOf(fixtures['android-en-md-24h'], 'WhatsApp Chat with Mira Vale.txt');

describe('alignToMe', () => {
  it('marks the chosen participant outgoing and the rest incoming', () => {
    const [nadia, felix] = group.participants;
    const aligned = alignToMe(group, nadia.id);

    for (const message of aligned.messages) {
      if (message.kind === 'system') continue;
      expect(message.outgoing).toBe(message.senderId === nadia.id);
    }
    expect(aligned.messages.some((m) => m.senderId === felix.id && m.outgoing)).toBe(false);
  });

  it('flips an already-aligned chat to a different participant', () => {
    const [nadia, felix] = group.participants;
    const asNadia = alignToMe(group, nadia.id);
    const asFelix = alignToMe(asNadia, felix.id);

    const nadiaBubble = asFelix.messages.find((m) => m.senderId === nadia.id && m.kind === 'text');
    const felixBubble = asFelix.messages.find((m) => m.senderId === felix.id);
    expect(nadiaBubble?.outgoing).toBe(false);
    expect(felixBubble?.outgoing).toBe(true);
  });

  it('puts everyone on the left for "Nobody"', () => {
    const aligned = alignToMe(personal, null);
    expect(aligned.messages.every((message) => !message.outgoing)).toBe(true);
    expect(aligned.guessedMeId).toBeNull();
  });

  it('returns the same object when the choice is unchanged (no wasted pass)', () => {
    expect(alignToMe(personal, personal.guessedMeId)).toBe(personal);
  });

  it('never marks a system message outgoing, whoever is chosen', () => {
    const aligned = alignToMe(group, group.participants[0].id);
    const systems = aligned.messages.filter((message) => message.kind === 'system');
    expect(systems.length).toBeGreaterThan(0);
    expect(systems.every((message) => !message.outgoing && message.senderId === null)).toBe(true);
  });

  it('records the choice on guessedMeId so downstream reads one field', () => {
    const [nadia] = group.participants;
    expect(alignToMe(group, nadia.id).guessedMeId).toBe(nadia.id);
  });
});

describe('needsMeChoice', () => {
  it('asks for a group, where the heuristic has no signal', () => {
    expect(needsMeChoice(group)).toBe(true);
  });

  it('does not ask for a personal chat the filename already answered', () => {
    expect(personal.guessedMeId).not.toBeNull();
    expect(needsMeChoice(personal)).toBe(false);
  });
});

describe('normalizeMeId', () => {
  it('passes through a participant id and null', () => {
    const [nadia] = group.participants;
    expect(normalizeMeId(group, nadia.id)).toBe(nadia.id);
    expect(normalizeMeId(group, null)).toBeNull();
  });

  it('drops an id that is not in this chat back to "Nobody"', () => {
    expect(normalizeMeId(group, 'someone-else')).toBeNull();
  });
});
