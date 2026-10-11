import { describe, expect, it } from 'vitest';
import type { Message } from './chat.ts';

/**
 * Smoke test for the shared contract: the `Message` union must narrow by `kind`.
 * This is a compile-time guarantee exercised at runtime so the scaffold has a
 * green unit test and the contract stays honest as it evolves.
 */
describe('Message discriminated union', () => {
  it('narrows to the payload for each kind', () => {
    const messages: Message[] = [
      { id: '1', kind: 'text', senderId: 'a', timestamp: 0, outgoing: false, text: 'hi' },
      {
        id: '2',
        kind: 'media',
        senderId: 'a',
        timestamp: 1,
        outgoing: true,
        media: {
          kind: 'image',
          entryName: 'IMG-1.jpg',
          fileName: 'IMG-1.jpg',
          mimeType: 'image/jpeg',
          resolved: true,
        },
      },
      {
        id: '3',
        kind: 'system',
        senderId: null,
        timestamp: 2,
        outgoing: false,
        text: 'E2E',
        system: 'encryption',
      },
    ];

    const kinds = messages.map((m) => {
      switch (m.kind) {
        case 'text':
          return m.text;
        case 'media':
          return m.media.kind;
        case 'system':
          return m.system;
        default:
          return m.kind;
      }
    });

    expect(kinds).toEqual(['hi', 'image', 'encryption']);
  });
});
