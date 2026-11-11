import { describe, expect, it } from 'vitest';
import { BUILD, buildDate, buildName, commitUrl, type BuildInfo } from './build';

const ci: BuildInfo = { dev: false, run: '42', sha: '7a605ea', date: '2026-11-11T13:05:00Z', repoUrl: 'https://github.com/o/r' };

describe('build info', () => {
  it('is stamped by the Vite config', () => {
    expect(typeof BUILD.date).toBe('string');
    expect(Number.isNaN(Date.parse(BUILD.date))).toBe(false);
  });

  it('names GitHub, local and dev builds', () => {
    expect(buildName(ci)).toBe('build 42');
    expect(buildName({ ...ci, run: null })).toBe('local build');
    expect(buildName({ ...ci, dev: true })).toBe('dev');
  });

  it('links the commit and formats the date', () => {
    expect(commitUrl(ci)).toBe('https://github.com/o/r/commit/7a605ea');
    expect(commitUrl({ ...ci, repoUrl: null })).toBeNull();
    expect(buildDate(ci, 'en-GB')).toMatch(/11 Nov 2026/);
  });
});
