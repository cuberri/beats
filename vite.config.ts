import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const SONGS_DIR = fileURLToPath(new URL('./songs', import.meta.url));

/**
 * Dev-only endpoint so the app can save into songs/ while running locally (`npm run dev`).
 * POST /__songs/save  { path: "grooves/samba-reggae", text: "...", overwrite?: boolean }
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
          if (typeof path !== 'string' || typeof text !== 'string' || !/^[\w-]+(\/[\w-]+)*$/.test(path))
            return reply(400, { error: 'Bad file name: use letters, numbers, - and _' });
          const file = resolve(SONGS_DIR, path + '.txt');
          if (!file.startsWith(SONGS_DIR + sep)) return reply(400, { error: 'Bad path' });
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

export default defineConfig({
  // Relative paths so the build works from any folder (e.g. GitHub Pages /repo-name/).
  base: './',
  plugins: [svelte(), songsWriter()],
});
