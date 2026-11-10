import LZString from 'lz-string';
import { t } from './i18n.svelte';
import { LIBRARY } from './library.svelte';
import { EMPTY_SONG } from './newSong';

const KEY = 'beats.song';
const ORIGIN_KEY = 'beats.origin';

/** Where the current song was loaded from, and its text at that moment. */
export interface Origin {
  path: string;
  text: string;
}

export interface Loaded {
  text: string;
  origin: Origin | null;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveLocal({ text, origin }: Loaded) {
  try {
    localStorage.setItem(KEY, text);
    if (origin) localStorage.setItem(ORIGIN_KEY, JSON.stringify(origin));
    else localStorage.removeItem(ORIGIN_KEY);
  } catch {
    /* private mode etc: nothing to do */
  }
}

export function fromLibrary(path: string): Loaded {
  const text = LIBRARY[path] ?? '';
  return { text, origin: { path, text } };
}

/** Song from the URL (#s=...), the saved song, or an empty song, in that order. */
export function loadInitial(): Loaded {
  const stored = read(KEY);
  let origin: Origin | null = null;
  try {
    origin = JSON.parse(read(ORIGIN_KEY) ?? 'null');
  } catch {
    /* ignore */
  }

  const m = location.hash.match(/^#s=(.+)$/);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    const shared = LZString.decompressFromEncodedURIComponent(m[1]);
    if (shared && (!stored || stored === shared || confirm(t('confirm.shared'))))
      return { text: shared, origin: null };
  }

  if (stored != null) {
    // Unchanged copy of a library file that has since been updated: take the new version.
    if (origin && stored === origin.text && LIBRARY[origin.path] != null && LIBRARY[origin.path] !== origin.text)
      return fromLibrary(origin.path);
    return { text: stored, origin };
  }
  return { text: EMPTY_SONG, origin: null };
}

export function shareLink(text: string): string {
  return `${location.origin}${location.pathname}#s=${LZString.compressToEncodedURIComponent(text)}`;
}

export function downloadText(filename: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
