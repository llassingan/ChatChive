import { describe, expect, it } from 'vitest';
import type { Chat, MediaMessage, Message, Participant } from '../../types/chat.ts';
import {
  bodyRuns,
  findMatches,
  matchesInMessage,
  messageBody,
  normalise,
  searchChat,
} from './search.ts';

/**
 * Unit coverage for the pure half of search (E7-1). The rules a browser test
 * cannot see are here: how a query is folded, that matches index the text the
 * reader sees rather than the raw body, which fields are searched, which message
 * kinds are skipped, and that the flat match list is in reading order.
 */

function participant(id: string, displayName: string): Participant {
  return { id, displayName, initial: displayName.slice(0, 1), colorIndex: 0 };
}

function textMessage(id: string, senderId: string | null, text: string): Message {
  return {
    id,
    kind: 'text',
    senderId,
    timestamp: Date.UTC(2026, 5, 2, 12, 0),
    outgoing: false,
    text,
  };
}

function mediaMessage(id: string, senderId: string, caption?: string): MediaMessage {
  return {
    id,
    kind: 'media',
    senderId,
    timestamp: Date.UTC(2026, 5, 2, 12, 0),
    outgoing: false,
    media: {
      kind: 'image',
      fileName: 'IMG-20260602-WA0010.jpg',
      entryName: 'IMG-20260602-WA0010.jpg',
      mimeType: 'image/jpeg',
      resolved: true,
    },
    ...(caption === undefined ? {} : { caption }),
  };
}

function chatWith(messages: Message[], participants: Participant[] = []): Chat {
  return {
    meta: {
      title: 'Test',
      isGroup: false,
      clockStyle: '24h',
      dateOrder: 'MDY',
      messageCount: messages.length,
      firstTimestamp: messages[0]?.timestamp ?? 0,
      lastTimestamp: messages[messages.length - 1]?.timestamp ?? 0,
    },
    participants,
    messages,
    guessedMeId: null,
  };
}

describe('normalise', () => {
  it('strips accents so a plain query matches an accented word', () => {
    expect(normalise('café')).toBe('cafe');
    expect(normalise('CAFÉ')).toBe('cafe');
    expect(normalise('Café')).toBe('cafe');
  });

  it('folds the Turkish dotted capital I', () => {
    expect(normalise('İ')).toBe('i');
    expect(normalise('Istanbul')).toBe('istanbul');
  });

  it('leaves emoji and non-Latin scripts readable', () => {
    expect(normalise('👍')).toBe('👍');
    expect(normalise('Süd')).toBe('sud');
  });
});

describe('findMatches', () => {
  it('finds every occurrence, in order and non-overlapping', () => {
    expect(findMatches('cafe, cafe and cafe', 'cafe')).toEqual([
      { start: 0, end: 4 },
      { start: 6, end: 10 },
      { start: 15, end: 19 },
    ]);
    // `aaaa` holds one non-overlapping `aa`, not three.
    expect(findMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('matches across the accent boundary in both directions', () => {
    // The range indexes the haystack: `café` is four characters of UTF-16.
    expect(findMatches('café', 'cafe')).toEqual([{ start: 0, end: 4 }]);
    expect(findMatches('cafe', 'café')).toEqual([{ start: 0, end: 4 }]);
    expect(findMatches('un CAFÉ noir', 'café')).toEqual([{ start: 3, end: 7 }]);
  });

  it('keeps a range whole for an emoji query', () => {
    // The rocket is one astral code point: two UTF-16 units, and the range must
    // cover both rather than half a pair.
    expect(findMatches('hi 🚀 there', '🚀')).toEqual([{ start: 3, end: 5 }]);
    expect(findMatches('🎉🎉', '🎉')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    expect(findMatches('no match here', '🚀')).toEqual([]);
  });

  it('includes a combining mark that follows the matched letter', () => {
    // `e` + U+0301 renders as one letter, so the highlight has to cover the
    // mark, and the offsets still index the original.
    expect(findMatches('cafe\u0301 time', 'cafe')).toEqual([{ start: 0, end: 5 }]);
  });

  it('matches nothing for a blank query, an empty haystack or an over-long query', () => {
    expect(findMatches('anything', '')).toEqual([]);
    expect(findMatches('anything', '   ')).toEqual([]);
    expect(findMatches('', 'cafe')).toEqual([]);
    expect(findMatches('ca', 'cafe')).toEqual([]);
  });
});

describe('bodyRuns', () => {
  it('returns the rendered text, so markers are not in the offsets', () => {
    expect(bodyRuns('This is *bold* here')).toEqual([{ key: '0:-1', text: 'This is bold here' }]);
  });

  it('gives each list item and fenced block its own run', () => {
    expect(bodyRuns('- first\n- second')).toEqual([
      { key: '0:0', text: 'first' },
      { key: '0:1', text: 'second' },
    ]);
    expect(bodyRuns('```\nconst a = 1;\n```')).toEqual([{ key: '0:-1', text: 'const a = 1;' }]);
  });

  it('keeps a quote run and a paragraph run apart', () => {
    expect(bodyRuns('> quoted\nplain')).toEqual([
      { key: '0:-1', text: 'quoted' },
      { key: '1:-1', text: 'plain' },
    ]);
  });
});

describe('messageBody', () => {
  it('reads a text message and a caption, and nothing else', () => {
    expect(messageBody(textMessage('1', 'a', 'hello'))).toBe('hello');
    expect(messageBody(mediaMessage('2', 'a', 'the view from the deck'))).toBe(
      'the view from the deck',
    );
    expect(messageBody(mediaMessage('3', 'a'))).toBeNull();
    expect(
      messageBody({
        id: '4',
        kind: 'deleted',
        senderId: 'a',
        timestamp: 0,
        outgoing: false,
        byMe: false,
      }),
    ).toBeNull();
    expect(
      messageBody({ id: '5', kind: 'empty', senderId: 'a', timestamp: 0, outgoing: false }),
    ).toBeNull();
    expect(
      messageBody({
        id: '6',
        kind: 'system',
        senderId: null,
        timestamp: 0,
        outgoing: false,
        text: 'notice',
        system: 'generic',
      }),
    ).toBeNull();
  });
});

describe('matchesInMessage', () => {
  const participants = [participant('nadia', 'Nadia Rush'), participant('felix', 'Felix Dörn')];

  it('reports a body match at its offset in the rendered run', () => {
    const chat = chatWith([textMessage('m1', 'nadia', 'the *cabin* is booked')], participants);
    // "the cabin is booked": `cabin` starts at 4 once the markers are gone.
    expect(matchesInMessage(chat, chat.messages[0], 'cabin')).toEqual([
      {
        messageId: 'm1',
        messageIndex: -1,
        field: 'text',
        blockIndex: 0,
        itemIndex: -1,
        start: 4,
        end: 9,
      },
    ]);
  });

  it('finds a sender name and marks the field', () => {
    const chat = chatWith([textMessage('m1', 'felix', 'projector is ready')], participants);
    expect(matchesInMessage(chat, chat.messages[0], 'dorn')).toEqual([
      { messageId: 'm1', messageIndex: -1, field: 'sender', start: 6, end: 10 },
    ]);
  });

  it('searches a caption and never the filename', () => {
    const chat = chatWith([mediaMessage('p1', 'nadia', 'the view from the deck')], participants);
    expect(matchesInMessage(chat, chat.messages[0], 'view').map((m) => m.field)).toEqual([
      'caption',
    ]);
    expect(matchesInMessage(chat, chat.messages[0], 'IMG-2026')).toEqual([]);
  });

  it('does not search a system notice', () => {
    const chat = chatWith(
      [
        {
          id: 's1',
          kind: 'system',
          senderId: null,
          timestamp: 0,
          outgoing: false,
          text: 'Messages and calls are end-to-end encrypted.',
          system: 'encryption',
        },
      ],
      participants,
    );
    expect(matchesInMessage(chat, chat.messages[0], 'messages')).toEqual([]);
  });

  it('finds every hit inside one message, body first', () => {
    const chat = chatWith(
      [textMessage('m1', 'nadia', 'cabin cabin')],
      [participant('nadia', 'Cabin Crew')],
    );
    expect(matchesInMessage(chat, chat.messages[0], 'cabin')).toEqual([
      {
        messageId: 'm1',
        messageIndex: -1,
        field: 'text',
        blockIndex: 0,
        itemIndex: -1,
        start: 0,
        end: 5,
      },
      {
        messageId: 'm1',
        messageIndex: -1,
        field: 'text',
        blockIndex: 0,
        itemIndex: -1,
        start: 6,
        end: 11,
      },
      { messageId: 'm1', messageIndex: -1, field: 'sender', start: 0, end: 5 },
    ]);
  });

  it('returns nothing for a blank query', () => {
    const chat = chatWith([textMessage('m1', 'nadia', 'cabin')], participants);
    expect(matchesInMessage(chat, chat.messages[0], '   ')).toEqual([]);
  });
});

describe('searchChat', () => {
  const participants = [participant('nadia', 'Nadia Rush'), participant('felix', 'Felix Dörn')];

  it('groups matches by message and numbers them by message index', () => {
    const chat = chatWith(
      [
        textMessage('m1', 'nadia', 'Cabin is booked'),
        textMessage('m2', 'felix', 'Great, I will bring the projector'),
        textMessage('m3', 'nadia', 'the cabin again'),
      ],
      participants,
    );

    const results = searchChat(chat, 'CABIN');
    expect(results.messages.map((entry) => entry.messageIndex)).toEqual([0, 2]);
    expect(results.matches.map((match) => match.messageIndex)).toEqual([0, 2]);
    expect(results.byMessage.get(0)?.matches[0]).toMatchObject({
      field: 'text',
      start: 0,
      end: 5,
    });
  });

  it('orders the flat list by message, and inside a message by position', () => {
    const chat = chatWith(
      [
        textMessage('m1', 'nadia', 'cabin at the cafe'),
        textMessage('m2', 'felix', 'the cabin has a cafe too'),
      ],
      participants,
    );

    expect(searchChat(chat, 'cafe').matches.map((m) => [m.messageIndex, m.start])).toEqual([
      [0, 13],
      [1, 16],
    ]);
  });

  it('returns an empty result for an empty or whitespace-only query', () => {
    const chat = chatWith([textMessage('m1', 'nadia', 'Cabin is booked')], participants);
    for (const query of ['', '   ']) {
      const results = searchChat(chat, query);
      expect(results.messages).toEqual([]);
      expect(results.matches).toEqual([]);
      expect(results.needle).toBe('');
    }
  });
});
