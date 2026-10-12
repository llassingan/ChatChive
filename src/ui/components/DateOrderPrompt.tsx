/**
 * Ambiguous-date prompt (E3-3, pulled forward from the next sprint: leaving
 * `needsUserChoice` unanswered would dead-end the import flow). WhatsApp writes
 * the date in the phone's own order with no marker for which number is the day,
 * so when the parser cannot decide we ask once, show both readings of the same
 * lines, and re-run the parse with the chosen order.
 */
import type { DateOrder } from '../../types/chat.ts';
import './DateOrderPrompt.css';

export interface DateOrderSample {
  raw: string;
  asDMY: string;
  asMDY: string;
}

export interface DateOrderPromptProps {
  samples: DateOrderSample[];
  onChoose: (order: DateOrder) => void;
  onCancel: () => void;
}

/** The date token at the head of a header line: "6/3/26, 07:18 - ..." -> "6/3/26". */
function dateToken(raw: string): string {
  const withoutBracket = raw.startsWith('[') ? raw.slice(1) : raw;
  return withoutBracket.split(',')[0]?.trim() ?? withoutBracket.trim();
}

const OPTIONS: Array<{ order: DateOrder; label: string }> = [
  { order: 'DMY', label: 'Day first' },
  { order: 'MDY', label: 'Month first' },
];

export function DateOrderPrompt({ samples, onChoose, onCancel }: DateOrderPromptProps) {
  const first = samples[0];

  return (
    <main className="date-order">
      <h1 className="date-order__title">Which date is this?</h1>
      <p className="date-order__lede">
        {first
          ? `Is ${dateToken(first.raw)} ${first.asDMY} or ${first.asMDY}? This export can be read either way, and nothing in the file settles it.`
          : 'This export can be read with the day or the month first, and nothing in the file settles it.'}{' '}
        Pick the one that matches the chat you remember.
      </p>

      <div className="date-order__options">
        {OPTIONS.map(({ order, label }) => (
          <button
            key={order}
            type="button"
            className="date-order__option"
            onClick={() => onChoose(order)}
          >
            <span className="date-order__option-label">{label}</span>
            <span className="date-order__option-samples">
              {samples.map((sample) => (
                <span key={sample.raw} className="date-order__sample">
                  {order === 'DMY' ? sample.asDMY : sample.asMDY}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>

      <button type="button" className="button button--quiet" onClick={onCancel}>
        Cancel
      </button>
    </main>
  );
}
