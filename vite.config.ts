import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
/** Folders the app may write into. */
const LIBRARY_DIRS = ['songs', 'patterns'];

/**
 * Dev-only endpoint so the app can save into songs/ or patterns/ while running locally (`npm run dev`).
 * POST /__songs/save  { path: "patterns/virgule", text: "...", overwrite?: boolean }
 * The deployed site is static and has no such endpoint; the app falls back to downloading.
 */
function songsWriter(): Plugin {
  return {
    name: 'songs-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__songs/save', async (req, res) => {
        const reply = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        // The custom header forces a CORS preflight, so other websites can't post here.
        if (req.method !== 'POST' || req.headers['x-beats'] !== '1') return reply(405, { error: 'Not allowed' });
        try {
          let raw = '';
          for await (const chunk of req) raw += chunk;
          const { path, text, overwrite } = JSON.parse(raw) as { path: string; text: string; overwrite?: boolean };
          if (typeof path !== 'string' || typeof text !== 'string' || !/^[\w-]+(\/[\w-]+)+$/.test(path))
            return reply(400, { error: 'Bad file name: use letters, numbers, - and _' });
          const top = path.slice(0, path.indexOf('/'));
          if (!LIBRARY_DIRS.includes(top)) return reply(400, { error: 'Only songs/ and patterns/ can be written' });
          const dir = resolve(ROOT, top);
          const file = resolve(dir, path.slice(top.length + 1) + '.txt');
          if (!file.startsWith(dir + sep)) return reply(400, { error: 'Bad path' });
          if (existsSync(file) && !overwrite) return reply(409, { error: 'exists' });
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, text, 'utf8');
          reply(200, { ok: true, path });
        } catch (e) {
          reply(500, { error: String(e) });
        }
      });
    },
  };
}

/** Output of a git command, or '' when git or the repository is missing. */
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

/**
 * What this build is, shown at the bottom of the page. On GitHub Actions the run number and commit
 * come from the environment; locally they come from git.
 */
function buildInfo(command: 'build' | 'serve') {
  const env = process.env;
  const remote = git('remote get-url origin');
  // "git@host:owner/repo.git" or "https://github.com/owner/repo.git" → "owner/repo"
  const repo = env.GITHUB_REPOSITORY ?? remote.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)?.[1] ?? null;
  return {
    dev: command === 'serve',
    run: env.GITHUB_RUN_NUMBER ?? null,
    sha: (env.GITHUB_SHA ?? git('rev-parse HEAD')).slice(0, 7) || null,
    date: new Date().toISOString(),
    repoUrl: repo ? `https://github.com/${repo}` : null,
  };
}

export default defineConfig(({ command }) => ({
  define: { __BUILD__: JSON.stringify(buildInfo(command)) },
  // Relative paths so the build works from any folder (e.g. GitHub Pages /repo-name/).
  base: './',
  plugins: [svelte(), songsWriter()],
}));
