/**
 * The chat list panel (E6-2; DESIGN §2.2, §3.2 in the plan).
 *
 * One row: the open chat. The app holds a single parsed export, so the panel is
 * not a list of choices, it is a statement of which chat is open, and clicking
 * its one row closes the chat (the honest meaning of "select the chat that is
 * already selected" here). It carries no search field: a filter over one row can
 * never filter anything, so it would ship a dead control (§3.2, R-26).
 *
 * The row's text is assembled as separate elements on purpose (§4.8): the title
 * element carries the title only, the preview carries the preview only, and the
 * time is a third element, so a `getByText(title, { exact: true })` assertion
 * resolves to the title element rather than to the row's concatenated label.
 * It does not make the title unique on the page, though: the pane header renders
 * it too, and that duplication is why the two `getByText` title assertions in
 * `chat.spec.ts`, `flow.spec.ts` and `no-network.spec.ts` had to be scoped to
 * the pane header after this row landed (measured: four strict-mode violations,
 * all on the title, none on the preview).
 *
 * The panel is `display: none` below 768px (ChatShell.css), so on mobile this
 * markup is present but hidden.
 */
import type { Chat, Message } from '../../types/chat.ts';
import { formatClock } from '../format.ts';
import { toPlainText } from '../formatText.ts';
import { Icon } from '../icons/index.ts';
import { Avatar } from '../chat/MessageRow.tsx';
import { MEDIA_META } from '../chat/mediaMeta.ts';
import './ChatPanel.css';

export interface ChatPanelProps {
  chat: Chat;
  /**
   * Close the open chat. The panel holds exactly one row and that row is always
   * the open chat, so the row's honest action is to close it.
   */
  onClose: () => void;
}

/** The chat's own identity: the person the chat is with, or the group glyph. */
function chatParticipant(chat: Chat) {
  if (chat.meta.isGroup) return null;
  return (
    chat.participants.find((participant) => participant.displayName === chat.meta.title) ??
    chat.participants.find((participant) => participant.id !== chat.guessedMeId) ??
    null
  );
}

/**
 * The row's preview line: the newest message, said the way the bubble says it
 * (A3). A text or caption body goes through `toPlainText`, because `text`
 * arrives raw with its markers intact: without it the panel would print
 * `A *bold* reply` beside a bubble that renders bold. The placeholder and call
 * kinds reuse the bubble's own honest words rather than inventing a summary.
 *
 * A media message with no caption says the kind's label from `MEDIA_META`, the
 * same map the bubble reads. This file used to carry a copy of it; two identical
 * maps cannot drift if there is only one (E5, Sprint 4 §8.3).
 */
function previewOf(message: Message | undefined): string | null {
  if (!message) return null;
  switch (message.kind) {
    case 'text':
    case 'system':
      return toPlainText(message.text);
    case 'media':
      return message.caption ? toPlainText(message.caption) : MEDIA_META[message.media.kind].label;
    case 'deleted':
      return message.byMe ? 'You deleted this message' : 'This message was deleted';
    case 'empty':
      return 'Message not included in export';
    case 'call': {
      // DESIGN §3.13's own titles, not a new vocabulary.
      const medium = message.callType === 'video' ? 'video' : 'voice';
      return message.outcome === 'missed' ? `Missed ${medium} call` : `${medium} call`;
    }
    default:
      return null;
  }
}

export function ChatPanel({ chat, onClose }: ChatPanelProps) {
  const participant = chatParticipant(chat);
  const last = chat.messages[chat.messages.length - 1];
  const preview = previewOf(last);

  return (
    <nav className="chat-panel" aria-label="Chats">
      <button type="button" className="chat-panel__row" onClick={onClose}>
        {participant ? (
          <Avatar participant={participant} />
        ) : (
          <span className="avatar avatar--group" aria-hidden="true">
            <Icon name="people" size={18} />
          </span>
        )}
        <span className="chat-panel__text">
          <span className="chat-panel__title">{chat.meta.title}</span>
          {preview ? <span className="chat-panel__preview">{preview}</span> : null}
        </span>
        {last ? (
          <time className="chat-panel__time">
            {formatClock(last.timestamp, chat.meta.clockStyle)}
          </time>
        ) : null}
      </button>
    </nav>
  );
}
