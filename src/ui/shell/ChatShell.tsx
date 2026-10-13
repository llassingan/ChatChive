/**
 * Two-column shell (E6-2; PRD F-RES-2, DESIGN §2.2).
 *
 * One frame for both shells: the chat panel on the left and the chat pane on
 * the right. Below 768px the panel is `display: none` and `.chat-shell` is a
 * single column, so "mobile shell" and "desktop shell" differ by CSS alone
 * (§2.4). No `matchMedia`, no JS breakpoint: jsdom does not implement it, and a
 * JS tier would fight the CSS tiers `MessageRow.css`, `MessageList.css`,
 * `Landing.css` and `tokens.css` already declare at 768px.
 *
 * The shell owns the history entry the browser Back button consumes
 * (`useHistoryBack`, §3.4) and passes one `onClose` to both columns, so the
 * panel row, the header Back button and "Close chat" share a single close path.
 */
import type { ChatSession } from '../../parser/client.ts';
import type { Chat } from '../../types/chat.ts';
import { useHistoryBack } from '../import/useHistoryBack.ts';
import { ChatView } from '../chat/ChatView.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import './ChatShell.css';

export interface ChatShellProps {
  chat: Chat;
  /**
   * The live parse session, handed down to the message list so media is
   * extracted lazily while the chat is open (E5-1, plan §2.4). The shell is the
   * only render site, so the prop is required and may only be null in a test.
   */
  session: ChatSession | null;
  /** Panel and pane share one close path (the browser back button included). */
  onClose: () => void;
}

export function ChatShell({ chat, session, onClose }: ChatShellProps) {
  const { close } = useHistoryBack(onClose);

  return (
    <div className="chat-shell">
      <ChatPanel chat={chat} onClose={close} />

      <div className="chat-shell__pane">
        {/* The one decorative surface in the sprint (DESIGN §6): original line
            art, tiled, at --wallpaper-stroke. It sits behind the message list;
            the header and footer keep their own surfaces, as DESIGN §2.2 draws
            them. */}
        <div className="chat-shell__wallpaper" aria-hidden="true" />
        <ChatView chat={chat} session={session} onClose={close} pane />
      </div>
    </div>
  );
}
