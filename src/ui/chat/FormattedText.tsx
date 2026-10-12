/**
 * The React renderer for a token list (backlog E4-6; PRD F-VIEW-5, S-5).
 *
 * It emits real elements (`<strong>`, `<em>`, `<s>`, `<code>`, `<a>`,
 * `<blockquote>`, `<ul>`/`<ol>`/`<li>`, `<pre>`) and text nodes, and nothing
 * else: no raw-HTML injection API is used anywhere in `src/` (the guard in
 * `tests/e2e/format.spec.ts` asserts the grep stays empty), and a crafted export
 * showing `<script>` keeps its literal characters because React escapes a text
 * node and executes nothing (PRD S-5).
 */
import { memo, useMemo, type ReactNode } from 'react';
import { formatText, type TextToken } from '../formatText.ts';
import './FormattedText.css';

export interface FormattedTextProps {
  /** Raw message text, markers intact (src/types/chat.ts:92). */
  text: string;
  /** Which bubble this sits in, so `--link` resolves to the right value. */
  outgoing: boolean;
}

/**
 * One inline token as its element. Links carry no `aria-label`: their own text
 * names them. An external link opens in a new tab and is hardened against the
 * reverse tab-nab; a mail client or dialler opening in a new tab would only be
 * noise, so `mailto:`/`tel:` get no `target` at all (E4-6 §2.3).
 */
function Token({ token }: { token: TextToken }) {
  switch (token.kind) {
    case 'bold':
      return <strong>{token.value}</strong>;
    case 'italic':
      return <em>{token.value}</em>;
    case 'strike':
      return <s>{token.value}</s>;
    case 'code':
      return <code className="bubble__code">{token.value}</code>;
    case 'link':
      return token.external ? (
        <a href={token.href} target="_blank" rel="noopener noreferrer">
          {token.value}
        </a>
      ) : (
        <a href={token.href}>{token.value}</a>
      );
    case 'text':
      return token.value;
  }
}

/** The inline run of one paragraph or one quote. */
function Tokens({ tokens }: { tokens: TextToken[] }): ReactNode {
  return tokens.map((token, index) => <Token key={index} token={token} />);
}

/** One list, in whichever of the two kinds the tokenizer found. */
function List({ items, ordered }: { items: TextToken[][]; ordered: boolean }) {
  const children = items.map((item, index) => (
    <li key={index}>
      <Tokens tokens={item} />
    </li>
  ));
  return ordered ? (
    <ol className="bubble__list">{children}</ol>
  ) : (
    <ul className="bubble__list">{children}</ul>
  );
}

export const FormattedText = memo(function FormattedText({ text }: FormattedTextProps) {
  const result = useMemo(() => formatText(text), [text]);

  // Jumbo: an emoji-only message renders as one block-sized emoji with no bubble
  // fill (DESIGN §3.1, §3.8). The size comes off `emojiCount` via the class, and
  // nothing else about the row changes, so the run and tail rules still apply.
  if (result.jumbo) {
    return (
      <div className={`bubble__jumbo bubble__jumbo--${result.emojiCount}`} dir="auto">
        {text}
      </div>
    );
  }

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
          case 'code':
            return (
              <pre className="bubble__pre" key={index}>
                <code>{block.value}</code>
              </pre>
            );
          case 'quote':
            return (
              <blockquote className="bubble__quote" key={index}>
                <Tokens tokens={block.tokens} />
              </blockquote>
            );
          case 'list':
            return <List key={index} items={block.items} ordered={block.ordered} />;
          case 'paragraph':
            return (
              <p className="bubble__para" key={index}>
                <Tokens tokens={block.tokens} />
              </p>
            );
        }
      })}
    </div>
  );
});
