/**
 * Focused coverage for the import flow's observable states (E3-1, E3-2). The
 * parser worker is absent under jsdom, so a valid file exercises the "unknown"
 * path while a wrong extension exercises the local rejection. The remaining
 * assertions are the pure helpers the screens read from.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { describeError } from './import/errors.ts';
import { overallFraction } from './import/useImportFlow.ts';

declare global {
  // React only flushes effects synchronously inside act() when this is set.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<App />);
  });
  return container;
}

/** The file input is the only one on the landing screen. */
function fileInput(view: HTMLElement) {
  const input = view.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input missing');
  return input;
}

function setFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('overallFraction', () => {
  it('maps each phase into its slice of the whole', () => {
    expect(overallFraction('reading', 0)).toBe(0);
    expect(overallFraction('reading', 1)).toBeCloseTo(1 / 3);
    expect(overallFraction('unzipping', 0.5)).toBeCloseTo(0.5);
    expect(overallFraction('parsing', 1)).toBeCloseTo(1);
    expect(overallFraction('ready', 0)).toBe(1);
  });

  it('returns undefined when the phase cannot report a fraction', () => {
    expect(overallFraction('reading', undefined)).toBeUndefined();
    expect(overallFraction('unzipping', undefined)).toBeUndefined();
  });
});

describe('describeError', () => {
  it('has a distinct, non-empty message for every code', () => {
    const codes = [
      'no-chat-file',
      'unrecognized-format',
      'corrupted-zip',
      'too-large',
      'unknown',
    ] as const;
    const titles = codes.map((code) => describeError(code).title);
    expect(new Set(titles).size).toBe(codes.length);
    for (const code of codes) {
      expect(describeError(code).body.length).toBeGreaterThan(0);
    }
  });
});

describe('landing screen', () => {
  it('renders the drop zone, privacy note and export help control', () => {
    const view = render();
    expect(view.querySelector('.dropzone')).not.toBeNull();
    expect(view.querySelector('h1')?.textContent).toBe('ChatChive');
    expect(view.textContent).toContain('never uploaded');
    expect(view.textContent).toContain('How to export a chat from WhatsApp');
  });

  it('rejects a file that is neither zip nor txt without touching the parser', () => {
    const view = render();

    act(() => {
      setFile(fileInput(view), new File(['x'], 'holiday.png', { type: 'image/png' }));
    });

    expect(view.textContent).toContain('Not a chat export');
  });

  it('reports a drop that carried no readable file (a folder)', () => {
    const view = render();
    const zone = view.querySelector('.dropzone');
    expect(zone).not.toBeNull();

    act(() => {
      // A folder drop arrives as a dataTransfer with an empty file list; jsdom
      // has no DataTransfer constructor, so stub the one property the handler reads.
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { files: [] } });
      zone?.dispatchEvent(event);
    });

    expect(view.textContent).toContain('Not a chat export');
  });
});

describe('import flow', () => {
  it('reaches an error state with a way back for an accepted file', async () => {
    const view = render();

    await act(async () => {
      setFile(
        fileInput(view),
        new File(['x'], 'WhatsApp Chat with Sam.txt', { type: 'text/plain' }),
      );
    });

    // No Worker under jsdom, so the session resolves to the unknown error; the
    // point is that the flow left the landing screen and offered a recovery.
    expect(view.textContent).toContain('Could not read the file');
    expect(view.textContent).not.toContain('Not a chat export');
    expect(view.querySelector('.button--primary')?.textContent).toBe('Choose another file');
  });

  it('returns to the landing screen after going back', async () => {
    const view = render();

    await act(async () => {
      setFile(
        fileInput(view),
        new File(['x'], 'WhatsApp Chat with Sam.zip', { type: 'application/zip' }),
      );
    });

    const back = view.querySelector('.button--primary');
    if (!(back instanceof HTMLButtonElement)) throw new Error('recovery button missing');
    act(() => back.click());

    expect(view.querySelector('.dropzone')).not.toBeNull();
  });
});
