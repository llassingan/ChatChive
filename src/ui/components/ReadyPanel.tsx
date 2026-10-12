/**
 * Ready summary (E3-2 endpoint). Every value comes from the parsed `Chat`; the
 * message view is a later sprint, so the panel says so rather than drawing an
 * empty chat.
 */
import type { Chat } from '../../types/chat.ts';
import { formatDateRange, timeFormat } from '../format.ts';
import { Icon } from '../icons/index.ts';
import './ReadyPanel.css';

export interface ReadyPanelProps {
  chat: Chat;
  fileName: string;
  onClose: () => void;
}

export function ReadyPanel({ chat, fileName, onClose }: ReadyPanelProps) {
  const { meta, participants } = chat;

  const facts: Array<[string, string]> = [
    ['Chat', meta.isGroup ? 'Group' : 'Personal'],
    ['Messages', meta.messageCount.toLocaleString()],
    ['People', participants.length.toLocaleString()],
    ['Dates', formatDateRange(meta)],
    ['Starts', timeFormat.format(meta.firstTimestamp)],
    ['Clock', meta.clockStyle === '12h' ? '12-hour' : '24-hour'],
  ];

  return (
    <main className="ready">
      <span className="ready__check" aria-hidden="true">
        <Icon name="check" size={20} />
      </span>
      <h1 className="ready__title">{meta.title}</h1>
      <p className="ready__subtitle">Opened from {fileName}</p>

      <dl className="ready__facts">
        {facts.map(([label, value]) => (
          <div className="ready__fact" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="ready__notice">
        <h2 className="ready__notice-title">The message view is not here yet</h2>
        <p>
          The file parsed correctly and everything above is read from it. The bubbles, photos and
          voice notes arrive in the next release, so there is nothing to scroll yet.
        </p>
      </div>

      <button type="button" className="button button--quiet" onClick={onClose}>
        Close chat
      </button>
    </main>
  );
}
