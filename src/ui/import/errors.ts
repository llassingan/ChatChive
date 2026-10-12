/**
 * Friendly error messages per `ParseErrorCode`. Never include a stack trace or
 * chat content; that is what the optional `detail` field is for in debug logs.
 */
import type { ParseErrorCode } from '../../types/chat.ts';

interface Message {
  title: string;
  body: string;
}

export function describeError(code: ParseErrorCode): Message {
  switch (code) {
    case 'no-chat-file':
      return {
        title: 'No chat file found',
        body:
          'We could not find a text file inside that zip. A WhatsApp export must contain a ' +
          'file named _chat.txt or something like WhatsApp Chat with ....txt.',
      };
    case 'unrecognized-format':
      return {
        title: 'Not a chat export',
        body:
          'That file is not a WhatsApp chat export. Open the .txt or .zip file that WhatsApp ' +
          'created, not a folder or another kind of file.',
      };
    case 'corrupted-zip':
      return {
        title: 'The zip does not look complete',
        body:
          'The zip file appears damaged and cannot be opened. Try exporting the chat again from ' +
          'WhatsApp, then open the new file.',
      };
    case 'too-large':
      return {
        title: 'Too large to open here',
        body:
          'This export is too big for this device to open right now. Try exporting the chat ' +
          'again without media, which produces a much smaller file.',
      };
    default:
      return {
        title: 'Could not read the file',
        body:
          'Something went wrong while reading this file. Trying again may help. If it keeps ' +
          'failing, the export format may have changed.',
      };
  }
}
