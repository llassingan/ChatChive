/**
 * One message row (backlog E4-2, E4-3, E4-4, E4-7, E4-6).
 *
 * Renders the bubble for text, media, deleted and empty messages, the centered
 * pill for a system notice. The layout flags come from `layout.ts`, so this
 * component never re-derives runs.
 *
 * Message text is a React text node, never HTML: a crafted export containing
 * `<script>` shows the literal characters (PRD S-5), including now that E4-6's
 * formatting is on, because the tokenizer splits the string and the renderer
 * emits text nodes. The bubble's aria-label hears the plain-text variant, so a
 * screen reader never reads an asterisk aloud (DESIGN §5).
 */
import { memo, useCallback, useState } from 'react';
import type {
  ClockStyle,
  MediaKind,
  MediaMessage,
  Message,
  Participant,
} from '../../types/chat.ts';
import type { MediaEntry } from '../media/store.ts';
import { isJumboEmoji, toPlainText } from '../formatText.ts';
import { formatClock } from '../format.ts';
import { Icon } from '../icons/index.ts';
import { MEDIA_META } from './mediaMeta.ts';
import { FormattedText } from './FormattedText.tsx';
import type { MediaShape } from './media/shape.ts';
import { Tail } from './Tail.tsx';
import { DocumentBody } from './media/DocumentBody.tsx';
import { ImageBody } from './media/ImageBody.tsx';
import { MediaFallback, MediaPending } from './media/MediaFallback.tsx';
import { StickerBody } from './media/StickerBody.tsx';
import { VideoBody } from './media/VideoBody.tsx';
import { VoiceBody } from './media/VoiceBody.tsx';
import './MessageRow.css';
import './media/media.css';

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
  /**
   * This row's media state, or null when nothing was requested for it. Read
   * from the store by `MessageList` during render, and stable by identity until
   * the entry's status changes, which is what keeps `memo` cheap (plan §2.5).
   */
  mediaEntry: MediaEntry | null;
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
 * The media body: which file is shown, per kind and store status (E5-2, E5-3,
 * E5-4, E5-6, E5-7).
 *
 * The three "not there" states are two tiles (§3.3): a reference the archive
 * never had is the dashed placeholder with no control, while bytes that came out
 * but will not decode (or an archive that stopped answering) render the kind's
 * own "cannot show" line, with a Download link when there are bytes to hand
 * over. Everything else waits in the static reserved box, never a shimmer.
 *
 * A body may also degrade to a tile *after* extraction, which is why
 * `ImageBody` and `VideoBody` take an `onDegrade` callback: the row gates the
 * scrim on the shape actually painted, and it cannot see that decision here.
 * See `media/shape.ts`.
 */

function MediaBody({
  message,
  entry,
  label,
  onDegrade,
}: {
  message: MediaMessage;
  entry: MediaEntry | null;
  /** Names the message in a control's accessible name, e.g. `Play, <label>`. */
  label: string;
  /** The body painted a tile instead of a frame, so the bubble needs no scrim. */
  onDegrade: () => void;
}) {
  const { media } = message;
  const meta = MEDIA_META[media.kind];

  // Contact cards and locations are not files this viewer can show, so they are
  // decided before the "not in the export" test below: a location is *always*
  // `resolved: false` (the parser has no archive entry for a maps URL, it has
  // the URL itself), and reading that flag first would label every location
  // "Location not included in export" and leave the link below unreachable.
  if (media.kind === 'contact' || media.kind === 'location') {
    return (
      <span className="media">
        <span className="media__glyph">
          <Icon name={meta.icon} size={22} />
        </span>
        <span className="media__text">
          {media.kind === 'location' ? (
            // The maps URL as a real link (§3.2): nothing is fetched until the
            // user clicks, and the anchor carries the same hardened new-tab
            // treatment as every other external link in the app
            // (`FormattedText.tsx`, E4-6). A `.vcf` stays plain text: there is
            // no address to open.
            <a
              className="media__title"
              href={media.fileName}
              target="_blank"
              rel="noopener noreferrer"
            >
              {media.fileName}
            </a>
          ) : (
            <span className="media__title">{media.fileName}</span>
          )}
          <span className="media__sub">{meta.label}</span>
        </span>
      </span>
    );
  }

  // Not in the export: there is nothing to request and nothing to hand over
  // (F-VIEW-12). This is the tile `chat.spec.ts` already knows.
  if (!media.resolved) {
    return (
      <MediaFallback
        tone="missing"
        icon={meta.icon}
        title={`${meta.label} not included in export`}
        fileName={media.fileName}
      />
    );
  }

  if (entry === null || entry.status === 'loading') {
    // Reserved space before the bytes arrive: a ratio for a visual, a height for
    // the kinds that have none (§3.4). The box is static, never a shimmer.
    const ratio =
      media.kind === 'video'
        ? '16 / 9'
        : media.kind === 'image' || media.kind === 'gif'
          ? '4 / 3'
          : undefined;
    return <MediaPending kind={media.kind} ratio={ratio} />;
  }

  // The archive has no such entry, or `extract` rejected / returned null after
  // the session closed. Either way there are no bytes to offer (§3.3).
  if (entry.status === 'unavailable' || entry.status === 'error') {
    return (
      <MediaFallback
        tone="broken"
        icon={meta.icon}
        title={
          // §3.3's copy, verbatim: each kind says what it cannot do, and the
          // apostrophe is ASCII so the assertion and the source agree.
          media.kind === 'video'
            ? "Video can't be played here"
            : media.kind === 'voice' || media.kind === 'audio'
              ? "Can't play here"
              : `${meta.label} can't be shown here`
        }
        fileName={media.fileName}
        byteSize={media.byteSize}
      />
    );
  }

  switch (media.kind) {
    case 'image':
    case 'gif':
      return <ImageBody media={media} url={entry.url} onDegrade={onDegrade} />;
    case 'video':
      return <VideoBody media={media} url={entry.url} label={label} onDegrade={onDegrade} />;
    case 'sticker':
      return <StickerBody media={media} url={entry.url} />;
    case 'voice':
    case 'audio':
      return <VoiceBody media={media} url={entry.url} label={label} />;
    case 'document':
      return <DocumentBody media={media} url={entry.url} />;
    default:
      return null;
  }
}

/**
 * The plain-text body a screen reader should hear, per message kind. Text goes
 * through `toPlainText`, so the label says "bold" rather than "asterisk bold
 * asterisk" now that E4-6 renders markers as elements (§4.3).
 */
function spokenBody(message: Message): string {
  switch (message.kind) {
    case 'text':
      return toPlainText(message.text);
    case 'deleted':
      return message.byMe ? 'You deleted this message' : 'This message was deleted';
    case 'empty':
      return 'Message not included in export';
    case 'media':
      // A location's "body" is the maps URL, so the label says the link rather
      // than just "Location" (plan §5.2 item 4).
      if (message.media.kind === 'location') return `Location, ${message.media.fileName}`;
      return [MEDIA_META[message.media.kind].label, message.caption && toPlainText(message.caption)]
        .filter(Boolean)
        .join(', ');
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
  mediaEntry,
}: MessageRowProps) {
  // What the media body actually painted, reported up by `MediaBody`. It must
  // be declared before the system-notice early return below: a hook cannot sit
  // behind a conditional. The default is `frame`, the honest guess for a
  // `ready` visual, so a photo that renders normally never calls the setter and
  // never costs an extra render. Only the fallback path settles here, and it
  // settles once: a shape that has become `tile` is never asked to change back.
  const [mediaShape, setMediaShape] = useState<MediaShape>('frame');
  // Settling only on `tile` is what makes the shape monotonic: a body that
  // paints a frame must never be told back to `frame`, or the scrim would
  // appear and disappear as a row re-rendered. `setState` with the same value
  // is a no-op in React, so a repeated report costs nothing.
  const degradeMedia = useCallback(() => setMediaShape('tile'), []);

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

  // Jumbo emoji drops the bubble fill and grows the glyphs, and does nothing
  // else: the row keeps its run, its tail and (on mobile, incoming) its avatar,
  // so a message never groups differently because of what it says (§3.9).
  // The verdict is read here because the class belongs on the bubble. It uses
  // `isJumboEmoji`, a codepoint scan with no block splitting, so the row does
  // not pay for a second tokenization: `FormattedText` keeps the one that
  // matters behind its own `useMemo` (§2.3, §4.2), and `memo` on both
  // components bounds each to once per mounted row, never per scroll frame.
  if (message.kind === 'text' && isJumboEmoji(message.text)) classes.push('bubble--jumbo');

  // Media shapes (E5), chosen here rather than with `:has()` in CSS (§3.5): a
  // visual with no caption wears `bubble--meta-overlay`, which moves the meta
  // onto the frame's scrim, and a sticker wears the jumbo treatment's shape -
  // the bubble keeps its box for run grouping and loses its fill and padding.
  const media = message.kind === 'media' ? message.media : null;
  const caption = message.kind === 'media' ? message.caption : undefined;
  const visual =
    media !== null && (media.kind === 'image' || media.kind === 'video' || media.kind === 'gif');
  // The store says the bytes came out; the body says it painted a frame. Both
  // are needed: a photo whose bytes will not decode is `ready` yet paints a
  // tile, and moving the meta onto that tile lays it over the Download control,
  // which then cannot be clicked (QA, Sprint 5). The shape starts at `frame`, so
  // the normal path never settles it and never costs a render.
  const overlay = Boolean(
    visual && mediaEntry?.status === 'ready' && mediaShape === 'frame' && !caption,
  );
  if (overlay) classes.push('bubble--meta-overlay');
  if (media?.kind === 'sticker') classes.push('bubble--sticker');
  if (media?.kind === 'voice' || media?.kind === 'audio') classes.push('bubble--voice');

  // A focusable control inside an `aria-hidden` subtree is an accessibility bug
  // (axe `aria-hidden-focus`), so a row that renders a real control drops the
  // attribute entirely and each control carries its own `aria-label` (§3.6).
  //
  // Two rows qualify. A media row holding bytes: `ready` is exactly the state
  // in which a body may hold a control, because a photo or a sticker renders
  // none until its element errors, and that error state is chosen inside the
  // body, where the row cannot see it. Being exposed is harmless (the image has
  // `alt=""`); hiding a control is not. And a location, which is always a link
  // (§3.2) and always `resolved: false`, so the store status would never
  // reveal it.
  const hasControl =
    (mediaEntry !== null && mediaEntry.status === 'ready') || media?.kind === 'location';

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
        {/* The body is hidden from assistive tech so the bubble's label is not
            read twice, except on a row that renders a real control (§3.6). */}
        <div className="bubble__content" aria-hidden={hasControl ? undefined : true}>
          {showSender && participant ? <SenderHeader participant={participant} /> : null}

          {message.kind === 'text' ? (
            <FormattedText text={message.text} outgoing={outgoing} />
          ) : null}

          {message.kind === 'media' ? (
            <>
              <MediaBody
                message={message}
                entry={mediaEntry}
                label={label}
                onDegrade={degradeMedia}
              />
              {message.caption ? (
                <FormattedText text={message.caption} outgoing={outgoing} />
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
