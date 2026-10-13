/**
 * What a media body actually painted: a frame (an image, video or sticker box)
 * or a tile (one of the "cannot show" tiles, or the naming tile for a contact
 * and a location).
 *
 * It exists because the row cannot derive it. The store's `ready` means the
 * *bytes were extracted*, not that a frame was painted: `ImageBody` falls back
 * to a tile when the bytes will not decode, and `VideoBody` falls back when the
 * engine cannot demux the codec, and both decide that after extraction. Only a
 * frame can carry the message's meta on its scrim (plan §4.3), so the bodies
 * report their shape up to `MessageRow`, which gates `bubble--meta-overlay` on
 * it. Without that, the meta is laid over a tile and covers the Download
 * control, which then cannot be clicked (QA, Sprint 5).
 *
 * It lives in its own module so the bodies can import the type without reaching
 * back into `MessageRow.tsx`, which imports them.
 */
export type MediaShape = 'frame' | 'tile';
