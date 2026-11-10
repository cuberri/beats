<script lang="ts">
  import type { PlayerState } from '../lib/player';
  import { i18n, t } from '../lib/i18n.svelte';
  import { passLabel, type Progress } from '../lib/progress';
  import { METERS, type Song } from '../lib/song';

  interface Props {
    song: Song;
    ps: PlayerState;
    progress: Progress | null;
    click: boolean;
    onPlay: () => void;
    onStop: () => void;
    onNext: () => void;
    onItem: (idx: number) => void;
    onLoop: (section: string) => void;
    onTempo: (bpm: number) => void;
    onSwing: (swing: number) => void;
    onMeter: (beats: number, subdiv: number) => void;
    onClick: (on: boolean) => void;
  }
  let p: Props = $props();

  const meterKey = $derived(`${p.song.beats}x${p.song.subdiv}`);
  const isPreset = $derived(METERS.some((m) => `${m.beats}x${m.subdiv}` === meterKey));
  /** Swing only applies to lines with an even number of steps per beat. */
  const canSwing = $derived(
    !p.song.sections.length ||
      p.song.sections.some((x) => x.tracks.map((t) => t.subdiv ?? x.subdiv ?? p.song.subdiv).some((d) => d % 2 === 0)),
  );

  const looping = $derived(p.ps.playing && p.ps.mode === 'loop');

  // Keep the playing chip in view when the strip is wider than the screen.
  let songStrip: HTMLElement;
  let loopStrip: HTMLElement;
  $effect(() => {
    const strip = looping ? loopStrip : songStrip;
    const key = looping ? p.ps.section : String(p.ps.itemIdx);
    if (!p.ps.playing || key == null) return;
    strip?.querySelector('.chip.now')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });
</script>

<div class="transport" style:--tag-w={i18n.lang === 'fr' ? '5.8em' : '3.2em'}>
  <div class="row controls">
    {#if p.ps.playing}
      <button class="primary big" onclick={p.onStop} aria-label={t('tr.stopLabel')}>{t('tr.stop')}</button>
    {:else}
      <button class="primary big" onclick={p.onPlay} aria-label={t('tr.playLabel')}>{t('tr.play')}</button>
    {/if}
    <button
      onclick={p.onNext}
      disabled={!p.ps.playing || p.ps.mode !== 'song'}
      title={t('tr.nextTip')}>{t('tr.next')}</button
    >

    <div class="tempo">
      <button class="sq" onclick={() => p.onTempo(p.song.tempo - 5)} aria-label={t('tr.slower')}>−</button>
      <label>
        <input
          type="number"
          min="30"
          max="300"
          value={p.song.tempo}
          onchange={(e) => p.onTempo(Number(e.currentTarget.value))}
          aria-label={t('tr.tempo')}
        />
        <span>bpm</span>
      </label>
      <button class="sq" onclick={() => p.onTempo(p.song.tempo + 5)} aria-label={t('tr.faster')}>+</button>
    </div>

    <label class="meter" title={t('tr.meterTip')}>
      <select
        value={meterKey}
        onchange={(e) => {
          const [b, s] = e.currentTarget.value.split('x').map(Number);
          p.onMeter(b, s);
          e.currentTarget.value = meterKey; // the song decides (the change can be cancelled)
        }}
        aria-label={t('tr.meter')}
      >
        {#each METERS as m (m.label)}
          <option value="{m.beats}x{m.subdiv}">{m.label}{m.subdiv === 3 ? ` · ${t('tr.ternary')}` : ''}</option>
        {/each}
        {#if !isPreset}
          <option value={meterKey}>{t('tr.custom', { beats: p.song.beats, subdiv: p.song.subdiv })}</option>
        {/if}
      </select>
    </label>

    <label class="swing" class:off={!canSwing} title={canSwing ? t('tr.swingTip') : t('tr.swingOff')}>
      {t('tr.swing')}
      <input
        type="range"
        min="0"
        max="100"
        value={p.song.swing}
        disabled={!canSwing}
        oninput={(e) => p.onSwing(Number(e.currentTarget.value))}
      />
      <span class="val">{p.song.swing}</span>
    </label>

    <label class="clk" title={t('tr.clickTip')}>
      <input type="checkbox" checked={p.click} onchange={(e) => p.onClick(e.currentTarget.checked)} />
      {t('tr.click')}
    </label>

  </div>

  <div class="row strip" bind:this={songStrip} aria-label={t('tr.songStrip')}>
    <span class="tag">{t('tr.song')}</span>
    {#each p.song.arrangement as item, i (i)}
      {@const prog = p.progress && p.progress.itemIdx === i ? p.progress : null}
      <button
        class="chip"
        class:now={!!prog}
        class:pending={p.ps.pendingIdx === i}
        style={prog ? `--p: ${(prog.fraction * 100).toFixed(1)}%` : ''}
        title={prog
          ? t('tr.playingPass', { pass: passLabel(prog) }) + (prog.repeat === Infinity ? t('tr.loopsUntilNext') : '')
          : t('tr.jumpHere')}
        onclick={() => p.onItem(i)}
      >
        {item.section}{#if prog}<span class="rep"
            >{prog.repeat === Infinity ? '∞ ' : ''}{passLabel(prog)}</span
          >{:else if item.repeat === Infinity}<span class="rep">∞</span>{:else if item.repeat > 1}<span class="rep"
            >×{item.repeat}</span
          >{/if}
      </button>
    {/each}
  </div>
  <div class="row strip" bind:this={loopStrip} aria-label={t('tr.loopStrip')}>
    <span class="tag">{t('tr.loop')}</span>
    {#each p.song.sections as sec (sec.name)}
      {@const prog = looping && p.progress?.section === sec.name ? p.progress : null}
      <button
        class="chip"
        class:now={!!prog}
        class:pending={p.ps.pendingLoop === sec.name}
        style={prog ? `--p: ${(prog.fraction * 100).toFixed(1)}%` : ''}
        onclick={() => p.onLoop(sec.name)}
        >{sec.name}{#if prog}<span class="rep">{passLabel(prog)}</span>{/if}</button
      >
    {/each}
  </div>
</div>

<style>
  .transport {
    position: sticky;
    bottom: 0;
    z-index: 5;
    background: var(--panel);
    border-top: 1px solid var(--line);
    padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 0 -6px 20px rgb(0 0 0 / 0.06);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .controls {
    flex-wrap: wrap;
  }
  .big {
    min-width: 6.5em;
    padding: 8px 14px;
  }
  .tempo {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tempo label {
    display: flex;
    align-items: baseline;
    gap: 4px;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .tempo input {
    width: 4.2em;
    text-align: center;
  }
  .sq {
    width: 32px;
    padding: 6px 0;
  }
  .swing,
  .clk {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .swing.off {
    opacity: 0.5;
  }
  .meter select {
    padding: 4px 6px;
  }
  .swing input {
    width: 90px;
    accent-color: var(--accent);
  }
  .val {
    width: 2ch;
    font-variant-numeric: tabular-nums;
  }
  .clk input {
    accent-color: var(--accent);
  }
  .strip {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .tag {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    width: var(--tag-w);
    flex: none;
  }
  .chip {
    flex: none;
    border-radius: 999px;
    padding: 5px 12px;
    background: var(--panel-2);
    white-space: nowrap;
  }
  /* The playing chip fills up as the part progresses. */
  .chip.now {
    background: linear-gradient(
      90deg,
      var(--accent) var(--p, 0%),
      color-mix(in srgb, var(--accent) 35%, var(--panel-2)) var(--p, 0%)
    );
    border-color: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }
  .chip.pending {
    border-color: var(--accent);
    animation: pulse 0.6s ease-in-out infinite alternate;
  }
  .rep {
    margin-left: 4px;
    opacity: 0.7;
    font-size: 0.85em;
  }
  @keyframes pulse {
    from {
      box-shadow: 0 0 0 0 var(--accent);
    }
    to {
      box-shadow: 0 0 0 3px var(--accent);
    }
  }
  @media (max-width: 600px) {
    .swing input {
      width: 70px;
    }
  }
</style>
