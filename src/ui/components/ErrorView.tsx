/**
 * The error screen (E3-2, PRD F-IMP-4). One message per `ParseErrorCode`, a
 * quiet way back to the drop zone, and a disclosure for the developer-facing
 * detail. `detail` comes from the parser and never contains chat content, so it
 * is safe to show, but it is not the user's problem to read first.
 */
import type { ParseError } from '../../types/chat.ts';
import { describeError } from '../import/errors.ts';
import { Icon } from '../icons/index.ts';
import './ErrorView.css';

export interface ErrorViewProps {
  error: ParseError;
  onBack: () => void;
}

export function ErrorView({ error, onBack }: ErrorViewProps) {
  const { title, body } = describeError(error.code);

  return (
    <main className="error-view">
      <span className="error-view__glyph" aria-hidden="true">
        <Icon name="alert" size={24} />
      </span>
      <h1 className="error-view__title">{title}</h1>
      <p className="error-view__body">{body}</p>

      <button type="button" className="button button--primary" onClick={onBack}>
        Choose another file
      </button>

      {error.detail ? (
        <details className="error-view__detail">
          <summary>Technical detail</summary>
          <p>{error.detail}</p>
        </details>
      ) : null}
    </main>
  );
}
