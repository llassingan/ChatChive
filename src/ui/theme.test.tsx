/**
 * Theme preference (E7-3; PRD F-NAV-5, R-34).
 *
 * Two halves. The pure half — the storage vocabulary, the attribute vocabulary,
 * and the three-by-two resolution matrix — needs no DOM at all, which is why
 * `themeAttribute` takes the OS preference as an argument. The DOM half covers
 * the boot rules, what is and is not persisted, and live following of the OS,
 * under a stubbed `matchMedia`: jsdom does not implement one.
 */
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  attributeState,
  initialState,
  parseMode,
  readStoredMode,
  resetThemeStore,
  THEME_KEY,
  themeAttribute,
  useTheme,
  writeStoredMode,
  type ThemeMode,
} from './theme.ts';

declare global {
  // React only flushes effects synchronously inside act() when this is set.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

/**
 * The stubbed media query, including a way to flip the OS preference live — the
 * listener set is genuinely dynamic (tests add and remove subscribers and assert
 * on its size), so it is a `Set`, not a lookup table.
 */
interface MediaStub {
  matches: boolean;
  listeners: Set<() => void>;
  /** Flips `prefers-color-scheme: dark` and notifies subscribers, as a browser would. */
  set: (matches: boolean) => void;
}

/** Installs a `matchMedia` stub; jsdom ships none. */
function stubMatchMedia(initial: boolean): MediaStub {
  const listeners = new Set<() => void>();
  const state: MediaStub = {
    matches: initial,
    listeners,
    set(matches) {
      state.matches = matches;
      for (const listener of listeners) listener();
    },
  };
  // Named because lib.dom's `matchMedia` type demands members the stub has no
  // use for; the app only reads `matches` and the two listener methods.
  const stub = ((query: string) => ({
    // Live, like a real `MediaQueryList`: the app reads `matches` at mount and
    // again on every change notification, so a snapshot would make the
    // following-the-OS tests unfalsifiable.
    get matches() {
      return state.matches;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  window.matchMedia = stub;
  return state;
}

/** The attribute the document is actually carrying, read the way the specs read it. */
function appliedTheme(): string | null {
  return document.documentElement.getAttribute('data-theme');
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  Reflect.deleteProperty(window, 'matchMedia');
  // The theme store is module-scope, so a cleared `localStorage` is not enough:
  // the cached boot from the previous case would still answer the next render.
  resetThemeStore();
});

afterEach(() => {
  // Unconditionally, and at the top level: one test installs a `localStorage`
  // that throws, and a spy that outlives its test would make the next one fail
  // for a reason that has nothing to do with it.
  vi.restoreAllMocks();
});

describe('themeAttribute', () => {
  // The whole matrix, because every cell is a behaviour a spec can observe:
  // System is the only state that reads the OS, and dark resolves to no
  // attribute at all (there is no `[data-theme='dark']` rule).
  const matrix: [Parameters<typeof themeAttribute>[0], boolean, string | null][] = [
    ['system', false, 'light'],
    ['system', true, null],
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, null],
    ['dark', true, null],
    ['classic', false, 'classic'],
    ['classic', true, 'classic'],
  ];

  for (const [state, prefersDark, expected] of matrix) {
    it(`${state} on a ${prefersDark ? 'dark' : 'light'} OS resolves to ${expected ?? 'no attribute'}`, () => {
      expect(themeAttribute(state, prefersDark)).toBe(expected);
    });
  }

  it('never resolves to the string "dark", which no stylesheet matches', () => {
    expect(matrix.map(([, , attribute]) => attribute)).not.toContain('dark');
  });
});

describe('parseMode', () => {
  it('accepts exactly the three modes the control offers', () => {
    expect(parseMode('system')).toBe('system');
    expect(parseMode('light')).toBe('light');
    expect(parseMode('dark')).toBe('dark');
  });

  it('rejects anything else, including values this app never wrote', () => {
    for (const value of [null, undefined, '', 'classic', 'Dark', ' light', 'dark ']) {
      expect(parseMode(value)).toBeNull();
    }
  });
});

describe('attributeState', () => {
  it('reads the three attribute values a document can carry', () => {
    expect(attributeState('light')).toBe('light');
    expect(attributeState('classic')).toBe('classic');
    expect(attributeState('dark')).toBe('dark');
  });

  it('rejects absent, empty and unknown attributes', () => {
    for (const value of [null, undefined, '', 'system', 'Light', 'sepia']) {
      expect(attributeState(value)).toBeNull();
    }
  });
});

describe('applyTheme', () => {
  it('writes the attribute it is given', () => {
    applyTheme('light');
    expect(appliedTheme()).toBe('light');
    applyTheme('classic');
    expect(appliedTheme()).toBe('classic');
  });

  it('removes the attribute for the dark default', () => {
    applyTheme('light');
    applyTheme(null);
    expect(appliedTheme()).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('is idempotent, so a double-mounting StrictMode cannot drift', () => {
    applyTheme(null);
    applyTheme(null);
    expect(appliedTheme()).toBeNull();
    applyTheme('light');
    applyTheme('light');
    expect(appliedTheme()).toBe('light');
  });
});

describe('storage', () => {
  it('round-trips a chosen mode', () => {
    expect(readStoredMode()).toBeNull();
    writeStoredMode('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(readStoredMode()).toBe('dark');
  });

  it('stores "system" as a choice, because choosing to follow the OS is a choice', () => {
    writeStoredMode('system');
    expect(readStoredMode()).toBe('system');
  });

  it('treats a missing key as "never chose", which is not the same as system', () => {
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
    expect(readStoredMode()).toBeNull();
  });

  it('ignores a value this app did not write', () => {
    window.localStorage.setItem(THEME_KEY, 'sepia');
    expect(readStoredMode()).toBeNull();
  });

  it('survives storage that throws, on read and on write', () => {
    // Private mode and blocked-cookie settings throw on access, and a theme is
    // not worth an error screen.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is blocked');
    });
    expect(readStoredMode()).toBeNull();
    vi.restoreAllMocks();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is full');
    });
    expect(() => writeStoredMode('light')).not.toThrow();
  });
});

describe('initialState', () => {
  it('prefers a stored choice over whatever the document happens to carry', () => {
    window.localStorage.setItem(THEME_KEY, 'light');
    document.documentElement.setAttribute('data-theme', 'classic');
    expect(initialState()).toEqual({ mode: 'light', adopted: false });
  });

  it('follows the OS on a first visit with a clean document', () => {
    stubMatchMedia(true);
    expect(initialState()).toEqual({ mode: 'system', adopted: false });
  });

  it('adopts classic, which no OS setting can express', () => {
    stubMatchMedia(false);
    document.documentElement.setAttribute('data-theme', 'classic');
    expect(initialState()).toEqual({ mode: 'classic', adopted: true });
  });

  it('adopts a seeded dark attribute instead of deleting it', () => {
    // `tests/e2e/media.spec.ts` seeds `data-theme="dark"` and asserts it back.
    stubMatchMedia(false);
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(initialState()).toEqual({ mode: 'dark', adopted: true });
  });

  it('adopts light on a dark machine, where this app would not have written it', () => {
    stubMatchMedia(true);
    document.documentElement.setAttribute('data-theme', 'light');
    expect(initialState()).toEqual({ mode: 'light', adopted: true });
  });

  it('does not mistake its own System write for a choice', () => {
    // The landing screen applies the theme before any chat exists, so a light
    // attribute on a light machine is the app's own paint, not a decision.
    // Adopting it would latch a Light choice nobody made and stop following.
    stubMatchMedia(false);
    document.documentElement.setAttribute('data-theme', 'light');
    expect(initialState()).toEqual({ mode: 'system', adopted: false });
  });

  it('ignores an attribute that is not a theme', () => {
    stubMatchMedia(false);
    document.documentElement.setAttribute('data-theme', 'sepia');
    expect(initialState()).toEqual({ mode: 'system', adopted: false });
  });
});

describe('useTheme', () => {
  const MODES = ['system', 'light', 'dark'] as const;

  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  /** A native radio group, the same shape the chat menu ships. */
  function ThemeHarness() {
    const { mode, setMode } = useTheme();
    return (
      <fieldset aria-label="Theme">
        {MODES.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="theme"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {value}
          </label>
        ))}
        <p data-testid="mode">{mode}</p>
      </fieldset>
    );
  }

  function mount(strict = false) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(strict ? <StrictMode>{<ThemeHarness />}</StrictMode> : <ThemeHarness />);
    });
    return container;
  }

  /** Picks a mode the way a reader does: by clicking the radio. */
  function pick(mode: ThemeMode) {
    const input = container?.querySelector<HTMLInputElement>(`input[value="${mode}"]`);
    if (!input) throw new Error(`no radio for ${mode}`);
    act(() => {
      input.click();
    });
  }

  function shownMode(): string | undefined {
    return container?.querySelector('[data-testid="mode"]')?.textContent ?? undefined;
  }

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it('follows the OS on a clean first visit and writes nothing', () => {
    stubMatchMedia(true);
    mount();
    expect(appliedTheme()).toBeNull();
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('applies the OS value on a light machine without storing it', () => {
    stubMatchMedia(false);
    mount();
    expect(appliedTheme()).toBe('light');
    // Nothing was chosen, so nothing is remembered: the next visit follows the
    // OS again rather than pinning whatever this machine happened to be.
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('persists an explicit choice and applies it', () => {
    stubMatchMedia(false);
    mount();
    pick('dark');
    expect(appliedTheme()).toBeNull();
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(shownMode()).toBe('dark');

    pick('light');
    expect(appliedTheme()).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('keeps following the OS live while in System', () => {
    const os = stubMatchMedia(false);
    mount();
    expect(appliedTheme()).toBe('light');

    act(() => os.set(true));
    expect(appliedTheme()).toBeNull();

    act(() => os.set(false));
    expect(appliedTheme()).toBe('light');
  });

  it('stops following the OS once a mode is chosen, and resumes when System is chosen back', () => {
    const os = stubMatchMedia(false);
    mount();
    pick('dark');

    act(() => os.set(true));
    act(() => os.set(false));
    expect(appliedTheme()).toBeNull();

    pick('system');
    expect(appliedTheme()).toBe('light');
    act(() => os.set(true));
    expect(appliedTheme()).toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const os = stubMatchMedia(true);
    mount();
    expect(os.listeners.size).toBe(1);
    act(() => root?.unmount());
    root = null;
    expect(os.listeners.size).toBe(0);
  });

  it('survives StrictMode, which mounts, unmounts and mounts again', () => {
    const os = stubMatchMedia(false);
    mount(true);
    expect(shownMode()).toBe('system');
    expect(appliedTheme()).toBe('light');
    // One live subscription, not two: the first mount's cleanup must have run.
    expect(os.listeners.size).toBe(1);
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('honours a stored choice on the next visit, even against the OS', () => {
    stubMatchMedia(true);
    window.localStorage.setItem(THEME_KEY, 'light');
    mount();
    expect(shownMode()).toBe('light');
    expect(appliedTheme()).toBe('light');
  });

  it('leaves an adopted theme exactly as found', () => {
    const os = stubMatchMedia(false);
    document.documentElement.setAttribute('data-theme', 'classic');
    mount();
    expect(shownMode()).toBe('classic');
    expect(appliedTheme()).toBe('classic');
    // classic is not System, so nothing here follows the OS, and nothing was
    // written: the reader has still not chosen.
    expect(os.listeners.size).toBe(0);
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('lets the reader leave an adopted theme for one of the three modes', () => {
    stubMatchMedia(false);
    document.documentElement.setAttribute('data-theme', 'classic');
    mount();
    pick('light');
    expect(appliedTheme()).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
  });
});
