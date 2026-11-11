<script lang="ts">
  import { onMount } from 'svelte';
  import ArrangementEditor from './components/ArrangementEditor.svelte';
  import Help from './components/Help.svelte';
  import LibraryPanel from './components/LibraryPanel.svelte';
  import SaveDialog from './components/SaveDialog.svelte';
  import SectionGrid from './components/SectionGrid.svelte';
  import Transport from './components/Transport.svelte';
  import { BUILD, buildDate, buildName, commitUrl } from './lib/build';
  import { EMPTY_SONG } from './lib/newSong';
  import { LIBRARY, baseName, libraryEntries, resolveRef, splitRef } from './lib/library.svelte';
  import { CAN_WRITE, writeSong } from './lib/libraryWrite';
  import { LANGS, i18n, setLang, t, type Lang } from './lib/i18n.svelte';
  import { Player, type PlayerState } from './lib/player';
  import { computeProgress } from './lib/progress';
  import {
    REST,
    addTrack,
    deleteSection,
    parse,
    renameSection,
    resizeSection,
    applyTrackOrder,
    changeMeter,
    changeSectionMeter,
    changeTrackSubdiv,
    meterOf,
    moveSection,
    duplicateBar,
    deleteBar,
    moveTrack,
    serialize,
    uniqueName,
    type Meter,
    type Section,
    type Song,
  } from './lib/song';
  import { downloadText, fromLibrary, loadInitial, saveLocal, shareLink, type Origin } from './lib/storage';

  const initial = loadInitial();
  let text = $state(initial.text);
  /** Library file the song was opened from, if any. */
  let origin = $state<Origin | null>(initial.origin);
  const parsed = $derived(parse(text, { resolve: resolveRef, stack: origin ? [origin.path] : [] }));
  const song = $derived(parsed.song);
  const modified = $derived(!!origin && text !== origin.text);
  /** True when replacing the song could lose work. */
  const dirty = $derived(origin ? modified : text !== EMPTY_SONG);
  let showLibrary = $state(false);
  /** Open save dialog: for the whole song, or for one section. */
  let saveReq = $state<{ kind: 'song' } | { kind: 'section'; name: string } | null>(null);
  const folders = $derived([
    ...new Set(['grooves', 'breaks', ...libraryEntries().map((e) => e.group)].filter(Boolean)),
  ]);

  let tab = $state<'grid' | 'text' | 'help'>('grid');
  let muted = $state<string[]>([]);
  let soloed = $state<string[]>([]);
  let click = $state(false);
  let toast = $state('');
  let ps = $state<PlayerState>({
    playing: false,
    mode: 'song',
    once: false,
    onlyBar: null,
    itemIdx: -1,
    pendingIdx: null,
    pendingLoop: null,
    section: null,
    step: -1,
    res: 1,
    pass: 0,
  });

  const progress = $derived(computeProgress(song, ps));

  const player = new Player(parse(EMPTY_SONG).song, (s) => (ps = s)); // real song arrives via the effect below

  $effect(() => player.setSong(song));
  $effect(() => saveLocal({ text, origin }));
  // The song's own file changed on disk (or was edited through a link) and there are no unsaved
  // changes here: follow it.
  $effect(() => {
    if (!origin) return;
    const onDisk = LIBRARY[origin.path];
    if (onDisk != null && onDisk !== origin.text && text === origin.text) {
      text = onDisk;
      origin = { path: origin.path, text: onDisk };
    }
  });
  $effect(() => {
    player.muted = new Set(muted);
    player.soloed = new Set(soloed);
    player.click = click;
  });

  /** Apply a change to a copy of the song and write it back as text. */
  /** Linked library files the user chose to edit in place (this session only). */
  let editingFiles = $state<string[]>([]);
  const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Change one section. A linked section is changed in its library file: the app updates at once,
   * and the file is written shortly after (several quick clicks become one write).
   */
  function editSection(si: number, fn: (sec: Section, s: Song) => void) {
    const ref = song.sections[si]?.link;
    if (!ref) return edit((s) => fn(s.sections[si], s));

    const { path, section } = splitRef(ref);
    const src = LIBRARY[path];
    if (src == null) return say(t('toast.fileNotFound', { path }));
    const lib = parse(src, { resolve: resolveRef, stack: [path] }).song;
    const target = section ? lib.sections.find((x) => x.name === section) : lib.sections[0];
    if (!target) return say(t('toast.sectionNotFound', { path }));
    if (target.link) return say(t('toast.linksFurther', { ref: target.link }));
    fn(target, lib);
    const newText = serialize(lib);
    LIBRARY[path] = newText; // instant: every section linking to it re-renders now

    clearTimeout(writeTimers.get(path));
    writeTimers.set(
      path,
      setTimeout(async () => {
        writeTimers.delete(path);
        const r = await writeSong(path, newText, true);
        if (!r.ok) say(t('toast.cantSave', { path, error: 'error' in r ? r.error : t('toast.fileExists') }));
      }, 400),
    );
  }

  function edit(fn: (s: Song) => void) {
    const s = structuredClone(song);
    fn(s);
    text = serialize(s);
  }

  /** Switch meter, converting the notes; asks first when notes would be lost or links dropped. */
  function setMeter(beats: number, subdiv: number) {
    if (beats === song.beats && subdiv === song.subdiv) return;
    const s = structuredClone(song);
    const lost = changeMeter(s, beats, subdiv);
    if (lost && !confirm(t('confirm.meterLost', { n: lost }) + '\n\n' + t('confirm.meterGo'))) return;
    text = serialize(s);
  }

  /** Give one section its own time signature, or the song's again (null). */
  function setSectionMeter(si: number, to: Meter | null) {
    const target = to ?? { beats: song.beats, subdiv: song.subdiv };
    const s = structuredClone(song);
    const lost = changeSectionMeter(s, s.sections[si], to);
    if (lost && !confirm(t('confirm.meterLost', { n: lost }) + '\n\n' + t('confirm.meterGo'))) return;
    if (song.sections[si].link) editSection(si, (x, lib) => changeSectionMeter(lib, x, target));
    else text = serialize(s);
  }

  /** Give one line its own steps per beat, or the section's again (null). */
  function setLineSubdiv(si: number, ti: number, d: number | null) {
    const s = structuredClone(song);
    const lost = changeTrackSubdiv(s, s.sections[si], ti, d);
    if (lost && !confirm(t('confirm.meterLost', { n: lost }) + '\n\n' + t('confirm.lineGo'))) return;
    if (song.sections[si].link) editSection(si, (x, lib) => changeTrackSubdiv(lib, x, ti, d));
    else text = serialize(s);
  }

  function toggle(list: string[], label: string): string[] {
    return list.includes(label) ? list.filter((l) => l !== label) : [...list, label];
  }

  let toastTimer: ReturnType<typeof setTimeout>;
  function say(msg: string) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 2500);
  }

  function replaceSong(newText: string, newOrigin: Origin | null = null) {
    player.stop();
    text = newText;
    origin = newOrigin;
    muted = [];
    soloed = [];
  }

  function openFromLibrary(path: string) {
    if (path === origin?.path && !modified) return;
    if (dirty && !confirm(t('confirm.open'))) return;
    const l = fromLibrary(path);
    replaceSong(l.text, l.origin);
    tab = 'grid';
  }

  /** Add every section of a library file to the current song as linked sections. */
  function addFromLibrary(path: string) {
    const lib = parse(LIBRARY[path], { resolve: resolveRef, stack: [path] }).song;
    const secs = lib.sections;
    if (!secs.length) return say(t('toast.noSections'));
    edit((s) => {
      for (const sec of secs) {
        const name = uniqueName(
          s.sections.map((x) => x.name),
          secs.length > 1 ? sec.name : baseName(path),
        );
        s.sections.push({
          ...structuredClone(sec),
          ...meterOf(lib, sec), // keeps the file's time signature
          name,
          link: secs.length > 1 ? `${path}#${sec.name}` : path,
        });
      }
    });
    tab = 'grid';
    say(secs.length > 1 ? t('toast.addedN', { n: secs.length }) : t('toast.added', { name: baseName(path) }));
  }

  /** Write into songs/, asking before replacing an existing file. */
  async function writeWithConfirm(path: string, content: string, overwrite = false): Promise<boolean> {
    let r = await writeSong(path, content, overwrite);
    if (!r.ok && r.exists) {
      if (!confirm(t('confirm.replace', { path }))) return false;
      r = await writeSong(path, content, true);
    }
    if (!r.ok) {
      alert(t('alert.cantSave', { error: 'error' in r ? r.error : t('alert.unknown') }));
      return false;
    }
    return true;
  }

  /** A section on its own, as a library file that loops it when opened. */
  function sectionFileText(sec: Section, path: string): string {
    const pretty = baseName(path).replace(/[-_]+/g, ' ');
    return serialize({
      title: pretty.charAt(0).toUpperCase() + pretty.slice(1),
      tempo: song.tempo,
      swing: song.swing,
      ...meterOf(song, sec),
      sections: [{ name: sec.name, bars: sec.bars, tracks: structuredClone(sec.tracks) }],
      arrangement: [{ section: sec.name, repeat: Infinity }],
    });
  }

  async function saveSection(name: string, path: string) {
    const sec = song.sections.find((s) => s.name === name);
    if (!sec) return;
    const content = sectionFileText(sec, path);
    if (!CAN_WRITE) {
      downloadText(baseName(path) + '.txt', content);
      return say(t('toast.downloaded', { folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) + '/' : '' }));
    }
    if (!(await writeWithConfirm(path, content))) return;
    // The section now follows the new file.
    edit((s) => {
      const x = s.sections.find((x) => x.name === name);
      if (x) x.link = path;
    });
    say(t('toast.saved', { path }));
  }

  /** Save the song back to its library file, or to `path` (Save as). */
  async function saveSong(path?: string) {
    const target = path ?? origin?.path;
    if (!target) return void (saveReq = { kind: 'song' });
    if (!CAN_WRITE) return downloadText(baseName(target) + '.txt', text);
    if (!(await writeWithConfirm(target, text, !path))) return;
    origin = { path: target, text };
    saveLocal({ text, origin });
    say(t('toast.saved', { path: target }));
  }

  async function share() {
    // Links are self-contained: linked sections are written out in full.
    const url = shareLink(song.sections.some((x) => x.link) ? serialize(song, { inline: true }) : text);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: song.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      say(t('toast.linkCopied'));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') prompt(t('toast.copyLink'), url);
    }
  }

  let fileInput: HTMLInputElement;
  async function importFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    replaceSong(await f.text(), null);
    (e.currentTarget as HTMLInputElement).value = '';
    say(t('toast.loaded', { name: f.name }));
  }

  function filename() {
    if (origin) return baseName(origin.path) + '.txt';
    return (song.title.replace(/[^\w\- ]+/g, '').trim() || 'song') + '.txt';
  }

  function togglePlay() {
    if (ps.playing) player.stop();
    else player.playSong();
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      player.stop();
    };
  });
</script>

<div class="app">
  <header class="top">
    <div class="title-box">
      <input
        class="title"
        value={song.title}
        aria-label={t('app.songTitle')}
        onchange={(e) => edit((s) => (s.title = e.currentTarget.value.replace(/\n/g, ' ').trim() || t('app.untitled')))}
      />
      {#if origin}
        <span
          class="origin"
          class:modified
          title={modified
            ? t(CAN_WRITE ? 'app.modifiedTip' : 'app.modifiedTipExport', { path: origin.path })
            : t('app.savedAs', { path: origin.path })}
        >
          {modified ? t('app.modified') : `songs/${origin.path}.txt`}
        </span>
      {/if}
    </div>
    <nav class="tabs" aria-label={t('app.view')}>
      <button class:sel={tab === 'grid'} onclick={() => (tab = 'grid')}>{t('tab.grid')}</button>
      <button class:sel={tab === 'text'} onclick={() => (tab = 'text')}>
        {t('tab.text')}{#if parsed.issues.length}<span class="badge">{parsed.issues.length}</span>{/if}
      </button>
      <button class:sel={tab === 'help'} onclick={() => (tab = 'help')}>{t('tab.help')}</button>
    </nav>
    <div class="actions">
      <button onclick={() => (showLibrary = true)}>{t('app.library')}</button>
      {#if CAN_WRITE}
        <button
          onclick={() => saveSong()}
          disabled={!dirty}
          title={!dirty
            ? t('app.nothingToSave')
            : origin
              ? t('app.saveTo', { path: origin.path })
              : t('app.saveInto')}>{t('app.save')}</button
        >
        {#if origin}
          <button onclick={() => (saveReq = { kind: 'song' })} title={t('app.saveAsTip')}>{t('app.saveAs')}</button>
        {/if}
      {/if}
      <button onclick={share}>{t('app.share')}</button>
      <button onclick={() => downloadText(filename(), text)}>{t('app.export')}</button>
      <button onclick={() => fileInput.click()}>{t('app.import')}</button>
      <button
        onclick={() =>
          (!dirty ||
            confirm(t('confirm.new'))) &&
          replaceSong(EMPTY_SONG)}>{t('app.new')}</button
      >
      <select
        class="lang"
        value={i18n.lang}
        onchange={(e) => setLang(e.currentTarget.value as Lang)}
        aria-label={t('app.language')}
        title={t('app.language')}
      >
        {#each LANGS as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
      </select>
      <input bind:this={fileInput} type="file" accept=".txt,text/plain" hidden onchange={importFile} />
    </div>
  </header>

  <main>
    {#if tab === 'grid'}
      {#if parsed.issues.length}
        <p class="warn">
          {t('grid.problems', { n: parsed.issues.length })}
          <button class="ghost link" onclick={() => (tab = 'text')}>{t('grid.seeThem')}</button>
        </p>
      {/if}

      {#each song.sections as sec, si (sec.name)}
        <SectionGrid
          {song}
          section={sec}
          nowTick={ps.playing && ps.section === sec.name ? ps.step : -1}
          nowRes={ps.res}
          progress={progress?.section === sec.name ? progress : null}
          partCount={song.arrangement.length}
          playingAlone={ps.playing && ps.mode === 'loop' && ps.section === sec.name}
          once={ps.once}
          playingBar={ps.onlyBar}
          pendingLoop={ps.pendingLoop === sec.name}
          {muted}
          {soloed}
          linkEditing={!!sec.link && editingFiles.includes(splitRef(sec.link).path)}
          canEditLinks={CAN_WRITE}
          onEditLink={() => {
            if (sec.link) editingFiles = [...editingFiles, splitRef(sec.link).path];
          }}
          onDoneEditingLink={() => {
            if (sec.link) editingFiles = editingFiles.filter((f) => f !== splitRef(sec.link!).path);
          }}
          onCell={(ti, step, next) => {
            editSection(si, (x) => (x.tracks[ti].steps[step] = next));
            if (next !== REST) player.preview(sec.tracks[ti].instrument, next);
          }}
          onRename={(name) =>
            edit((s) => {
              if (!renameSection(s, sec.name, name)) say(t('toast.nameTaken'));
            })}
          onBars={(bars) => editSection(si, (x, s) => resizeSection(s, x, bars))}
          onAddTrack={(inst) => editSection(si, (x, s) => addTrack(s, x, inst))}
          onRemoveTrack={(ti) => editSection(si, (x) => x.tracks.splice(ti, 1))}
          onDuplicate={() =>
            edit((s) => {
              const copy = structuredClone(s.sections[si]);
              copy.name = uniqueName(
                s.sections.map((x) => x.name),
                sec.name,
              );
              s.sections.splice(si + 1, 0, copy);
            })}
          onDelete={() => edit((s) => deleteSection(s, sec.name))}
          onDuplicateBar={(b) => {
            if (sec.bars >= 64) return say(t('toast.maxBars'));
            editSection(si, (x, s) => duplicateBar(s, x, b));
          }}
          onDeleteBar={(b) => editSection(si, (x, s) => deleteBar(s, x, b))}
          index={si}
          count={song.sections.length}
          onMove={(d) => edit((s) => moveSection(s, si, si + d))}
          onPlay={(loop) => player.playSection(sec.name, loop)}
          onStop={() => player.stop()}
          onPlayBar={(b, loop) => player.playSection(sec.name, loop, b)}
          onLoopChange={(loop) => player.setSectionLoop(loop)}
          onSaveToLibrary={() => (saveReq = { kind: 'section', name: sec.name })}
          onMeter={(m) => setSectionMeter(si, m)}
          onLineSubdiv={(ti, d) => setLineSubdiv(si, ti, d)}
          onMoveTrack={(from, to) => editSection(si, (x) => moveTrack(x, from, to))}
          onApplyOrder={song.sections.some((x, xi) => xi !== si && !x.link && x.tracks.length > 1)
            ? () => {
                edit((s) => applyTrackOrder(s, s.sections[si]));
                say(t('toast.orderApplied'));
              }
            : undefined}
          onUnlink={() =>
            edit((s) => {
              delete s.sections[si].link;
            })}
          onToggleMute={(l) => (muted = toggle(muted, l))}
          onToggleSolo={(l) => (soloed = toggle(soloed, l))}
        />
      {/each}

      <div class="add-row">
      <button
        onclick={() =>
          edit((s) => {
            const name = uniqueName(
              s.sections.map((x) => x.name),
              t('grid.newSectionName'),
            );
            const tracks = (s.sections.at(-1)?.tracks ?? []).map((t) => ({
              label: t.label,
              instrument: t.instrument,
              steps: Array(s.beats * s.subdiv).fill(REST),
            }));
            s.sections.push({ name, bars: 1, tracks });
          })}>{t('grid.addSection')}</button
      >
      <button onclick={() => (showLibrary = true)}>{t('grid.fromLibrary')}</button>
      </div>

      <ArrangementEditor
        {song}
        currentIdx={progress?.itemIdx ?? -1}
        pendingIdx={ps.pendingIdx}
        onChange={(items) => edit((s) => (s.arrangement = items))} />
    {:else if tab === 'text'}
      <div class="text-view">
        <textarea bind:value={text} spellcheck="false" autocapitalize="off" autocomplete="off" aria-label={t('text.label')}
        ></textarea>
        {#if parsed.issues.length}
          <ul class="issues">
            {#each parsed.issues as is, i (i)}
              <li><b>{t('text.line', { n: is.line })}</b> {is.message}</li>
            {/each}
          </ul>
        {:else}
          <p class="ok">{t('text.ok')}</p>
        {/if}
      </div>
    {:else}
      <Help />
    {/if}
    <footer class="version" title={t('app.versionTip')}>
      {buildName()}
      {#if BUILD.sha}
        ·
        {#if commitUrl()}
          <a href={commitUrl()} target="_blank" rel="noopener" title={t('app.commitTip')}>{BUILD.sha}</a>
        {:else}
          {BUILD.sha}
        {/if}
      {/if}
      {#if !BUILD.dev}· {buildDate()}{/if}
    </footer>
  </main>

  <Transport
    {song}
    {ps}
    {progress}
    {click}
    onPlay={() => player.playSong()}
    onStop={() => player.stop()}
    onNext={() => player.next()}
    onItem={(i) => player.queueItem(i)}
    onLoop={(name) => player.queueLoop(name)}
    onTempo={(bpm) => edit((s) => (s.tempo = Math.max(30, Math.min(300, Math.round(bpm) || s.tempo))))}
    onSwing={(v) => edit((s) => (s.swing = v))}
    onMeter={setMeter}
    onClick={(on) => (click = on)}
  />

  {#if showLibrary}
    <LibraryPanel
      entries={libraryEntries()}
      currentPath={origin?.path ?? null}
      onOpen={openFromLibrary}
      onAdd={addFromLibrary}
      onClose={() => (showLibrary = false)}
    />
  {/if}

  {#if saveReq?.kind === 'song'}
    <SaveDialog
      heading={origin ? t('save.songAs') : t('save.songTo')}
      {folders}
      defaultFolder={origin?.path.includes('/') ? origin.path.slice(0, origin.path.lastIndexOf('/')) : ''}
      defaultName={origin ? baseName(origin.path) + t('save.copySuffix') : song.title}
      note={CAN_WRITE ? undefined : t('save.noteDownloadSong')}
      onSave={(path) => saveSong(path)}
      onClose={() => (saveReq = null)}
    />
  {:else if saveReq?.kind === 'section'}
    {@const name = saveReq.name}
    <SaveDialog
      heading={t('save.sectionTo', { name })}
      {folders}
      defaultFolder={/break|bossa|parad|call|chamada|virada|intro|fim|end/i.test(name) ? 'breaks' : 'grooves'}
      defaultName={/^(groove|section|main|break|call)\d*$/i.test(name) ? `${song.title} ${name}` : name}
      note={CAN_WRITE
        ? t('save.noteSection')
        : t('save.noteDownloadSection')}
      onSave={(path) => saveSection(name, path)}
      onClose={() => (saveReq = null)}
    />
  {/if}

  {#if toast}<div class="toast" role="status">{toast}</div>{/if}
</div>

<style>
  .app {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  .title-box {
    flex: 1 1 10em;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    font-size: 1.2rem;
    font-weight: 700;
    border-color: transparent;
    background: transparent;
    min-width: 0;
  }
  .origin {
    font-size: 0.75rem;
    color: var(--muted);
    font-family: var(--mono);
    padding-left: 9px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .origin.modified {
    color: var(--accent);
    font-family: inherit;
    font-weight: 600;
    cursor: help;
  }
  .title:hover,
  .title:focus {
    border-color: var(--line);
  }
  .tabs {
    display: flex;
    background: var(--panel-2);
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }
  .tabs button {
    border: none;
    background: transparent;
    padding: 5px 14px;
  }
  .tabs button.sel {
    background: var(--panel);
    font-weight: 600;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  }
  .badge {
    display: inline-block;
    margin-left: 5px;
    background: var(--accent);
    color: var(--accent-text);
    border-radius: 999px;
    font-size: 0.7rem;
    padding: 0 6px;
    font-weight: 700;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .lang {
    padding: 5px 6px;
    font-size: 0.9rem;
  }
  .actions button {
    padding: 5px 10px;
    font-size: 0.9rem;
  }
  .version {
    margin-top: 24px;
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .version a {
    color: inherit;
  }
  main {
    flex: 1;
    padding: 14px 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .warn {
    margin: 0;
    background: var(--warn-bg);
    color: var(--warn-text);
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.9rem;
  }
  .link {
    padding: 0;
    text-decoration: underline;
    color: inherit;
  }
  .add-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .text-view {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }
  textarea {
    flex: 1;
    min-height: 60vh;
    font-family: var(--mono);
    font-size: 0.9rem;
    line-height: 1.5;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    resize: vertical;
    white-space: pre;
    overflow-wrap: normal;
    overflow-x: auto;
    tab-size: 4;
  }
  .issues {
    margin: 0;
    padding: 8px 12px 8px 28px;
    background: var(--warn-bg);
    color: var(--warn-text);
    border-radius: 8px;
    font-size: 0.9rem;
  }
  .ok {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 140px;
    transform: translateX(-50%);
    background: var(--text);
    color: var(--bg);
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 0.9rem;
    z-index: 10;
  }
  @media (max-width: 600px) {
    .top {
      padding: 8px 16px;
    }
    .actions {
      width: 100%;
    }
    textarea {
      font-size: 0.8rem;
    }
  }
</style>
