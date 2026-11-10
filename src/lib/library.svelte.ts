/**
 * Every .txt under /songs is bundled into the app. Keys are paths without the folder or extension:
 * "grooves/samba-basic".
 *
 * LIBRARY is reactive: in dev, when a file is added or changed, this module re-runs and updates the
 * same object in place instead of reloading the page, so playback and unsaved work carry on.
 */
const files = import.meta.glob('/songs/**/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

const fresh = $state<Record<string, string>>({});
export const LIBRARY: Record<string, string> =
  (import.meta.hot?.data.LIBRARY as Record<string, string> | undefined) ?? fresh;

const current = Object.fromEntries(
  Object.entries(files).map(([p, text]) => [p.replace(/^\/songs\//, '').replace(/\.txt$/i, ''), text]),
);
for (const k of Object.keys(LIBRARY)) if (!(k in current)) delete LIBRARY[k];
for (const [k, v] of Object.entries(current)) if (LIBRARY[k] !== v) LIBRARY[k] = v;

if (import.meta.hot) {
  import.meta.hot.data.LIBRARY = LIBRARY;
  import.meta.hot.accept();
}

export interface LibEntry {
  path: string;
  /** Subfolder ("" for top level). */
  group: string;
  title: string;
}

export function resolveRef(path: string): string | null {
  return LIBRARY[path] ?? null;
}

export function libraryEntries(): LibEntry[] {
  return Object.entries(LIBRARY)
    .map(([path, text]) => {
      const slash = path.lastIndexOf('/');
      return {
        path,
        group: slash < 0 ? '' : path.slice(0, slash),
        title: text.match(/^\s*title:\s*(.+?)\s*$/im)?.[1] ?? path.slice(slash + 1),
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title));
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** "grooves/x#main" -> { path: "grooves/x", section: "main" } */
export function splitRef(ref: string): { path: string; section: string | null } {
  const i = ref.indexOf('#');
  return i < 0 ? { path: ref.trim(), section: null } : { path: ref.slice(0, i).trim(), section: ref.slice(i + 1).trim() };
}
