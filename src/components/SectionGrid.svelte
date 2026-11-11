<script lang="ts">
  import { tick } from 'svelte';
  import { INSTRUMENTS, INSTRUMENT_BY_ID, findStroke, type InstrumentId } from '../lib/instruments';
  import { passLabel, type Progress } from '../lib/progress';
  import { strokeLabel, t } from '../lib/i18n.svelte';
  import { METERS, REST, barHasNotes, meterOf, ticksPerBeat, trackMeter, type Meter, type Section, type Song } from '../lib/song';

  interface Props {
    song: Song;
    section: Section;
    /** Position playing in this section, in ticks (`nowRes` per beat), or -1. */
    nowTick: number;
    nowRes: number;
    /** Set while this section is the one playing. */
    progress: Progress | null;
    /** Number of parts in the arrangement. */
    partCount: number;
    /** This section is playing on its own (not as part of the arrangement). */
    playingAlone: boolean;
    /** While playing on its own: it stops after this pass. */
    once: boolean;
    /** While playing on its own: the only bar being played (0-based), or null. */
    playingBar: number | null;
    /** The transport's Loop row queued this section for the next bar line. */
    pendingLoop: boolean;
    muted: string[];
    soloed: string[];
    onCell: (track: number, step: number, next: string) => void;
    onRename: (name: string) => void;
    onBars: (bars: number) => void;
    onAddTrack: (inst: InstrumentId) => void;
    onRemoveTrack: (track: number) => void;
    onDuplicate: () => void;
    /** Insert a copy of bar `bar` (0-based) right after it. */
    onDuplicateBar: (bar: number) => void;
    onDeleteBar: (bar: number) => void;
    /** Move this section by `d` places (-1 up, +1 down) in the page and text. */
    onMove: (d: -1 | 1) => void;
    /** Position in the song's section list, and how many there are. */
    index: number;
    count: number;
    onDelete: () => void;
    /** Play this section on its own right away, once or looping. */
    onPlay: (loop: boolean) => void;
    onStop: () => void;
    /** Play only bar `bar` (0-based) of this section, once or looping. */
    onPlayBar: (bar: number, loop: boolean) => void;
    /** Turn looping on or off while this section plays on its own. */
    onLoopChange: (loop: boolean) => void;
    onUnlink: () => void;
    /** A linked section the user chose to edit: changes go to its library file. */
    linkEditing: boolean;
    /** Library files can be written (dev server). */
    canEditLinks: boolean;
    onEditLink: () => void;
    onDoneEditingLink: () => void;
    onSaveToLibrary: () => void;
    onMoveTrack: (from: number, to: number) => void;
    /** New time signature for this section; null = the song's. */
    onMeter: (m: Meter | null) => void;
    /** New steps per beat for one line; null = the section's. */
    onLineSubdiv: (track: number, subdiv: number | null) => void;
    /** Present when other sections could take this section's line order. */
    onApplyOrder?: () => void;
    onToggleMute: (label: string) => void;
    onToggleSolo: (label: string) => void;
  }

  let p: Props = $props();

  const meter = $derived(meterOf(p.song, p.section));
  /** Columns per beat: the finest grid holding every line (12 when lines use 3 and 4). */
  const res = $derived(ticksPerBeat(p.song, p.section));
  /** Finest line, used to size the columns so its cells stay tappable. */
  const finest = $derived(Math.max(meter.subdiv, ...p.section.tracks.map((x) => x.subdiv ?? meter.subdiv)));
  const LINE_SUBDIVS = [2, 3, 4, 6, 8];
  /** Menu value: 'song' while the section follows the song's time signature. */
  const meterKey = $derived(
    p.section.beats === undefined && p.section.subdiv === undefined ? 'song' : `${meter.beats}x${meter.subdiv}`,
  );
  const meterName = (m: Meter) =>
    METERS.find((x) => x.beats === m.beats && x.subdiv === m.subdiv)?.label ??
    t('tr.custom', { beats: m.beats, subdiv: m.subdiv });
  const isPreset = $derived(METERS.some((x) => `${x.beats}x${x.subdiv}` === meterKey));

  /*
   * Grid columns: the name column, then the steps, with a narrow empty column between beats and a
   * wider one between bars (where the bar line is drawn). Cells are placed with col().
   */
  const BEAT_GAP = 6;
  const BAR_GAP = 16;
  const template = $derived.by(() => {
    const parts = ['var(--label-col)'];
    const nBeats = p.section.bars * meter.beats;
    for (let b = 0; b < nBeats; b++) {
      if (b > 0) parts.push(`${b % meter.beats === 0 ? BAR_GAP : BEAT_GAP}px`);
      for (let i = 0; i < res; i++) parts.push('var(--unit)');
    }
    return parts.join(' ');
  });
  /** Grid placement of step `si` of a line with `d` steps per beat (one gap column before every beat but the first). */
  function place(si: number, d: number): string {
    const beat = Math.floor(si / d);
    const span = res / d;
    return `${2 + beat * (res + 1) + (si % d) * span} / span ${span}`;
  }
  /** Beat numbers shown above the grid. */
  const beatsList = $derived(
    Array.from({ length: p.section.bars * meter.beats }, (_, b) => ({
      b,
      bar: Math.floor(b / meter.beats),
      inBar: b % meter.beats,
    })),
  );
  /** Bar numbers, for the strip above the beats. */
  const barList = $derived(Array.from({ length: p.section.bars }, (_, i) => i));
  /** Grid placement of a whole bar: its beats and the gaps between them. */
  const barPlace = (bar: number) => `${2 + bar * meter.beats * (res + 1)} / span ${meter.beats * (res + 1) - 1}`;
  function deleteBar(bar: number) {
    if (barHasNotes(p.song, p.section, bar) && !confirm(t('confirm.deleteBar', { n: bar + 1 }))) return;
    p.onDeleteBar(bar);
  }
  const nowBeat = $derived(p.nowTick >= 0 ? Math.floor(p.nowTick / p.nowRes) : -1);
  /** Step of a line with `d` steps per beat that is sounding now, or -1. */
  function nowStepOf(d: number): number {
    return p.nowTick >= 0 ? Math.floor((p.nowTick * d) / p.nowRes + 1e-9) : -1;
  }

  function nextStroke(inst: InstrumentId, cur: string): string {
    const cycle = INSTRUMENT_BY_ID[inst].cycle;
    const i = cycle.indexOf(cur);
    return i === -1 ? cycle[0] : i === cycle.length - 1 ? REST : cycle[i + 1];
  }

  function cellClass(inst: InstrumentId, ch: string): string {
    if (ch === REST) return '';
    const s = findStroke(INSTRUMENT_BY_ID[inst], ch);
    if (!s) return '';
    return `on k-${s.kind} ${s.vel >= 1 ? 'acc' : ''}`;
  }

  function strokeTitle(inst: InstrumentId, ch: string): string {
    if (ch === REST) return t('sec.rest');
    const s = findStroke(INSTRUMENT_BY_ID[inst], ch);
    return s ? strokeLabel(s.label) : ch;
  }

  let adding = $state('');
  const linked = $derived(!!p.section.link);
  const readonly = $derived(linked && !p.linkEditing);
  /** Showing the "edit the file or unlink?" choice after a click on a read-only linked section. */
  let askLink = $state(false);

  /* ---- drag to reorder lines (mouse and touch, via the grip) ---- */
  let labels: HTMLElement[] = $state([]);
  let dragFrom = $state<number | null>(null);
  /** Final index the dragged line would land on. */
  let dragTo = $state<number | null>(null);

  function startDrag(e: PointerEvent, ti: number) {
    if (readonly || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragFrom = dragTo = ti;
  }

  function moveDrag(e: PointerEvent) {
    if (dragFrom === null) return;
    // Insertion point = number of rows whose middle is above the pointer.
    let ins = 0;
    labels.slice(0, p.section.tracks.length).forEach((el, i) => {
      const r = el?.getBoundingClientRect();
      if (r && e.clientY > r.top + r.height / 2) ins = i + 1;
    });
    dragTo = ins > dragFrom ? ins - 1 : ins;
  }

  function endDrag() {
    if (dragFrom !== null && dragTo !== null && dragTo !== dragFrom) p.onMoveTrack(dragFrom, dragTo);
    dragFrom = dragTo = null;
  }

  let cardEl: HTMLElement;

  async function gripKey(e: KeyboardEvent, ti: number) {
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const to = ti + d;
    if (to < 0 || to >= p.section.tracks.length) return;
    p.onMoveTrack(ti, to);
    // Moving a DOM node drops its focus: put it back on the moved line's grip.
    await tick();
    cardEl.querySelectorAll<HTMLElement>('.grip')[to]?.focus();
  }

  /**
   * Move the section and keep it at the same place on screen, so the ↑/↓ buttons stay under
   * the pointer for repeated clicks. Focus is put back too, since moving a DOM node can drop it.
   */
  async function moveSection(d: -1 | 1) {
    const to = p.index + d;
    if (to < 0 || to >= p.count) return;
    const focused = cardEl.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    const top = cardEl.getBoundingClientRect().top;
    p.onMove(d);
    await tick();
    window.scrollBy({ top: cardEl.getBoundingClientRect().top - top, behavior: 'instant' });
    focused?.focus({ preventScroll: true });
  }

  function headerKey(e: KeyboardEvent) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    moveSection(d);
  }

  /** Loop choice for the ▶ button; while the section plays alone, the player's state wins. */
  let loopPref = $state(false);
  const loopOn = $derived(p.playingAlone ? !p.once : loopPref);
  function toggleLoop() {
    loopPref = !loopOn;
    if (p.playingAlone) p.onLoopChange(loopPref);
  }

  /** Drop-indicator class for row `ti` while dragging. */
  function dropClass(ti: number): string {
    if (dragFrom === null || dragTo === null || dragTo === dragFrom) return '';
    if (dragTo < dragFrom) return ti === dragTo ? 'drop-above' : '';
    return ti === dragTo ? 'drop-below' : '';
  }
</script>

<section class="card" class:playing={!!p.progress} bind:this={cardEl}>
  {#if p.progress}
    <div class="progress" style="width: {(p.progress.fraction * 100).toFixed(1)}%"></div>
  {/if}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <header onkeydown={headerKey}>
    <input
      class="name"
      value={p.section.name}
      aria-label={t('sec.name')}
      onchange={(e) => {
        const v = e.currentTarget.value;
        p.onRename(v);
        e.currentTarget.value = p.section.name;
      }}
    />
    <label class="bars">
      {t('sec.bars')}
      <input
        type="number"
        min="1"
        max="64"
        value={p.section.bars}
        disabled={readonly}
        onchange={(e) => p.onBars(Number(e.currentTarget.value))}
      />
    </label>
    <label class="meter" title={t('sec.meterTip')}>
      <select
        value={meterKey}
        disabled={readonly}
        aria-label={t('tr.meter')}
        onchange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = meterKey; // the song decides (the change can be cancelled)
          if (v === 'song') p.onMeter(null);
          else {
            const [beats, subdiv] = v.split('x').map(Number);
            p.onMeter({ beats, subdiv });
          }
        }}
      >
        {#if !linked}
          <option value="song">{t('sec.songMeter', { meter: meterName(p.song) })}</option>
        {/if}
        {#each METERS as m (m.label)}
          <option value="{m.beats}x{m.subdiv}">{m.label}{m.subdiv === 3 ? ` · ${t('tr.ternary')}` : ''}</option>
        {/each}
        {#if !isPreset && meterKey !== 'song'}
          <option value={meterKey}>{meterName(meter)}</option>
        {/if}
      </select>
    </label>
    {#if linked}
      {#if p.linkEditing}
        <span
          class="link editing"
          title={t('sec.editingTip', { ref: p.section.link! })}>{t('sec.editing', { ref: p.section.link! })}</span
        >
        <button class="ghost unlink" onclick={p.onDoneEditingLink} title={t('sec.doneTip')}>{t('sec.done')}</button>
      {:else}
        <span
          class="link"
          title={t('sec.linkTip', { ref: p.section.link! })}>🔗 {p.section.link}</span
        >
      {/if}
      <button
        class="ghost unlink"
        onclick={p.onUnlink}
        title={t('sec.unlinkTip')}>{t('sec.unlink')}</button
      >
    {:else}
      <button
        class="ghost save"
        onclick={p.onSaveToLibrary}
        title={t('sec.saveToLibTip')}>{t('sec.saveToLib')}</button
      >
    {/if}
    {#if p.progress}
      {@const pr = p.progress}
      <span class="now-playing">
        {pr.itemIdx >= 0
          ? t('sec.part', { i: pr.itemIdx + 1, n: p.partCount })
          : pr.onlyBar !== null
            ? t('sec.aloneBar', { n: pr.onlyBar + 1 })
            : pr.repeat === Infinity
              ? t('sec.looping')
              : t('sec.alone')}
        {t('sec.passBar', { pass: passLabel(pr), bar: pr.bar + 1, bars: pr.bars })}
        {#if pr.next}
          <span class="next" class:queued={pr.next.queued}
            >→ {pr.next.section}{pr.next.queued ? t('sec.queued') : pr.next.onNext ? t('sec.onNext') : ''}</span
          >
        {:else if pr.repeat !== Infinity}
          <span class="next">{t('sec.end')}</span>
        {/if}
      </span>
    {/if}
    <span class="spacer"></span>
    <span class="play">
      {#if p.playingAlone}
        <button class="primary" onclick={p.onStop} title={t('sec.stopTip')}>{t('tr.stop')}</button>
      {:else}
        <button class:pending={p.pendingLoop} onclick={() => p.onPlay(loopOn)} title={t('sec.playTip')}
          >{t('tr.play')}</button
        >
      {/if}<button
        class="loop-toggle"
        class:on={loopOn}
        aria-pressed={loopOn}
        onclick={toggleLoop}
        title={t('sec.loopTip')}
        aria-label={t('sec.loopLabel')}>🔁</button
      >
    </span>
    <span class="move">
      <button
        class="ghost"
        onclick={() => moveSection(-1)}
        disabled={p.index === 0}
        title={t('sec.moveUp')}
        aria-label={t('sec.moveUp')}>↑</button
      ><button
        class="ghost"
        onclick={() => moveSection(1)}
        disabled={p.index === p.count - 1}
        title={t('sec.moveDown')}
        aria-label={t('sec.moveDown')}>↓</button
      >
    </span>
    <button class="ghost" onclick={p.onDuplicate} title={t('sec.duplicate')}>⧉</button>
    <button
      class="ghost"
      onclick={() => confirm(t('confirm.deleteSection', { name: p.section.name })) && p.onDelete()}
      title={t('sec.delete')}>🗑</button
    >
  </header>

  {#if askLink && readonly}
    <div class="ask" role="dialog" aria-label={t('sec.askLabel')}>
      <p>
        {t('sec.comesFrom')} <code>songs/{p.section.link}.txt</code>.
        {p.canEditLinks ? t('sec.editChangesAll') : t('sec.editOnlyDev')}
      </p>
      <div class="ask-buttons">
        {#if p.canEditLinks}
          <button
            class="primary"
            onclick={() => {
              askLink = false;
              p.onEditLink();
            }}>{t('sec.editFile')}</button
          >
        {/if}
        <button
          onclick={() => {
            askLink = false;
            p.onUnlink();
          }}>{t('sec.unlinkCopy')}</button
        >
        <button class="ghost" onclick={() => (askLink = false)}>{t('cancel')}</button>
      </div>
    </div>
  {/if}

  <div class="scroll">
    <div class="grid" style="grid-template-columns: {template}; --k: {finest / res}">
      <div class="label ruler-label" aria-hidden="true"></div>
      {#each barList as bar (bar)}
        <div class="barhead" class:first={bar === 0} style:grid-column={barPlace(bar)}>
          <span class="barno">{t('sec.barN', { n: bar + 1 })}</span>
          {#if p.playingAlone && p.playingBar === bar}
            <button
              class="ghost bar-btn playing"
              onclick={p.onStop}
              title={t('sec.stopTip')}
              aria-label={t('sec.stopTip')}>■</button
            >
          {:else}
            <button
              class="ghost bar-btn"
              onclick={() => p.onPlayBar(bar, loopOn)}
              title={t('sec.playBar', { n: bar + 1 })}
              aria-label={t('sec.playBar', { n: bar + 1 })}>▶</button
            >
          {/if}
          {#if !readonly}
            <button
              class="ghost bar-btn"
              onclick={() => p.onDuplicateBar(bar)}
              disabled={p.section.bars >= 64}
              title={t('sec.dupBar', { n: bar + 1 })}
              aria-label={t('sec.dupBar', { n: bar + 1 })}>⧉</button
            ><button
              class="ghost bar-btn"
              onclick={() => deleteBar(bar)}
              disabled={p.section.bars <= 1}
              title={t('sec.delBar', { n: bar + 1 })}
              aria-label={t('sec.delBar', { n: bar + 1 })}>🗑</button
            >
          {/if}
        </div>
      {/each}
      <div class="label ruler-label" aria-hidden="true"></div>
      {#each beatsList as bt (bt.b)}
        <div
          class="ruler"
          class:first={bt.b === 0}
          class:bar-start={bt.inBar === 0}
          class:now={bt.b === nowBeat}
          style="grid-column: {2 + bt.b * (res + 1)} / span {res}"
          aria-hidden="true"
        >
          <span class="beatno">{bt.inBar + 1}</span>
        </div>
      {/each}
      {#each p.section.tracks as track, ti (track.label)}
        {@const inst = INSTRUMENT_BY_ID[track.instrument]}
        {@const isMuted = p.soloed.length ? !p.soloed.includes(track.label) : p.muted.includes(track.label)}
        {@const drop = dropClass(ti)}
        {@const d = track.subdiv ?? meter.subdiv}
        {@const nowSi = nowStepOf(d)}
        <div
          class="label {drop}"
          class:dim={isMuted}
          class:dragging={dragFrom === ti}
          style="--hue: {inst.hue}"
          bind:this={labels[ti]}
        >
          {#if readonly}
            <span class="dot"></span>
          {:else}
            <button
              class="grip"
              aria-label={t('sec.move', { label: track.label })}
              title={t('sec.moveTip')}
              onpointerdown={(e) => startDrag(e, ti)}
              onpointermove={moveDrag}
              onpointerup={endDrag}
              onpointercancel={() => (dragFrom = dragTo = null)}
              onkeydown={(e) => gripKey(e, ti)}
            ></button>
          {/if}
          <span class="lname" title={inst.name}>{track.label}</span>
          <select
            class="sub"
            class:own={track.subdiv !== undefined}
            value={track.subdiv === undefined ? '' : String(track.subdiv)}
            disabled={readonly}
            title={t('sec.lineSubdivTip')}
            aria-label={t('sec.lineSubdiv', { label: track.label })}
            onchange={(e) => {
              const v = e.currentTarget.value;
              e.currentTarget.value = track.subdiv === undefined ? '' : String(track.subdiv);
              p.onLineSubdiv(ti, v === '' ? null : Number(v));
            }}
          >
            <option value="">÷{meter.subdiv}</option>
            {#each LINE_SUBDIVS.filter((n) => n !== meter.subdiv) as n (n)}
              <option value={String(n)}>÷{n}</option>
            {/each}
            {#if track.subdiv !== undefined && !LINE_SUBDIVS.includes(track.subdiv)}
              <option value={String(track.subdiv)}>÷{track.subdiv}</option>
            {/if}
          </select>
          <button
            class="ms"
            class:active={p.muted.includes(track.label)}
            onclick={() => p.onToggleMute(track.label)}
            title={t('sec.mute')}>M</button
          >
          <button
            class="ms"
            class:active={p.soloed.includes(track.label)}
            onclick={() => p.onToggleSolo(track.label)}
            title={t('sec.solo')}>S</button
          >
          <button
            class="ms rm"
            hidden={readonly}
            onclick={() => p.onRemoveTrack(ti)}
            title={t('sec.removeLine', { label: track.label })}>×</button
          >
        </div>
        {#each track.steps as ch, si}
          <button
            class="cell {cellClass(track.instrument, ch)} {drop}"
            class:alt={Math.floor(si / d) % 2 === 1}
            class:bar={si % (meter.beats * d) === 0 && si > 0}
            class:now={si === nowSi}
            class:dim={isMuted}
            class:dragging={dragFrom === ti}
            style="--hue: {inst.hue}"
            class:locked={readonly}
            style:grid-column={place(si, d)}
            title={t('sec.cellTip', { label: track.label, n: si + 1, stroke: strokeTitle(track.instrument, ch) })}
            onclick={() => (readonly ? (askLink = true) : p.onCell(ti, si, nextStroke(track.instrument, ch)))}
            oncontextmenu={(e) => {
              e.preventDefault();
              if (readonly) askLink = true;
              else p.onCell(ti, si, REST);
            }}>{ch === REST ? '' : ch}</button
          >
        {/each}
      {/each}
    </div>
  </div>

  <footer>
    {#if readonly}
      <p class="note">{t('sec.followsFile')}</p>
    {:else}
    <select
      bind:value={adding}
      onchange={() => {
        if (adding) p.onAddTrack(adding as InstrumentId);
        adding = '';
      }}
      aria-label={t('sec.addInstrument')}
    >
      <option value="">{t('sec.addInstrumentOpt')}</option>
      {#each INSTRUMENTS as i (i.id)}
        <option value={i.id}>{i.name}</option>
      {/each}
    </select>
    {#if p.onApplyOrder && p.section.tracks.length > 1}
      <button
        class="ghost order"
        onclick={p.onApplyOrder}
        title={t('sec.useOrderTip')}>{t('sec.useOrder')}</button
      >
    {/if}
    {/if}
  </footer>
</section>

<style>
  .card {
    position: relative;
    overflow: hidden;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px;
    min-width: 0;
  }
  .card.playing {
    border-color: var(--accent);
  }
  .progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 4px;
    background: var(--accent);
    transition: width 0.1s linear;
  }
  .now-playing {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .next {
    font-weight: 400;
    color: var(--muted);
    margin-left: 4px;
  }
  .next.queued {
    color: var(--accent);
    font-weight: 600;
  }
  .move,
  .play {
    display: inline-flex;
  }
  .play > button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    min-width: 6.5em;
  }
  .loop-toggle {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    margin-left: -1px;
    filter: grayscale(1);
    opacity: 0.55;
  }
  .loop-toggle.on {
    filter: none;
    opacity: 1;
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .move button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .name {
    font-weight: 700;
    font-size: 1.05rem;
    width: 9em;
    border-color: transparent;
    background: transparent;
  }
  .name:hover,
  .name:focus {
    border-color: var(--line);
  }
  .bars {
    color: var(--muted);
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .bars input {
    width: 3.5em;
  }
  .meter select {
    padding: 3px 4px;
    font-size: 0.85rem;
  }
  .spacer {
    flex: 1;
  }
  .pending {
    animation: pulse 0.6s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from {
      box-shadow: 0 0 0 0 var(--accent);
    }
    to {
      box-shadow: 0 0 0 3px var(--accent);
    }
  }

  .scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 4px;
  }
  /* A visible scrollbar, so a long section reads as "scroll for more" rather than cut off. */
  .scroll::-webkit-scrollbar {
    height: 8px;
  }
  .scroll::-webkit-scrollbar-track {
    background: var(--panel-2);
    border-radius: 4px;
  }
  .scroll::-webkit-scrollbar-thumb {
    background: var(--line);
    border-radius: 4px;
  }
  .scroll::-webkit-scrollbar-thumb:hover {
    background: var(--muted);
  }
  .grid {
    display: grid;
    --label-col: minmax(150px, max-content);
    /*
     * One column = 1/res of a beat. Cells share the card's width and shrink down to 20px (for the
     * finest line) before the grid scrolls, so two bars of 4/4 fit on a laptop screen.
     */
    --unit: minmax(calc(20px * var(--k)), 1fr);
    gap: 3px;
    width: 100%;
    min-width: max-content;
  }
  .label {
    grid-column: 1;
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--panel);
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 6px;
    min-height: 34px;
  }
  .label.dim .lname {
    opacity: 0.45;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
    background: hsl(var(--hue) 65% 50%);
  }
  .grip {
    flex: none;
    width: 14px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: radial-gradient(circle, hsl(var(--hue) 65% 50%) 1.6px, transparent 2px) 0 0 / 7px 6px;
    cursor: grab;
    touch-action: none;
  }
  .grip:active {
    cursor: grabbing;
  }
  .label.dragging,
  .cell.dragging {
    opacity: 0.5;
  }
  .label.drop-above,
  .cell.drop-above {
    box-shadow: 0 -3px 0 var(--accent);
  }
  .label.drop-below,
  .cell.drop-below {
    box-shadow: 0 3px 0 var(--accent);
  }
  .order {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .lname {
    flex: 1;
    font-size: 0.9rem;
    white-space: nowrap;
    max-width: 8em;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    appearance: none;
    -webkit-appearance: none;
    text-align: center;
    padding: 0 4px;
    font-size: 0.7rem;
    height: 22px;
    border-radius: 6px;
    color: var(--muted);
    background: transparent;
    border-color: transparent;
    flex: none;
  }
  .sub.own {
    color: var(--accent);
    font-weight: 700;
    border-color: var(--accent);
  }
  .sub:hover:not(:disabled) {
    border-color: var(--line);
  }
  .ms {
    padding: 0;
    width: 22px;
    height: 22px;
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 5px;
    color: var(--muted);
  }
  .ms.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }
  .ms.rm {
    border-color: transparent;
    background: transparent;
    font-size: 1rem;
  }

  .cell {
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: var(--cell);
    font-family: var(--mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: hsl(var(--hue) 70% 22%);
    user-select: none;
  }
  .cell.locked {
    cursor: default;
  }
  .link.editing {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
    font-weight: 600;
  }
  .ask {
    margin: 0 0 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--panel-2);
    border: 1px solid var(--accent);
    font-size: 0.85rem;
  }
  .ask p {
    margin: 0 0 6px;
  }
  .ask code {
    font-family: var(--mono);
  }
  .ask-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ask-buttons button {
    padding: 4px 10px;
    font-size: 0.85rem;
  }
  .link {
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--muted);
    background: var(--panel-2);
    padding: 3px 8px;
    border-radius: 999px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 16em;
  }
  .save {
    font-size: 0.85rem;
    padding: 3px 8px;
    color: var(--muted);
  }
  .unlink {
    font-size: 0.85rem;
    padding: 3px 8px;
    text-decoration: underline;
  }
  .note {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  /* Every other beat is shaded so beats read as groups. */
  .cell.alt {
    background: var(--cell-beat);
  }
  /* Bar line, drawn in the middle of the gap column before the bar's first step. */
  .cell.bar {
    position: relative;
    overflow: visible;
  }
  .cell.bar::before {
    content: '';
    position: absolute;
    left: -12px;
    top: -3px;
    bottom: -3px;
    width: 3px;
    border-radius: 2px;
    background: var(--line-strong);
    pointer-events: none;
  }

  .ruler-label {
    grid-column: 1;
    min-height: 0;
  }
  .ruler {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 0 2px 1px;
    font-size: 0.72rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    border-bottom: 2px solid var(--line);
    position: relative;
  }
  .ruler.bar-start .beatno {
    color: var(--text);
    font-weight: 700;
  }
  .ruler.bar-start:not(.first)::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 0;
    bottom: -5px;
    width: 3px;
    border-radius: 2px;
    background: var(--line-strong);
  }
  .barhead {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
    padding: 0 2px;
  }
  .bar-btn {
    padding: 0 4px;
    min-height: 0;
    line-height: 1.4;
    font-size: 0.8rem;
    opacity: 0.55;
  }
  .bar-btn:hover:not(:disabled),
  .bar-btn:focus-visible {
    opacity: 1;
  }
  .bar-btn.playing {
    opacity: 1;
    color: var(--accent);
  }
  .bar-btn:disabled {
    opacity: 0.2;
    cursor: default;
  }
  .barno {
    margin-right: 4px;
    white-space: nowrap;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
  }
  .ruler.now {
    border-bottom-color: var(--accent);
    color: var(--accent);
  }
  .cell.on {
    background: hsl(var(--hue) 60% 72%);
  }
  .cell.on.acc {
    background: hsl(var(--hue) 65% 52%);
    color: #fff;
  }
  .cell.k-mute,
  .cell.k-ghost {
    background: hsl(var(--hue) 40% 85%);
  }
  .cell.k-rim,
  .cell.k-slap {
    background: repeating-linear-gradient(
      135deg,
      hsl(var(--hue) 60% 62%) 0 4px,
      hsl(var(--hue) 60% 74%) 4px 8px
    );
  }
  .cell.dim {
    opacity: 0.4;
  }
  .cell.now {
    outline: 3px solid var(--now);
    outline-offset: -1px;
  }
  @media (prefers-color-scheme: dark) {
    .cell {
      color: hsl(var(--hue) 70% 88%);
    }
    .cell.on {
      background: hsl(var(--hue) 45% 38%);
    }
    .cell.on.acc {
      background: hsl(var(--hue) 65% 55%);
      color: #111;
    }
    .cell.k-mute,
    .cell.k-ghost {
      background: hsl(var(--hue) 25% 28%);
    }
    .cell.k-rim,
    .cell.k-slap {
      background: repeating-linear-gradient(
        135deg,
        hsl(var(--hue) 45% 40%) 0 4px,
        hsl(var(--hue) 45% 30%) 4px 8px
      );
    }
    .cell.now {
      outline-color: #ffd34d;
    }
  }

  footer {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  @media (max-width: 600px) {
    .card {
      padding: 8px;
    }
    .grid {
      --label-col: max-content;
      --unit: calc(30px * var(--k));
    }
    .label {
      gap: 2px;
      padding-right: 4px;
    }
    .dot {
      width: 7px;
      height: 7px;
    }
    .lname {
      max-width: 3.8em;
      font-size: 0.78rem;
    }
    .ms {
      width: 19px;
      height: 22px;
      font-size: 0.62rem;
    }
    .ms.rm {
      width: 14px;
    }
  }
</style>
