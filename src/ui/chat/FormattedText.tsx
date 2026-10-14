/**
 * The React renderer for a token list (backlog E4-6; PRD F-VIEW-5, S-5).
 *
 * It emits real elements (`<strong>`, `<em>`, `<s>`, `<code>`, `<a>`,
 * `<blockquote>`, `<ul>`/`<ol>`/`<li>`, `<pre>`, `<mark>`) and text nodes, and
 * nothing else: no raw-HTML injection API is used anywhere in `src/` (the guard
 * in `tests/e2e/format.spec.ts` asserts the grep stays empty), and a crafted
 * export showing `<script>` keeps its literal characters because React escapes a
 * text node and executes nothing (PRD S-5).
 *
 * E7-1's search highlighting is composed, not re-implemented: the formatter still
 * decides what is bold and what is a link, and a match only splits a text node,
 * so `<strong>bold</strong>` with a match inside it stays one `<strong>` with a
 * `<mark>` in it. The ranges come from `search.ts`, which derived them from the
 * same rendered text this component draws (`bodyRuns`), so an offset here means
 * the same thing it meant there.
 */
import { memo, useMemo, type ReactNode } from 'react';
import { formatText, type TextToken } from '../formatText.ts';
import { runKey, type ActiveHighlight, type Range, type RunRanges } from './search.ts';
import './FormattedText.css';

export interface FormattedTextProps {
  /** Raw message text, markers intact (src/types/chat.ts:92). */
  text: string;
  /** Which bubble this sits in, so `--link` resolves to the right value. */
  outgoing: boolean;
  /**
   * Search highlights for this string (E7-1), keyed by the run they belong to.
   * Absent when no search is running, in which case nothing is split and every
   * text node renders exactly as it did before this story. `undefined` is
   * spelled out because a caller passes the result of a lookup straight through,
   * and `exactOptionalPropertyTypes` distinguishes "absent" from "present and
   * undefined".
   */
  runs?: Map<string, RunRanges> | undefined;
  /** The match prev/next is standing on, when it is inside this string (E7-1). */
  active?: ActiveHighlight | null | undefined;
}

/**
 * Split one token's text at the highlight boundaries that fall inside it.
 *
 * `offset` is where the token starts within its run, because the ranges index
 * the run rather than the token: a run is the unit a reader sees, and a token is
 * only how the tokenizer happened to cut it. Everything outside a match stays
 * the plain text node it already was, so a body with no highlights is untouched.
 */
function highlight(
  value: string,
  offset: number,
  ranges: Range[] | null,
  active: ActiveHighlight | null | undefined,
): ReactNode {
  if (ranges === null || ranges.length === 0) return value;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(0, range.start - offset);
    const end = Math.min(value.length, range.end - offset);
    if (end <= 0 || start >= value.length || start >= end) continue;
    if (start > cursor) nodes.push(value.slice(cursor, start));
    const isActive =
      active !== null &&
      active !== undefined &&
      active.start === range.start &&
      active.end === range.end;
    nodes.push(
      <mark className="bubble__mark" data-active={isActive ? 'true' : undefined} key={start}>
        {value.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  // No range intersected this token: hand back the string, so nothing changes
  // for a token the query does not touch and React keeps one text node.
  if (nodes.length === 0) return value;
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

/** Where this token's text starts inside its run, and how the run is keyed. */
interface RunContext {
  ranges: Range[] | null;
  active: ActiveHighlight | null | undefined;
}

/**
 * One inline token as its element. Links carry no `aria-label`: their own text
 * names them. An external link opens in a new tab and is hardened against the
 * reverse tab-nab; a mail client or dialler opening in a new tab would only be
 * noise, so `mailto:`/`tel:` get no `target` at all (E4-6 §2.3).
 */
function Token({
  token,
  offset,
  context,
}: {
  token: TextToken;
  offset: number;
  context: RunContext;
}) {
  const content = highlight(token.value, offset, context.ranges, context.active);
  switch (token.kind) {
    case 'bold':
      return <strong>{content}</strong>;
    case 'italic':
      return <em>{content}</em>;
    case 'strike':
      return <s>{content}</s>;
    case 'code':
      return <code className="bubble__code">{content}</code>;
    case 'link':
      return token.external ? (
        <a href={token.href} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      ) : (
        <a href={token.href}>{content}</a>
      );
    case 'text':
      return content;
  }
}

/**
 * The inline run of one paragraph or one quote, with the token offsets
 * accumulated as it goes: each token's `value` is exactly the characters this
 * run renders, so the running sum is that token's position in the run.
 */
function Tokens({ tokens, context }: { tokens: TextToken[]; context: RunContext }): ReactNode {
  let offset = 0;
  return tokens.map((token, index) => {
    const node = <Token key={index} token={token} offset={offset} context={context} />;
    offset += token.value.length;
    return node;
  });
}

/** One list, in whichever of the two kinds the tokenizer found. */
function List({
  items,
  ordered,
  blockIndex,
  runs,
  active,
}: {
  items: TextToken[][];
  ordered: boolean;
  blockIndex: number;
  runs: Map<string, RunRanges> | undefined;
  active: ActiveHighlight | null | undefined;
}) {
  const children = items.map((item, index) => (
    <li key={index}>
      <Tokens
        tokens={item}
        context={{
          ranges: runs?.get(runKey(blockIndex, index))?.ranges ?? null,
          active: active?.itemIndex === index && active?.blockIndex === blockIndex ? active : null,
        }}
      />
    </li>
  ));
  return ordered ? (
    <ol className="bubble__list">{children}</ol>
  ) : (
    <ul className="bubble__list">{children}</ul>
  );
}

export const FormattedText = memo(function FormattedText({
  text,
  runs,
  active,
}: FormattedTextProps) {
  const result = useMemo(() => formatText(text), [text]);

  // Every block whose run carries a range, so a message with no highlight in it
  // re-renders exactly as it did before search existed.
  const highlighted = runs !== undefined && runs.size > 0;

  // Jumbo: an emoji-only message renders as one block-sized emoji with no bubble
  // fill (DESIGN §3.1, §3.8). The size comes off `emojiCount` via the class, and
  // nothing else about the row changes, so the run and tail rules still apply.
  // The run `bodyRuns` builds for a jumbo body is the same raw string, because an
  // emoji-only body carries no markers, so its highlight offsets are already in
  // these coordinates.
  if (result.jumbo) {
    const ranges = highlighted ? (runs?.get(runKey(0, -1))?.ranges ?? null) : null;
    return (
      <div className={`bubble__jumbo bubble__jumbo--${result.emojiCount}`} dir="auto">
        {ranges === null ? text : highlight(text, 0, ranges, active)}
      </div>
    );
  }

  const contextFor = (blockIndex: number, itemIndex: number): RunContext => ({
    ranges: highlighted ? (runs?.get(runKey(blockIndex, itemIndex))?.ranges ?? null) : null,
    active:
      active?.blockIndex === blockIndex && active?.itemIndex === itemIndex ? active : undefined,
  });

  // The meta float (§3.8) needs the body to behave differently depending on what
  // is in it: a body of paragraphs only stays an inline flow, so the meta can
  // float to the end of the last line. The moment a quote, a fenced block or a
  // list is present, the float is abandoned and the meta takes its own
  // right-aligned line, because a float beside a block sibling jumps lines
  // content-dependently, which is exactly the case a naive check gets wrong.
  const hasBlock = result.blocks.some((block) => block.kind !== 'paragraph');

  return (
    <div className={hasBlock ? 'bubble__body bubble__body--block' : 'bubble__body'} dir="auto">
      {result.blocks.map((block, index) => {
        switch (block.kind) {
          case 'code': {
            const context = contextFor(index, -1);
            return (
              <pre className="bubble__pre" key={index}>
                <code>{highlight(block.value, 0, context.ranges, context.active)}</code>
              </pre>
            );
          }
          case 'quote':
            return (
              <blockquote className="bubble__quote" key={index}>
                <Tokens tokens={block.tokens} context={contextFor(index, -1)} />
              </blockquote>
            );
          case 'list':
            return (
              <List
                key={index}
                items={block.items}
                ordered={block.ordered}
                blockIndex={index}
                runs={runs}
                active={active}
              />
            );
          case 'paragraph':
            return (
              <p className="bubble__para" key={index}>
                <Tokens tokens={block.tokens} context={contextFor(index, -1)} />
              </p>
            );
        }
      })}
    </div>
  );
});
