/**
 * Theme preference (E7-3; PRD F-NAV-5, R-34).
 *
 * Three modes are offered — System, Light, Dark — and the whole document is
 * themed by one attribute on `<html>`: `data-theme`. `tokens.css` carries a rule
 * for `light` and one for `classic` and nothing for dark, so **dark is the
 * absence of the attribute**, not an attribute value. That is not an internal
 * detail: `tests/e2e/visual.spec.ts` proves a dark capture by asserting the
 * attribute is absent, and writing `data-theme="dark"` would leave two spellings
 * of one state with a rule for only one of them.
 *
 * `classic` (the pre-2024 blue-grey palette) is a fourth state the control does
 * not offer. There is no `prefers-color-scheme: classic`, so the attribute is
 * the only channel a host page or a hand-seeded test has for it. A document that
 * arrives carrying a theme keeps it, byte for byte, until the reader chooses:
 * clobbering it on boot would put the one non-OS-following theme permanently out
 * of reach.
 *
 * Storage holds the reader's *choice*, not resolved colours: `system` is a
 * choice and is stored as one. A missing key means "never chose" — a first visit
 * writes nothing — and the boot rules below decide what such a visit shows.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/** The three modes the control offers, and the only values ever stored. */
export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * What the document is showing. `classic` is not in `ThemeMode`: it is a state
 * the app can be *in* without the control being able to select it.
 */
export type ThemeState = ThemeMode | 'classic';

/** The value written to `<html data-theme>`; `null` is the dark default. */
export type ThemeAttribute = 'light' | 'classic' | null;

export const THEME_KEY = 'chatchive:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The storage vocabulary: a stored string, accepted only if this app wrote it. */
export function parseMode(value: string | null | undefined): ThemeMode | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

/**
 * The attribute vocabulary. `dark` is accepted as a state rather than ignored:
 * no rule matches it, so it renders exactly like the absence this app writes,
 * but a document carrying it is still making a statement about dark.
 */
export function attributeState(value: string | null | undefined): ThemeState | null {
  return value === 'light' || value === 'classic' || value === 'dark' ? value : null;
}

/**
 * The attribute a state resolves to, given the OS preference.
 *
 * Split from the DOM on purpose: the OS preference is an argument, so the whole
 * three-by-two matrix is unit-testable without a `matchMedia` stub. Live
 * following of OS changes belongs to `useTheme`.
 */
export function themeAttribute(state: ThemeState, prefersDark: boolean): ThemeAttribute {
  switch (state) {
    case 'classic':
      return 'classic';
    case 'light':
      return 'light';
    case 'dark':
      return null;
    case 'system':
      return prefersDark ? null : 'light';
  }
}

export function readStoredMode(): ThemeMode | null {
  try {
    return parseMode(window.localStorage.getItem(THEME_KEY));
  } catch {
    // Storage access throws where it is blocked (private mode, cookie
    // settings), on read as well as on write. A theme is not worth an error
    // screen, so a failed read is "never chose".
    return null;
  }
}

export function writeStoredMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    // The choice still applies to this session; only persistence is lost.
  }
}

/** Sets or clears `<html data-theme>`. Idempotent: StrictMode runs effects twice. */
export function applyTheme(attribute: ThemeAttribute): void {
  const root = document.documentElement;
  if (attribute === null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', attribute);
}
/** The starting state, and whether the document's own theme is being left alone. */
export interface ThemeBoot {
  /** The mode the first render should show. */
  mode: ThemeState;
  /** True when the document arrived with a theme that is being honoured, not applied. */
  adopted: boolean;
}

/**
 * What a fresh boot shows. A stored choice wins; failing that, a theme already
 * on the document is adopted — with one exception.
 *
 * The app itself writes exactly one theme without being asked: following System
 * on a light machine writes `light` (the landing screen applies the theme before
 * any chat exists, in this same document). So a `light` attribute on a light
 * machine is not evidence of a choice — treating it as one would latch a Light
 * selection nobody made and quietly stop following the OS, the moment the reader
 * imports a file. Everything else is honoured: `classic` is never written
 * unprompted, `dark` is never written at all (it is the attribute's absence),
 * and `light` on a dark machine is not something this app produces. That last
 * one also keeps the theme loops honest on any machine, seeded or not.
 */
export function initialState(): ThemeBoot {
  const stored = readStoredMode();
  if (stored !== null) return { mode: stored, adopted: false };

  const found = attributeState(document.documentElement.getAttribute('data-theme'));
  const prefersDark = window.matchMedia?.(DARK_QUERY)?.matches ?? false;
  if (found !== null && !(found === 'light' && !prefersDark)) {
    return { mode: found, adopted: true };
  }
  return { mode: 'system', adopted: false };
}

export interface ThemeControl {
  /** What the document is showing; `classic` means it arrived from outside. */
  mode: ThemeState;
  /** Records an explicit choice, then applies it. */
  setMode: (mode: ThemeMode) => void;
}

/*
  One theme, one owner.

  `useTheme` used to hold its state in a component-local `useState`, on the
  assumption that exactly one component called it. That stopped being true when
  the root (`App`) and the chat view both needed it: two instances meant two
  `ThemeBoot`s, and choosing a mode in the chat updated only the chat's copy.
  The root's copy stayed on `system`, its `matchMedia` listener kept running, and
  the next OS flip overwrote the reader's explicit choice — the exact opposite of
  what "an explicit mode stops following the OS" promises.

  So the state lives here, at module scope, as a tiny external store:
  every `useTheme()` call reads the same value and `setMode` notifies all of
  them. One `matchMedia` listener is installed for the life of the page, driven
  by whichever `system` change arrives.
*/
let currentBoot: ThemeBoot | null = null;
const listeners = new Set<() => void>();

function readBoot(): ThemeBoot {
  if (currentBoot === null) currentBoot = initialState();
  return currentBoot;
}

function publish(next: ThemeBoot): void {
  currentBoot = next;
  for (const listener of listeners) listener();
}

/**
 * Drops the cached boot so the next `useTheme()` re-derives it from storage and
 * the document. The store is module-scope, so this exists for test isolation:
 * a unit test that clears `localStorage` between cases would otherwise inherit
 * the previous case's state. A real page load gets a fresh module, so this is
 * never needed in production.
 */
export function resetThemeStore(): void {
  currentBoot = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Applies the theme to the document and, in System mode, keeps following the OS.
 *
 * Safe to call from more than one component: the state is shared, so a choice
 * made by one caller is seen by the others and the OS listener is singular.
 */
export function useTheme(): ThemeControl {
  const boot = useSyncExternalStore(subscribe, readBoot, readBoot);
  const { mode, adopted } = boot;

  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY) ?? null;
    // An adopted theme stays exactly as found until the reader chooses one, so
    // nothing here rewrites it — but System still listens either way, which it
    // cannot be while adopted.
    if (!adopted) applyTheme(themeAttribute(mode, query?.matches ?? false));
    if (mode !== 'system' || !query) return undefined;
    const onSystemChange = () => applyTheme(themeAttribute('system', query.matches));
    query.addEventListener('change', onSystemChange);
    return () => query.removeEventListener('change', onSystemChange);
  }, [mode, adopted]);

  const setMode = useCallback((next: ThemeMode) => {
    writeStoredMode(next);
    publish({ mode: next, adopted: false });
  }, []);

  return { mode, setMode };
}
