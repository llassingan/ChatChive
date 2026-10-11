import { describe, expect, it } from 'vitest';
import { splitLines, stripInvisible } from './text.ts';

describe('stripInvisible', () => {
  it('removes BOM, LRM and bidi marks', () => {
    const input = '\uFEFF\u200Ehello\u200F';
    expect(stripInvisible(input)).toBe('hello');
  });

  it('replaces U+202F with a normal space so AM/PM stays separated', () => {
    expect(stripInvisible('9:36\u202FPM')).toBe('9:36 PM');
  });

  it('leaves ordinary text untouched', () => {
    expect(stripInvisible('6/2/26, 21:36 - Mira: hi')).toBe('6/2/26, 21:36 - Mira: hi');
  });
});

describe('splitLines', () => {
  it('handles LF, CRLF and CR', () => {
    expect(splitLines('a\nb\r\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not emit a trailing empty line', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
  });

  it('preserves intentional blank lines inside the body', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
  });
});
