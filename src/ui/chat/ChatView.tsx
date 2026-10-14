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
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChatSession } from '../../parser/client.ts';
import { alignToMe, needsMeChoice } from '../../parser/me.ts';
import type { Chat } from '../../types/chat.ts';
import { formatDateRange } from '../format.ts';
import { Icon } from '../icons/index.ts';
import { Dialog } from '../components/Dialog.tsx';
import { MessageList, type MessageListJump, type MessageListSearch } from './MessageList.tsx';
import { MePicker } from './MePicker.tsx';
import { Avatar } from './MessageRow.tsx';
import { SearchPanel } from './SearchPanel.tsx';
import { searchChat } from './search.ts';
import { useTheme, type ThemeMode } from '../theme.ts';
import { JumpToDate } from './JumpToDate.tsx';
import './ChatView.css';

/**
 * The three modes the control offers, in the order they are drawn: the OS
 * follows first, then the two fixed themes a reader picks by hand. `classic` is
 * deliberately absent — see `theme.ts` — but stays checked if a document
 * already carries it, so the group never renders with nothing selected.
 */
const THEME_MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export interface ChatViewProps {
  chat: Chat;
  /**
   * The live parse session, passed straight through to the list so media rows
   * can extract their bytes on demand (E5-1, plan §2.4). Nullable: a host with
   * no archive (a test) renders every media row as a placeholder.
   */
  session: ChatSession | null;
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

export function ChatView({ chat, session, onClose, pane }: ChatViewProps) {
  // The chosen "me", or null for "Nobody". Seeded from the parser's guess.
  const [meId, setMeId] = useState<string | null>(chat.guessedMeId);
  const [answered, setAnswered] = useState(!needsMeChoice(chat));
  const [pickerForced, setPickerForced] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  // The theme is applied by this hook, not by the control: the preference must
  // paint the moment the chat mounts, including for a reader who never opens
  // this menu (and for one who set it on the landing screen).
  const { mode, setMode } = useTheme();

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

  // --- Search (E7-1) --------------------------------------------------------
  // The query and the selected match index live here and nowhere else: the panel
  // and the list are both handed the same result set, so the counter and the
  // highlights cannot disagree. The query is never written to storage: F-NAV-3
  // forbids persisting chat content, and a search history is content.
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => searchChat(aligned, query), [aligned, query]);
  const total = results.matches.length;
  // Clamped here rather than reset in an effect, so a query that shrinks never
  // paints one frame with an index past the end of its own match list.
  const active = total === 0 ? 0 : Math.min(activeIndex, total - 1);

  // A new query restarts the selection at the first match. Done in the setter
  // rather than an effect for the same reason: the counter must not render the
  // previous query's index against the new match list even once.
  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(0);
  }, []);

  // Wrapping is deliberate: stepping past the last match returns to the first,
  // which is what the counter's "3 of 3" already implies, and a button that
  // silently stops reads as broken rather than as finished.
  const step = useCallback(
    (delta: 1 | -1) => {
      if (total === 0) return;
      setActiveIndex((current) => (current + delta + total) % total);
    },
    [total],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const openSearch = useCallback(() => setSearchOpen(true), []);

  const listSearch: MessageListSearch | null = searchOpen ? { results, activeIndex: active } : null;

  // --- Jump to date (E7-2, F-NAV-3) ----------------------------------------
  // The chosen day is a request, not a position the view owns: `JumpToDate`
  // reports one pick and the dialog closes, so the day is handed to the list and
  // kept here only as the last request. `seq` exists because the reader can
  // legitimately pick the same day twice — open the calendar again after
  // scrolling away — and an unchanged string would compare equal and do nothing.
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jump, setJump] = useState<MessageListJump | null>(null);

  const openJump = useCallback(() => {
    setJumpOpen(true);
  }, []);

  const pickDay = useCallback((day: string) => {
    setJump((current) => ({ day, seq: (current?.seq ?? 0) + 1 }));
    setJumpOpen(false);
  }, []);

  // One close path for both ways out of the dropdown. Escape is handled here
  // rather than left to `<details>`: measured in Chromium, the native handler
  // only fires while focus sits on the `<summary>`, so a reader who has tabbed
  // into the panel presses Escape and nothing happens. `choose` still closes by
  // attribute removal, which is what keeps a native `toggle` event from firing.
  function closeMenu() {
    menuRef.current?.removeAttribute('open');
    menuRef.current?.querySelector('summary')?.focus();
  }

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

        {/* The one trigger for search, in the header at every width. The field
            itself is drawn by the panel below, so the query is typed in exactly
            one place and there is exactly one live counter in the document. */}
        <button
          type="button"
          className="icon-button chat__search-open"
          onClick={openSearch}
          aria-expanded={searchOpen}
        >
          <Icon name="search" size={22} title="Search messages" />
        </button>

        <details
          className="chat__menu"
          ref={menuRef}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closeMenu();
          }}
        >
          <summary className="icon-button" aria-label="Chat options">
            <Icon name="more-vertical" size={22} />
          </summary>
          <div className="chat__menu-panel">
            <button type="button" className="chat__menu-item" onClick={openSearch}>
              Search messages
            </button>
            <button type="button" className="chat__menu-item" onClick={() => setPickerForced(true)}>
              {meId === null ? 'Choose who you are' : 'Change who you are'}
            </button>
            <button
              type="button"
              className="chat__menu-item"
              onClick={() => {
                closeMenu();
                openJump();
              }}
            >
              Jump to date
            </button>
            <button type="button" className="chat__menu-item" onClick={onClose}>
              Close chat
            </button>

            {/* A native radio group: one tab stop for the whole thing, arrow keys
                move between the modes, and the checked state is the browser's to
                announce — no custom widget and no roving tabindex to maintain.
                `classic` is not offered, but if a document arrived with it the
                group is drawn with nothing checked rather than lying about it.
                Rows carry a new class, not `.chat__menu-item`: `shell.spec.ts`
                counts those rows as exactly the two above, and a third would
                read to it as a regression in the menu rather than a new tool. */}
            <fieldset className="chat__theme">
              <legend className="chat__theme-legend">Theme</legend>
              {THEME_MODES.map(({ value, label }) => (
                <label className="chat__theme-option" key={value}>
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </div>
        </details>
      </header>

      {/* The search band/column and the list, in one wrapper: a column on mobile
          (field above the messages) and a row on desktop (field and results in a
          right-hand column). Both are real flex siblings of the list, so the
          messages are never covered — the panel takes width from the row, not
          from on top of the content. */}
      <div className="chat__main">
        <MessageList chat={aligned} session={session} search={listSearch} jump={jump} />
        {searchOpen ? (
          <div className="chat__search-panel">
            {/* `variant` is chosen by CSS, not by a JS breakpoint, so the panel
                renders one element whose layout the viewport decides: the field
                alone on mobile, the field plus the result list on desktop. */}
            <SearchPanel
              messages={aligned.messages}
              query={query}
              onQueryChange={changeQuery}
              results={results}
              activeIndex={active}
              onStep={step}
              onClose={closeSearch}
              onSelect={setActiveIndex}
              variant="panel"
            />
          </div>
        ) : null}
      </div>

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

      {/* Same mount-only-while-open rule as the picker below: the grid is 42
          buttons and a month of cursor state, and a reader who never opens it
          should not carry that in the DOM. */}
      {jumpOpen ? (
        <Dialog open title="Jump to date" onClose={() => setJumpOpen(false)}>
          <JumpToDate chat={aligned} onPick={pickDay} onClose={() => setJumpOpen(false)} />
        </Dialog>
      ) : null}

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
