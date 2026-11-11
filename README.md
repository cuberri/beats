# Batucada Beats

Write samba percussion grooves as text grids (one line per instrument) and hear them.
Sounds are synthesized in the browser; no samples, no backend.

```
[groove] bars=1
fundo1:   m... X... m... X...
caixa:    X.xx x.xx X.xx x.xg
repi:     x.xX .xx. x.xX .xx.

arrangement: call, groove*loop, break1, groove*4
```

The full format reference is in the app's **Help** tab.

## Run the app

Works the same on macOS and Windows (use Terminal on a Mac, PowerShell or Command Prompt on Windows).

1. Install [Node.js](https://nodejs.org/) 22.12 or newer; the LTS download is fine (`node --version` to check).
2. Get the project and install its dependencies (once, and again after pulling changes):

   ```bash
   git clone <repository-url> beats
   cd beats
   npm install
   ```

3. Start the server:

   ```bash
   npm run dev
   ```

4. Open <http://localhost:5173> in a browser. Leave the terminal open while you use the app; press `Ctrl+C` in it
   to stop the server.

While this server runs, the app can save straight into the `songs/` and `patterns/` folders (💾 Save, Save as
pattern), and files you add or change there show up in the app right away.

**From a phone or another computer on the same Wi-Fi:** start the server with `npm run dev -- --host`. It prints a
`Network:` address (like `http://192.168.1.20:5173`) to open on the other device.

**To get the latest version:** stop the server, then `git pull`, `npm install`, and `npm run dev` again.

**Port already in use?** Another copy is probably running. Stop it, or pick another port:
`npm run dev -- --port 5174`.

## Develop

```bash
npm run dev      # dev server on http://localhost:5173
npm test         # tests
npm run check    # type check
npm run build    # static site in dist/
npm run preview  # serve dist/ on http://localhost:4173 to try the built site
```

The built site (`npm run preview` or a deployed copy) cannot write into `songs/` or `patterns/`: its save buttons
download the file instead.

## Deploy

Pushing to `main` builds and publishes the site on GitHub Pages (`.github/workflows/deploy.yml`, which also runs
the tests first). One-time setup on GitHub: **Settings → Pages → Source: GitHub Actions**, then add the custom domain
on the same page. Only files committed to `songs/` and `patterns/` end up in the published library.

`dist/` is a static site with relative paths, so it can also go on Netlify or Cloudflare Pages.
It is an installable PWA (works offline after first visit).

## Code map

- `src/lib/instruments.ts`: instruments, strokes, name aliases. Add a stroke here first.
- `src/lib/song.ts`: text format parser/serializer and editing helpers.
- `src/lib/i18n.svelte.ts`: English/French interface texts and `t()`. Add a key to both dictionaries (TypeScript
  flags a missing French one). The song file format stays in English.
- `src/lib/synth.ts`: synthesized sounds (Web Audio).
- `src/lib/player.ts`: lookahead scheduler, arrangement/loop playback, bar-quantized jumps.
- `src/lib/library.svelte.ts`: bundles every `songs/**/*.txt` and `patterns/**/*.txt` (live-updated in dev).
- `src/lib/libraryWrite.ts` + the `songs-writer` plugin in `vite.config.ts`: saving into `songs/` and `patterns/`
  (dev server only; the deployed site downloads files instead).
- `src/components/`: grid, transport, arrangement editor, library, save dialog, help.

## Song library

- `songs/`: whole songs. Subfolders (e.g. `drafts/`, `currently-played/`) only organise them in the Library.
- `patterns/`: reusable grooves and breaks. The app's **Import…** copies their sections (or only some instruments)
  into a song, and **⤓ Import lines…** on a section puts a pattern's lines into that section. Either way the copy
  is independent of the file. **💾 Save as pattern** saves a section into `patterns/`, and the 💾 on a line saves
  that line alone.

See [songs/README.md](songs/README.md) and [patterns/README.md](patterns/README.md).
