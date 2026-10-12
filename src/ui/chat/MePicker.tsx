/**
 * "Which one is you?" (backlog E3-4; PRD F-NAV-1).
 *
 * A personal chat's filename names the other person, so the parser's guess is
 * reliable and the picker only opens when the user asks from the header menu. A
 * group has no such signal, so this opens on arrival with nothing pre-selected
 * and "Nobody" as a real answer: it puts everyone on the left, which is the
 * honest view when the reader is not in the export.
 *
 * Reuses the shared `Dialog`, so focus, Escape and the backdrop click are the
 * shell's behaviour rather than a second implementation.
 */
import type { Participant } from '../../types/chat.ts';
import { Icon } from '../icons/index.ts';
import { Avatar } from './MessageRow.tsx';
import './MePicker.css';

export interface MePickerProps {
  participants: Participant[];
  /** Pre-selected participant id, or null for "Nobody" / a group arrival. */
  selectedId: string | null;
  /** Count of messages per participant id, shown so the picker is not a guess. */
  messageCounts: Map<string, number>;
  onChoose: (participantId: string | null) => void;
  onCancel: () => void;
}

export function MePicker({
  participants,
  selectedId,
  messageCounts,
  onChoose,
  onCancel,
}: MePickerProps) {
  return (
    <div className="me-picker">
      <p className="me-picker__lede">
        Pick the name that is you. Your messages move to the right, everyone else stays on the left.
      </p>

      <ul className="me-picker__list">
        {participants.map((participant) => {
          const count = messageCounts.get(participant.id) ?? 0;
          return (
            <li key={participant.id}>
              <button
                type="button"
                className="me-picker__row"
                aria-pressed={participant.id === selectedId}
                onClick={() => onChoose(participant.id)}
              >
                <Avatar participant={participant} />
                <span className="me-picker__name">{participant.displayName}</span>
                <span className="me-picker__count">
                  {count === 1 ? '1 message' : `${count} messages`}
                </span>
                {participant.id === selectedId ? (
                  <span className="me-picker__check" aria-hidden="true">
                    <Icon name="check" size={18} />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="me-picker__foot">
        <button
          type="button"
          className="button button--quiet"
          aria-pressed={selectedId === null}
          onClick={() => onChoose(null)}
        >
          Nobody
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
