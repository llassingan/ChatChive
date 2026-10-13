/**
 * Icon and label per media kind (F-VIEW-12).
 *
 * This lives in its own module, not in `MessageRow.tsx`, for two reasons.
 *
 * Fast Refresh: `react-refresh/only-export-components` requires a component
 * module to export components and nothing else. Exporting this object from
 * `MessageRow.tsx` (which is what E5 first did, so `ChatPanel` could read it)
 * meant any edit to either file became a full page reload instead of a hot
 * update, because the plugin cannot tell a data export from a component one.
 *
 * One map, not two: `ChatPanel`'s one-line preview has to say a media message
 * the same way the bubble does, so both sides import this file. A second copy
 * beside the preview is the drift plan §5.2 item 6 exists to close.
 */
import type { MediaKind } from '../../types/chat.ts';
import type { IconName } from '../icons/index.ts';

export const MEDIA_META: Record<MediaKind, { icon: IconName; label: string }> = {
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
