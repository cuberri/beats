<script lang="ts">
  import { onMount } from 'svelte';
  import ArrangementEditor from './components/ArrangementEditor.svelte';
  import Help from './components/Help.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import LibraryPanel from './components/LibraryPanel.svelte';
  import SaveDialog from './components/SaveDialog.svelte';
  import SectionGrid from './components/SectionGrid.svelte';
  import Transport from './components/Transport.svelte';
  import { BUILD, buildDate, buildName, commitUrl } from './lib/build';
  import { EMPTY_SONG } from './lib/newSong';
  import { LIBRARY, baseName, folderOf, libraryEntries, type LibKind } from './lib/library.svelte';
  import { CAN_WRITE, writeSong } from './lib/libraryWrite';
  import type { InstrumentId } from './lib/instruments';
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
    importIntoSection,
    importSections,
    meterOf,
    moveSection,
    duplicateBar,
    deleteBar,
    moveTrack,
    serialize,
    uniqueName,
    type Meter,
    type Section,
    songChanges,
    type Song,
  } from './lib/song';
  import { History } from './lib/history';
  import { downloadText, fromLibrary, loadInitial, saveLocal, shareLink, type Origin } from './lib/storage';

  const initial = loadInitial();
  let text = $state(initial.text);
  /** Library file the song was opened from, if any. */
  let origin = $state<Origin | null>(initial.origin);
  const parsed = $derived(parse(text));
  const song = $derived(parsed.song);
  const modified = $derived(!!origin && text !== origin.text);
  /** True when replacing the song could lose work. */
  const dirty = $derived(origin ? modified : text !== EMPTY_SONG);
  /** What differs from the saved file, as lines to show. */
  const changeList = $derived.by(() => {
    if (!modified || !origin) return [];
    const c = songChanges(parse(origin.text).song, song);
    const out: string[] = [];
    if (c.settings.length)
      out.push(t('chg.settings', { list: c.settings.map((k) => t(`chg.s.${k}`)).join(', ') }));
    if (c.changed.length) out.push(t('chg.changed', { list: c.changed.join(', ') }));
    if (c.added.length) out.push(t('chg.added', { list: c.added.join(', ') }));
    if (c.removed.length) out.push(t('chg.removed', { list: c.removed.join(', ') }));
    if (c.reordered) out.push(t('chg.reordered'));
    if (c.arrangement) out.push(t('chg.arrangement'));
    if (!out.length) out.push(t('chg.other'));
    return out;
  });

  // Undo/redo: every change of the text is a step, except typing in the Text tab, where quick
  // keystrokes make one step together.
  const history = new History(initial.text);
  let canUndo = $state(false);
  let canRedo = $state(false);
  $effect(() => {
    history.record(text, document.activeElement?.tagName === 'TEXTAREA');
    canUndo = history.canUndo;
    canRedo = history.canRedo;
  });
  function undo() {
    const prev = history.undo();
    if (prev !== null) text = prev;
  }
  function redo() {
    const next = history.redo();
    if (next !== null) text = next;
  }
  let changesPop = $state<HTMLElement>();
  function revert() {
    if (!origin) return;
    text = origin.text;
    changesPop?.hidePopover();
    say(t('toast.reverted'));
  }
  /** Library panel, open on its Songs or Patterns tab. */
  let showLibrary = $state<LibKind | null>(null);
  /** Library file whose sections are being picked for import. */
  let importPath = $state<string | null>(null);
  /** Section receiving imported lines (instead of new sections being added), by name. */
  let importTarget = $state<string | null>(null);
  /** Open save dialog: for the whole song, or for one section (as a pattern). */
  let saveReq = $state<
    { kind: 'song' } | { kind: 'section'; name: string; line?: string } | null
  >(null);
  /** Subfolders of songs/, offered when saving a song. */
  const songFolders = $derived([...new Set(libraryEntries('songs').map((e) => e.group).filter(Boolean))]);

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
  // The song's own file changed on disk and there are no unsaved
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

  /** Change one section. */
  function editSection(si: number, fn: (sec: Section, s: Song) => void) {
    edit((s) => fn(s.sections[si], s));
  }

  /** Apply a change to a copy of the song and write it back as text. */
  function edit(fn: (s: Song) => void) {
    const s = structuredClone(song);
    fn(s);
    text = serialize(s);
  }

  /** Switch meter, converting the notes; asks first when notes would be lost. */
  function setMeter(beats: number, subdiv: number) {
    if (beats === song.beats && subdiv === song.subdiv) return;
    const s = structuredClone(song);
    const lost = changeMeter(s, beats, subdiv);
    if (lost && !confirm(t('confirm.meterLost', { n: lost }) + '\n\n' + t('confirm.meterGo'))) return;
    text = serialize(s);
  }

  /** Give one section its own time signature, or the song's again (null). */
  function setSectionMeter(si: number, to: Meter | null) {
    const s = structuredClone(song);
    const lost = changeSectionMeter(s, s.sections[si], to);
    if (lost && !confirm(t('confirm.meterLost', { n: lost }) + '\n\n' + t('confirm.meterGo'))) return;
    text = serialize(s);
  }

  /** Give one line its own steps per beat, or the section's again (null). */
  function setLineSubdiv(si: number, ti: number, d: number | null) {
    const s = structuredClone(song);
    const lost = changeTrackSubdiv(s, s.sections[si], ti, d);
    if (lost && !confirm(t('confirm.meterLost', { n: lost }) + '\n\n' + t('confirm.lineGo'))) return;
    text = serialize(s);
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
    history.reset(newText);
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

  /** Copy sections of a library file (a pattern or another song) into the current song. */
  function importFromLibrary(path: string, names: string[], instruments: InstrumentId[]) {
    const source = parse(LIBRARY[path] ?? '').song;
    let n = 0;
    edit((s) => (n = importSections(s, source, names, instruments, baseName(path))));
    if (!n) return;
    tab = 'grid';
    say(n > 1 ? t('toast.importedN', { n }) : t('toast.imported', { name: song.sections.at(-1)!.name }));
  }

  /** Plays library files while they are being picked for import; made on first use. */
  let previewPlayer: Player | null = null;
  let previewing: string | null = null;
  function previewFromLibrary(path: string, section: string | null, instruments: InstrumentId[]) {
    if (!section) {
      previewPlayer?.stop();
      previewing = null;
      return;
    }
    const source = parse(LIBRARY[path] ?? '').song;
    // At this song's tempo and swing, so it sounds as it would once imported.
    source.tempo = song.tempo;
    source.swing = song.swing;
    for (const s of source.sections) s.tracks = s.tracks.filter((tr) => instruments.includes(tr.instrument));
    previewPlayer ??= new Player(source, () => {});
    previewPlayer.setSong(source);
    // Only the instruments changed: keep playing from where it is.
    if (previewing === section) return;
    player.stop();
    previewing = section;
    previewPlayer.playSection(section, true);
  }

  /** Replace or add lines of section `target` with those of section `from` of a library file. */
  function importLinesFromLibrary(path: string, target: string, from: string, instruments: InstrumentId[]) {
    const source = parse(LIBRARY[path] ?? '').song;
    const src = source.sections.find((x) => x.name === from);
    const si = song.sections.findIndex((x) => x.name === target);
    if (!src || si < 0) return;
    let r = { replaced: [] as string[], added: [] as string[] };
    editSection(si, (x, s) => (r = importIntoSection(s, x, source, src, instruments)));
    const labels = [...r.replaced, ...r.added];
    if (labels.length) say(t('toast.linesImported', { labels: labels.join(', '), name: target }));
  }

  /** Write into songs/ or patterns/, asking before replacing an existing file. */
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
  function sectionFileText(sec: Section, path: string, line?: string): string {
    const pretty = baseName(path).replace(/[-_]+/g, ' ');
    return serialize({
      title: pretty.charAt(0).toUpperCase() + pretty.slice(1),
      tempo: song.tempo,
      swing: song.swing,
      ...meterOf(song, sec),
      sections: [
        {
          name: sec.name,
          bars: sec.bars,
          tracks: structuredClone(line ? sec.tracks.filter((tr) => tr.label === line) : sec.tracks),
        },
      ],
      arrangement: [{ section: sec.name, repeat: Infinity }],
    });
  }

  /** Save a section, or only its line `line`, as a pattern. */
  async function saveSection(name: string, path: string, line?: string) {
    const sec = song.sections.find((s) => s.name === name);
    if (!sec) return;
    const content = sectionFileText(sec, path, line);
    if (!CAN_WRITE) {
      downloadText(baseName(path) + '.txt', content);
      return say(t('toast.downloaded', { folder: folderOf(path) + '/' }));
    }
    if (!(await writeWithConfirm(path, content))) return;
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
    const url = shareLink(text);
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
      const t = e.target;
      // Text fields keep their own undo.
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (k === 'z' || k === 'y')) {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.code !== 'Space') return;
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
        {#if modified}
          <button
            class="origin modified"
            popovertarget="changes"
            title={t(CAN_WRITE ? 'app.modifiedTip' : 'app.modifiedTipExport', { path: origin.path })}
            >{t('app.modified')}</button
          >
          <div id="changes" class="changes" popover bind:this={changesPop}>
            <p class="head">{t('chg.title', { path: origin.path })}</p>
            <ul>
              {#each changeList as line, i (i)}<li>{line}</li>{/each}
            </ul>
            <div class="row">
              <button onclick={revert} title={t('chg.revertTip')}>{t('chg.revert')}</button>
            </div>
          </div>
        {:else}
          <span class="origin" title={t('app.savedAs', { path: origin.path })}>{origin.path}.txt</span>
        {/if}
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
      <span class="undo">
        <button onclick={undo} disabled={!canUndo} title={t('app.undoTip')} aria-label={t('app.undo')}>↶</button>
        <button onclick={redo} disabled={!canRedo} title={t('app.redoTip')} aria-label={t('app.redo')}>↷</button>
      </span>
      <button onclick={() => (showLibrary = 'songs')}>{t('app.library')}</button>
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
          onSaveLine={(ti) => (saveReq = { kind: 'section', name: sec.name, line: sec.tracks[ti].label })}
          onImportLines={() => {
            importTarget = sec.name;
            showLibrary = 'patterns';
          }}
          onMeter={(m) => setSectionMeter(si, m)}
          onLineSubdiv={(ti, d) => setLineSubdiv(si, ti, d)}
          onMoveTrack={(from, to) => editSection(si, (x) => moveTrack(x, from, to))}
          onApplyOrder={song.sections.some((x, xi) => xi !== si && x.tracks.length > 1)
            ? () => {
                edit((s) => applyTrackOrder(s, s.sections[si]));
                say(t('toast.orderApplied'));
              }
            : undefined}
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
      <button onclick={() => (showLibrary = 'patterns')}>{t('grid.importPattern')}</button>
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
      initialKind={showLibrary}
      entries={libraryEntries()}
      currentPath={origin?.path ?? null}
      onOpen={openFromLibrary}
      onImport={(path) => (importPath = path)}
      onClose={() => {
        showLibrary = null;
        if (!importPath) importTarget = null;
      }}
      targetName={importTarget ?? undefined}
    />
  {/if}

  {#if importPath}
    <ImportDialog
      path={importPath}
      source={parse(LIBRARY[importPath] ?? '').song}
      target={song.sections.find((x) => x.name === importTarget)}
      onImport={(names, instruments) => {
        if (!importPath) return;
        if (importTarget) importLinesFromLibrary(importPath, importTarget, names[0], instruments);
        else importFromLibrary(importPath, names, instruments);
      }}
      onPreview={(sec, instruments) => importPath && previewFromLibrary(importPath, sec, instruments)}
      onClose={() => {
        previewFromLibrary('', null, []);
        importPath = null;
        importTarget = null;
      }}
    />
  {/if}

  {#if saveReq?.kind === 'song'}
    <SaveDialog
      heading={origin ? t('save.songAs') : t('save.songTo')}
      root="songs"
      folders={songFolders}
      defaultFolder={origin?.path.startsWith('songs/') ? folderOf(origin.path).replace(/^songs\/?/, '') : ''}
      defaultName={origin ? baseName(origin.path) + t('save.copySuffix') : song.title}
      note={CAN_WRITE ? undefined : t('save.noteDownloadSong')}
      onSave={(path) => saveSong(path)}
      onClose={() => (saveReq = null)}
    />
  {:else if saveReq?.kind === 'section'}
    {@const name = saveReq.name}
    {@const line = saveReq.line}
    {@const base = /^(groove|section|main|break|call)\d*$/i.test(name) ? `${song.title} ${name}` : name}
    <SaveDialog
      heading={line ? t('save.lineTo', { label: line, name }) : t('save.sectionTo', { name })}
      root="patterns"
      folders={null}
      defaultFolder=""
      defaultName={line ? `${line} ${base}` : base}
      note={CAN_WRITE ? t(line ? 'save.noteLine' : 'save.noteSection') : t('save.noteDownloadSection')}
      onSave={(path) => saveSection(name, path, line)}
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
    border: 0;
    background: transparent;
    padding: 0 0 0 9px;
    cursor: pointer;
    text-align: left;
  }
  .origin.modified:hover {
    text-decoration: underline;
  }
  .changes {
    position: fixed;
    inset: 52px auto auto 16px;
    margin: 0;
    max-width: min(420px, calc(100vw - 32px));
    padding: 10px 14px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    color: var(--text);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
    font-size: 0.9rem;
  }
  .changes .head {
    margin: 0 0 6px;
    font-weight: 600;
  }
  .changes ul {
    margin: 0 0 10px;
    padding-left: 18px;
  }
  .changes .row {
    display: flex;
    justify-content: flex-end;
  }
  .undo {
    display: inline-flex;
    gap: 2px;
  }
  .undo button {
    padding-inline: 9px;
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
