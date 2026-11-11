import { i18n, t } from './i18n.svelte';

/** Stamped by vite.config.ts when the app is built (or the dev server starts). */
export interface BuildInfo {
  /** Running under `npm run dev`. */
  dev: boolean;
  /** GitHub Actions run number, or null for a local build. */
  run: string | null;
  /** Short commit sha, or null outside a git checkout. */
  sha: string | null;
  /** When it was built, ISO 8601. */
  date: string;
  /** GitHub repository page, for linking the commit. */
  repoUrl: string | null;
}

declare const __BUILD__: BuildInfo;

export const BUILD: BuildInfo = __BUILD__;

/** "build 42", "dev" or "local build": what to call this build. */
export function buildName(b: BuildInfo = BUILD): string {
  if (b.dev) return t('app.dev');
  return b.run ? t('app.build', { n: b.run }) : t('app.localBuild');
}

/** Build date in the reader's time zone and language, e.g. "11 Nov 2026, 14:05". */
export function buildDate(b: BuildInfo = BUILD, lang: string = i18n.lang): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(b.date));
}

export function commitUrl(b: BuildInfo = BUILD): string | null {
  return b.repoUrl && b.sha ? `${b.repoUrl}/commit/${b.sha}` : null;
}
