# Batucada Beats

Svelte 5 + Vite app that plays samba percussion from text grids. The README covers what the app does,
how to run it and the code map; this file is for working on the code.

## Commands

- `npm run dev`: dev server on http://localhost:5173 (the `dev` entry in `.claude/launch.json`). Saving into
  `songs/` only works while it runs (the `songs-writer` plugin in `vite.config.ts`).
- `npm test`: Vitest, run after any change to `src/lib/`.
- `npm run check`: type check (use this rather than a bare `npx svelte-check`, which picks the wrong tsconfig).
- Needs Node 22.12 or newer (Vite 8).

## How the code fits together

- The song **text** is the source of truth. UI changes go through `edit()` / `editSection()` in `App.svelte`,
  which change a parsed copy and serialize it back. Keep `parse` and `serialize` in `src/lib/song.ts` round-tripping.
- A linked section (`[name] = path#section`) lives in a `songs/` file. Editing one writes that file, not the song.
- Time signatures: song-level `beats`/`subdiv`, optional per-section override, optional per-line `{subdiv=N}`.
  Use `meterOf`, `trackMeter` and `ticksPerBeat` instead of assuming 4 steps per beat. The player steps through
  the finest grid of a section (LCM of its lines' subdivisions).
- Instruments are only `fundo1`, `fundo2`, `dobra`, `caixa`, `repi` (`src/lib/instruments.ts`, sounds in
  `synth.ts`). The old surdo1/2/3 names are not supported on purpose.

## Conventions

- Every UI string goes through `t()` in `src/lib/i18n.svelte.ts`, with both English and French. A missing French
  key is a type error. Parse messages are translated too.
- When behaviour changes, update `src/components/Help.svelte` in both languages.
- Player timing is tested offline (`render()` in `player.test.ts`); add a test there for scheduling changes.
- Check UI changes in the browser at desktop width (around 1280px). Phone layout is not a priority right now.
- Use Svelte 5 runes (`$state`, `$derived`, `$props`), not stores.

## Git

- Commit only when asked.
- Files under `songs/` that I haven't asked you to change are my own work in progress: never stage or commit them
  unless I say so.
