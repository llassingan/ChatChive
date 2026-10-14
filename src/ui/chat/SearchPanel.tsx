/**
 * Search panel (backlog E7-1; PRD F-NAV-2) and the small chrome both shells
 * share: the query field, the `N of M` counter, prev/next, and an honest empty
 * state.
 *
 * Desktop mounts this as a real third column beside the message list; mobile
 * mounts `SearchField` inside the header instead (see `ChatView`). The field is
 * one component in both places, so the two shells cannot drift in how a query is
 * typed, stepped or closed.
 *
 * Nothing here is a second source of truth for matching. The counts, snippets and
 * row targets all come from `search.ts`, so the counter in the field and the
 * highlights in the list are two views of one result set and cannot disagree.
 */
import type { Message } from '../../types/chat.ts';
import { formatClock } from '../format.ts';
import { Icon } from '../icons/index.ts';
import { snippetAround, type MessageSearch, type SearchResults } from './search.ts';
import './SearchPanel.css';

export interface SearchPanelProps {
  /** The chat's messages, so a result row can show its sender and clock. */
  messages: Message[];
  /** The live query, so the input is a controlled field. */
  query: string;
  onQueryChange: (value: string) => void;
  /** The result set for that query; empty when there is no query. */
  results: SearchResults;
  /** 0-based index into `results.matches` that prev/next is standing on. */
  activeIndex: number;
  /** Step the selection by one, wrapping at either end. */
  onStep: (delta: 1 | -1) => void;
  /** Close search: clears the query and restores the header (Esc does this). */
  onClose: () => void;
  /**
   * Jump the list to a match. The list translates the message index into a row
   * index for the virtualizer, so this component never needs to know how rows
   * are built.
   */
  onSelect: (matchIndex: number) => void;
  /**
   * `panel` = the desktop results column, which draws no field of its own: the
   * header holds the one field at every viewport, so there is exactly one live
   * counter and one place the query is typed. `header` = the field on its own,
   * as the header renders it.
   */
  variant: 'panel' | 'header';
}

export interface SearchFieldProps {
  query: string;
  onQueryChange: (value: string) => void;
  onStep: (delta: 1 | -1) => void;
  onClose: () => void;
  /** How many matches the query produced, for the counter. */
  total: number;
  /** 0-based index of the active match, for the counter. */
  activeIndex: number;
  /** Whether to take focus on mount, which the mobile header field does. */
  autoFocus?: boolean;
}

/**
 * The field and its controls: the query, the `N of M` counter, prev/next and a
 * close button. One instance per shell, never two at once.
 */
export function SearchField({
  query,
  onQueryChange,
  onStep,
  onClose,
  total,
  activeIndex,
  autoFocus = false,
}: SearchFieldProps) {
  const open = query.trim().length > 0;

  return (
    <div className="search-field">
      <span className="search-field__glyph" aria-hidden="true">
        <Icon name="search" size={18} />
      </span>
      <input
        className="search-field__input"
        type="search"
        value={query}
        aria-label="Search messages"
        placeholder="Search messages"
        autoComplete="off"
        spellCheck={false}
        // Deliberate: opening a find UI moves focus into it, and the panel only
        // opens from the reader's own click or keypress.
        autoFocus={autoFocus}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
          }
          // Enter/Shift+Enter step, the keyboard path DESIGN §3.37 describes.
          if (event.key === 'Enter') {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          }
        }}
      />
      {/* Mounted only while a query is up, so an idle header keeps its title.
          `role="status"` announces the new count as it changes without stealing
          focus from the field the reader is typing in. */}
      {open ? (
        <span className="search-field__counter" role="status">
          {total === 0 ? 'No matches' : `${activeIndex + 1} of ${total}`}
        </span>
      ) : null}
      {open ? (
        <span className="search-field__steps">
          <button
            type="button"
            className="icon-button search-field__step"
            onClick={() => onStep(-1)}
            disabled={total === 0}
          >
            <Icon name="chevron-up" size={18} title="Previous match" />
          </button>
          <button
            type="button"
            className="icon-button search-field__step"
            onClick={() => onStep(1)}
            disabled={total === 0}
          >
            <Icon name="chevron-down" size={18} title="Next match" />
          </button>
        </span>
      ) : null}
      <button type="button" className="icon-button search-field__close" onClick={onClose}>
        <Icon name="close" size={20} title="Close search" />
      </button>
    </div>
  );
}

/**
 * One result row: the sender, the clock, and the snippet with the match in bold.
 * The snippet is three text nodes around a `<strong>` and never assembled HTML,
 * so a crafted export cannot inject markup through the result list any more than
 * it can through a bubble (PRD S-5).
 */
function ResultRow({
  group,
  message,
  active,
  onSelect,
}: {
  group: MessageSearch;
  message: Message;
  active: boolean;
  onSelect: () => void;
}) {
  // The snippet comes from the group's own body run, which is the same string
  // the highlight in the list splits, so the panel quotes exactly what the
  // reader will land on.
  const run = group.body === null ? null : [...group.body.runs.values()][0];
  const range = run?.ranges[0];
  const snippet = run === null || range === undefined ? null : snippetAround(run.text, range);
  const spoken =
    snippet === null ? 'name match' : `${snippet.before}${snippet.hit}${snippet.after}`;

  return (
    <li>
      <button
        type="button"
        className="search-panel__row"
        data-active={active ? 'true' : undefined}
        aria-current={active ? 'true' : undefined}
        onClick={onSelect}
        aria-label={`${group.name ?? 'Message'}, ${formatClock(message.timestamp, '24h')}: ${spoken}`}
      >
        <span className="search-panel__meta">
          <span className="search-panel__sender">{group.name ?? 'Unknown'}</span>
          <span className="search-panel__time">{formatClock(message.timestamp, '24h')}</span>
        </span>
        <span className="search-panel__snippet" aria-hidden="true">
          {snippet === null ? (
            // A name-only hit has no body to quote. Saying so is more honest than
            // printing the untouched body, which would read as a match.
            <span className="search-panel__snippet-name">Name match</span>
          ) : (
            <>
              {snippet.before}
              <strong>{snippet.hit}</strong>
              {snippet.after}
            </>
          )}
        </span>
      </button>
    </li>
  );
}

export function SearchPanel({
  messages,
  query,
  onQueryChange,
  results,
  activeIndex,
  onStep,
  onClose,
  onSelect,
  variant,
}: SearchPanelProps) {
  const total = results.matches.length;
  const open = query.trim().length > 0;
  const activeMessageIndex = results.matches[activeIndex]?.messageIndex ?? null;

  return (
    <section className={`search-panel search-panel--${variant}`} aria-label="Search in chat">
      {/* Exactly one field per document, whichever placement: the panel owns it.
          On mobile the panel is just the field — `SearchPanel.css` hides the
          result list below 768px, because there the results are the highlighted
          messages themselves and a second list would eat the screen. */}
      <SearchField
        query={query}
        onQueryChange={onQueryChange}
        onStep={onStep}
        onClose={onClose}
        total={total}
        activeIndex={activeIndex}
        autoFocus={variant === 'header'}
      />

      {variant === 'panel' ? (
        <div className="search-panel__body">
          {!open ? (
            <p className="search-panel__hint">
              Type to search this chat. Matching is case- and accent-insensitive.
            </p>
          ) : total === 0 ? (
            // The honest empty state names the query that failed rather than
            // leaving a blank column.
            <p className="search-panel__empty">No messages match “{query.trim()}”.</p>
          ) : (
            <ul className="search-panel__list">
              {results.messages.map((group) => {
                const message = messages[group.messageIndex];
                const first = results.matches.findIndex(
                  (match) => match.messageIndex === group.messageIndex,
                );
                return (
                  <ResultRow
                    key={group.messageIndex}
                    group={group}
                    message={message}
                    active={group.messageIndex === activeMessageIndex}
                    // The first match of the message, so choosing a row lands on
                    // its own first hit rather than on wherever the selection
                    // happened to be.
                    onSelect={() => onSelect(first)}
                  />
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
