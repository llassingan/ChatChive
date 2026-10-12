/**
 * Chat view shell (backlog E4, E3-4; PRD F-RES-1, F-RES-5).
 *
 * Header (back, title, participant count, menu), the virtualized message list,
 * and a read-only footer that replaces WhatsApp's composer: message count, date
 * range, and the controls that exist this sprint. Search and jump-to-date are
 * E7 and are not drawn, so no dead control ships (R-26).
 *
 * Alignment: `meId` lives here and drives `alignToMe`, so changing who you are
 * re-renders the list instantly without a re-parse (E3-4). The picker opens on
 * arrival only for a group, where the parser has no signal to guess from.
 */
import { useMemo, useRef, useState } from 'react';
import { alignToMe, needsMeChoice } from '../../parser/me.ts';
import type { Chat } from '../../types/chat.ts';
import { formatDateRange } from '../format.ts';
import { Icon } from '../icons/index.ts';
import { Dialog } from '../components/Dialog.tsx';
import { MessageList } from './MessageList.tsx';
import { MePicker } from './MePicker.tsx';
import { Avatar } from './MessageRow.tsx';
import './ChatView.css';

export interface ChatViewProps {
  chat: Chat;
  /** Back to the chat list / landing page (F-RES-1). */
  onClose: () => void;
  /**
   * True when the shell renders this view as the right-hand pane of the
   * two-column frame (E6-2). The pane drops the `100dvh` height because the
   * shell owns it.
   *
   * The back chevron deliberately stays at every width (Amendment A1, §3.5
   * withdrawn). It shares the one `onClose` with the panel row and "Close chat",
   * and below 768px, where the panel is `display: none`, it is the only back
   * affordance left. Hiding it at web widths would also drop it from the
   * accessibility tree, turning `getByRole('button', { name: 'Back' })` into
   * zero matches at Playwright's 1280x720 default.
   *
   * Required rather than optional: the shell is the only render site, so a
   * second one has to state its intent instead of inheriting a default no
   * reachable path uses.
   */
  pane: boolean;
}

export function ChatView({ chat, onClose, pane }: ChatViewProps) {
  // The chosen "me", or null for "Nobody". Seeded from the parser's guess.
  const [meId, setMeId] = useState<string | null>(chat.guessedMeId);
  const [answered, setAnswered] = useState(!needsMeChoice(chat));
  const [pickerForced, setPickerForced] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);

  const aligned = useMemo(() => alignToMe(chat, meId), [chat, meId]);

  // A group with no filename signal asks on arrival (E3-4); a personal chat is
  // already answered by the title, so it opens without interrupting. Answering
  // "Nobody" counts as an answer, so the prompt does not return.
  const pickerOpen = pickerForced || !answered;

  const messageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of chat.messages) {
      if (message.senderId === null || message.kind === 'system') continue;
      counts.set(message.senderId, (counts.get(message.senderId) ?? 0) + 1);
    }
    return counts;
  }, [chat.messages]);

  const headerParticipant = useMemo(
    () => chat.participants.find((participant) => participant.id === meId) ?? null,
    [chat.participants, meId],
  );

  const count = aligned.meta.messageCount;

  function choose(participantId: string | null) {
    setMeId(participantId);
    setAnswered(true);
    setPickerForced(false);
    menuRef.current?.removeAttribute('open');
  }

  return (
    <div className={pane ? 'chat chat--pane' : 'chat'}>
      <header className="chat__header">
        <button type="button" className="icon-button" onClick={onClose}>
          <Icon name="chevron-left" size={24} title="Back" />
        </button>

        <span className="chat__identity">
          {headerParticipant ? (
            <Avatar participant={headerParticipant} />
          ) : (
            <span className="avatar avatar--group" aria-hidden="true">
              <Icon name="people" size={18} />
            </span>
          )}
          <span className="chat__titles">
            <span className="chat__title">{aligned.meta.title}</span>
            <span className="chat__subtitle">
              {aligned.meta.isGroup
                ? `${chat.participants.length} people`
                : headerParticipant
                  ? headerParticipant.displayName
                  : 'Read only'}
            </span>
          </span>
        </span>

        <details className="chat__menu" ref={menuRef}>
          <summary className="icon-button" aria-label="Chat options">
            <Icon name="more-vertical" size={22} />
          </summary>
          <div className="chat__menu-panel">
            <button type="button" className="chat__menu-item" onClick={() => setPickerForced(true)}>
              {meId === null ? 'Choose who you are' : 'Change who you are'}
            </button>
            <button type="button" className="chat__menu-item" onClick={onClose}>
              Close chat
            </button>
          </div>
        </details>
      </header>

      <MessageList chat={aligned} />

      {/* Read-only footer replacing the composer (F-RES-5). Every value is real
          and read from the export; nothing here pretends to send a message. */}
      <footer className="chat__footer">
        <span className="chat__footer-stat">
          {count === 1 ? '1 message' : `${count.toLocaleString()} messages`}
        </span>
        <span className="chat__footer-sep" aria-hidden="true" />
        <span className="chat__footer-stat">{formatDateRange(aligned.meta)}</span>
        <span className="chat__footer-note">Read only</span>
      </footer>

      {/* Mounted only while open: a closed native dialog is hidden, but keeping a
          long participant list in the DOM for nothing is waste, and it made
          unrelated selectors ambiguous. */}
      {pickerOpen ? (
        <Dialog
          open
          title={meId === null ? 'Which one is you?' : 'Who are you in this chat?'}
          onClose={() => setPickerForced(false)}
        >
          <MePicker
            participants={chat.participants}
            selectedId={meId}
            messageCounts={messageCounts}
            onChoose={choose}
            onCancel={() => setPickerForced(false)}
          />
        </Dialog>
      ) : null}
    </div>
  );
}
