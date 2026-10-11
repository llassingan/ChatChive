/**
 * Character and line normalization shared by the header parser (E2-2) and
 * date-order detection (E2-3). Pure string work, no DOM.
 */

/** U+FEFF byte-order mark, U+200E/U+200F bidi marks, U+202F narrow no-break space. */
const INVISIBLE_CHARS = /[\uFEFF\u200E\u200F\u202F\u202A-\u202E\u2066-\u2069]/g;

/**
 * WhatsApp iOS exports pepper lines with left-to-right marks and narrow
 * no-break spaces, and some editors prepend a BOM. Removing them lets a single
 * header regex match both platforms. U+202F is replaced with a normal space
 * because iOS uses it between time and AM/PM; the others are dropped.
 */
export function stripInvisible(input: string): string {
  return input.replace(INVISIBLE_CHARS, (char) => (char === '\u202F' ? ' ' : ''));
}

/**
 * Split raw export text into lines, tolerating CRLF (Windows), CR (old macOS)
 * and LF. A trailing newline does not produce a final empty line.
 */
export function splitLines(input: string): string[] {
  const normalized = input.replace(/\r\n?/g, '\n');
  const withoutTrailingNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return withoutTrailingNewline.split('\n');
}
