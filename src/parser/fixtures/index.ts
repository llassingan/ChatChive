/**
 * Synthetic, anonymized export fixtures (backlog E2-1). Every string here is
 * invented: no real names, numbers or chat content. They cover the formats
 * and locales the parser must handle, and are imported as raw text (Vite's
 * `?raw`) so tests exercise the exact bytes, including the invisible U+200E /
 * U+202F characters in the iOS fixtures.
 *
 * These are test assets. They are not part of the shipped bundle.
 */

import androidEnMd24h from './android-en-md-24h.txt?raw';
import androidIdDm24h from './android-id-dm-24h.txt?raw';
import androidEnMd12h from './android-en-md-12h.txt?raw';
import iosEnUs from './ios-en-us.txt?raw';
import iosIdId from './ios-id-id.txt?raw';
import groupAndroidEn from './group-android-en.txt?raw';
import groupColonNotice from './group-colon-notice.txt?raw';
import androidNoMedia from './android-no-media.txt?raw';
import txtOnly from './txt-only.txt?raw';

export type FixtureName =
  | 'android-en-md-24h'
  | 'android-id-dm-24h'
  | 'android-en-md-12h'
  | 'ios-en-us'
  | 'ios-id-id'
  | 'group-android-en'
  | 'group-colon-notice'
  | 'android-no-media'
  | 'txt-only';

export const fixtures: Record<FixtureName, string> = {
  'android-en-md-24h': androidEnMd24h,
  'android-id-dm-24h': androidIdDm24h,
  'android-en-md-12h': androidEnMd12h,
  'ios-en-us': iosEnUs,
  'ios-id-id': iosIdId,
  'group-android-en': groupAndroidEn,
  'group-colon-notice': groupColonNotice,
  'android-no-media': androidNoMedia,
  'txt-only': txtOnly,
};

export const fixtureNames = Object.keys(fixtures) as FixtureName[];
