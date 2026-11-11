/**
 * Every .txt under /songs and /patterns is bundled into the app. Keys are paths without the
 * extension, starting with their top folder: "songs/drafts/batala-hey", "patterns/virgule".
 *
 * - songs/ holds whole songs; its subfolders only organise them.
 * - patterns/ holds reusable grooves and breaks, imported (copied) into songs.
 *
 * LIBRARY is reactive: in dev, when a file is added or changed, this module re-runs and updates the
 * same object in place instead of reloading the page, so playback and unsaved work carry on.
 */
const files = import.meta.glob(['/songs/**/*.txt', '/patterns/**/*.txt'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const fresh = $state<Record<string, string>>({});
export const LIBRARY: Record<string, string> =
  (import.meta.hot?.data.LIBRARY as Record<string, string> | undefined) ?? fresh;

const current = Object.fromEntries(
  Object.entries(files).map(([p, text]) => [p.replace(/^\//, '').replace(/\.txt$/i, ''), text]),
);
for (const k of Object.keys(LIBRARY)) if (!(k in current)) delete LIBRARY[k];
for (const [k, v] of Object.entries(current)) if (LIBRARY[k] !== v) LIBRARY[k] = v;

if (import.meta.hot) {
  import.meta.hot.data.LIBRARY = LIBRARY;
  import.meta.hot.accept();
}

export type LibKind = 'songs' | 'patterns';
export const LIB_KINDS: LibKind[] = ['songs', 'patterns'];

export interface LibEntry {
  /** "songs/drafts/batala-hey" */
  path: string;
  kind: LibKind;
  /** Subfolder inside songs/ or patterns/ ("" for the top level). */
  group: string;
  title: string;
}

export function kindOf(path: string): LibKind {
  return path.startsWith('patterns/') ? 'patterns' : 'songs';
}

export function libraryEntries(kind?: LibKind): LibEntry[] {
  return Object.entries(LIBRARY)
    .map(([path, text]) => {
      const k = kindOf(path);
      const inner = path.slice(k.length + 1);
      const slash = inner.lastIndexOf('/');
      return {
        path,
        kind: k,
        group: slash < 0 ? '' : inner.slice(0, slash),
        title: text.match(/^\s*title:\s*(.+?)\s*$/im)?.[1] ?? inner.slice(slash + 1),
      };
    })
    .filter((e) => !kind || e.kind === kind)
    .sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title));
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Folder part of a library path: "songs/drafts/x" -> "songs/drafts". */
export function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}
