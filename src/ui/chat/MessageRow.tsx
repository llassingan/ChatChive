/**
 * One message row (backlog E4-2, E4-3, E4-4, E4-7).
 *
 * Renders the bubble for text, media, deleted and empty messages, the centered
 * pill for a system notice. The layout flags come from `layout.ts`, so this
 * component never re-derives runs.
 *
 * Message text is a React text node, never HTML: a crafted export containing
 * `<script>` shows the literal characters (PRD S-5, E4-6). Formatting (*bold*,
 * links) arrives with E4-6 and is deliberately not stubbed here.
 */
import { memo } from 'react';
import type {
  ClockStyle,
  MediaKind,
  MediaMessage,
  Message,
  Participant,
} from '../../types/chat.ts';
import { formatBytes, formatClock } from '../format.ts';
import { Icon, type IconName } from '../icons/index.ts';
import { Tail } from './Tail.tsx';
import './MessageRow.css';

/** Icon and label per media kind, for the tile and the placeholder (F-VIEW-12). */
const MEDIA_META: Record<MediaKind, { icon: IconName; label: string }> = {
  image: { icon: 'photo', label: 'Photo' },
  video: { icon: 'video', label: 'Video' },
  gif: { icon: 'video', label: 'GIF' },
  sticker: { icon: 'sticker', label: 'Sticker' },
  voice: { icon: 'mic', label: 'Voice message' },
  audio: { icon: 'mic', label: 'Audio' },
  document: { icon: 'file', label: 'Document' },
  contact: { icon: 'person', label: 'Contact' },
  location: { icon: 'pin', label: 'Location' },
};

export interface MessageRowProps {
  message: Message;
  participant: Participant | null;
  clockStyle: ClockStyle;
  /** Group incoming bubbles show the sender header on the first row (E4-4). */
  showSender: boolean;
  /** Breakpoint-aware run decorations, so one row serves mobile and web. The
   *  tail and avatar sit on the last bubble of a run on mobile and the first on
   *  web (DESIGN §3.2); CSS picks which by viewport, this component renders both
   *  candidates so nothing depends on a JS breakpoint listener. */
  firstOfRun: boolean;
  lastOfRun: boolean;
}

/** Letter avatar for a participant, in their hue (DESIGN §3.4). */
export function Avatar({ participant }: { participant: Participant }) {
  const style = { background: `var(--avatar-${participant.colorIndex})` };
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {participant.initial}
    </span>
  );
}

/** Sender header: the name in its sender color, the phone for unsaved contacts. */
function SenderHeader({ participant }: { participant: Participant }) {
  const tint = `var(--sender-${participant.colorIndex})`;
  return (
    <div className="sender">
      <span className="sender__name" style={{ color: tint }}>
        {participant.displayName}
      </span>
      {participant.phoneNumber ? (
        <span className="sender__phone">{participant.phoneNumber}</span>
      ) : null}
    </div>
  );
}

/** Meta block: optional "Edited", the clock, and a glyph for non-document media. */
function Meta({
  timestamp,
  clockStyle,
  edited,
  kind,
}: {
  timestamp: number;
  clockStyle: ClockStyle;
  edited?: boolean;
  kind?: MediaKind;
}) {
  const glyph = kind && kind !== 'document' ? MEDIA_META[kind].icon : null;
  return (
    <span className="meta">
      {edited ? <span className="meta__edited">Edited</span> : null}
      {glyph ? <Icon name={glyph} size={14} /> : null}
      <time className="meta__time">{formatClock(timestamp, clockStyle)}</time>
    </span>
  );
}

/**
 * A media tile (E5 placeholder). The real image, video or player arrives next
 * sprint (E5-2/E5-4); the tile reports the file the parser found, so it is honest
 * about what the export contains rather than inventing a preview.
 */
function MediaBody({ message }: { message: MediaMessage }) {
  const { media } = message;
  const meta = MEDIA_META[media.kind];
  const size = formatBytes(media.byteSize);

  if (!media.resolved) {
    // The export referenced a file that is not in the archive (F-VIEW-12).
    return (
      <span className="media media--missing">
        <span className="media__glyph">
          <Icon name={meta.icon} size={22} />
        </span>
        <span className="media__text">
          <span className="media__title">{meta.label} not included in export</span>
          <span className="media__sub">{media.fileName}</span>
        </span>
      </span>
    );
  }

  return (
    <span className="media">
      <span className="media__glyph">
        <Icon name={meta.icon} size={22} />
      </span>
      <span className="media__text">
        <span className="media__title">{media.fileName}</span>
        <span className="media__sub">
          {meta.label}
          {size ? ` \u00b7 ${size}` : ''}
        </span>
      </span>
    </span>
  );
}

/** The plain-text body a screen reader should hear, per message kind. */
function spokenBody(message: Message): string {
  switch (message.kind) {
    case 'text':
      return message.text;
    case 'deleted':
      return message.byMe ? 'You deleted this message' : 'This message was deleted';
    case 'empty':
      return 'Message not included in export';
    case 'media':
      return [MEDIA_META[message.media.kind].label, message.caption].filter(Boolean).join(', ');
    default:
      return '';
  }
}

/**
 * Memoized: the list re-renders on every scroll frame to move its sticky pill
 * and toggle the jump button, and without this each of those frames re-rendered
 * every mounted row. Every prop is a primitive or a stable object reference
 * (`message`, `participant`), so the comparison is cheap and the ~25 mounted rows
 * skip the work entirely once their own props stop changing. That is what keeps
 * a 100k-message scroll at 60 fps (PRD §9, E4-1).
 */
export const MessageRow = memo(function MessageRow({
  message,
  participant,
  clockStyle,
  showSender,
  firstOfRun,
  lastOfRun,
}: MessageRowProps) {
  if (message.kind === 'system') {
    const encryption = message.system === 'encryption';
    return (
      <div className="row row--system">
        <p className={encryption ? 'pill pill--encryption' : 'pill'}>
          {encryption ? <Icon name="lock" size={14} /> : null}
          <span>{message.text}</span>
        </p>
      </div>
    );
  }

  const outgoing = message.outgoing;
  const classes = ['bubble', outgoing ? 'bubble--out' : 'bubble--in'];
  if (firstOfRun) classes.push('bubble--first');
  if (lastOfRun) classes.push('bubble--last');

  // One label for the whole bubble (DESIGN §5): "<Sender>, <time>: <text>". The
  // children are hidden from assistive tech so the text is not read twice.
  const sender = participant?.displayName ?? 'Unknown';
  const label = `${sender}, ${formatClock(message.timestamp, clockStyle)}: ${spokenBody(message)}`;

  // The avatar column is reserved on every incoming row so bubbles stay aligned;
  // only the run-edge row in a group shows the circle (DESIGN §3.2, §3.4).
  const showAvatarHere = Boolean(participant) && !outgoing && (firstOfRun || lastOfRun);

  return (
    <div
      className={outgoing ? 'row row--out' : 'row row--in'}
      data-run={firstOfRun ? 'new' : 'same'}
    >
      {!outgoing ? (
        <span className="row__avatar">
          {showAvatarHere && participant ? <Avatar participant={participant} /> : null}
        </span>
      ) : null}

      <div
        className={classes.join(' ')}
        data-outgoing={outgoing ? 'true' : 'false'}
        aria-label={label}
      >
        <div className="bubble__content" aria-hidden="true">
          {showSender && participant ? <SenderHeader participant={participant} /> : null}

          {message.kind === 'text' ? (
            <span className="bubble__text" dir="auto">
              {message.text}
            </span>
          ) : null}

          {message.kind === 'media' ? (
            <>
              <MediaBody message={message} />
              {message.caption ? (
                <span className="bubble__text" dir="auto">
                  {message.caption}
                </span>
              ) : null}
            </>
          ) : null}

          {message.kind === 'deleted' ? (
            <span className="bubble__deleted">
              <Icon name="ban" size={16} />
              {message.byMe ? 'You deleted this message' : 'This message was deleted'}
            </span>
          ) : null}

          {message.kind === 'empty' ? (
            <span className="bubble__empty">Message not included in export</span>
          ) : null}

          <Meta
            timestamp={message.timestamp}
            clockStyle={clockStyle}
            {...(message.edited ? { edited: true } : {})}
            {...(message.kind === 'media' ? { kind: message.media.kind } : {})}
          />
        </div>

        {firstOfRun ? (
          <span className="tail tail--first">
            <Tail corner={outgoing ? 'top-right' : 'top-left'} />
          </span>
        ) : null}
        {lastOfRun ? (
          <span className="tail tail--last">
            <Tail corner={outgoing ? 'bottom-right' : 'bottom-left'} />
          </span>
        ) : null}
      </div>
    </div>
  );
});
