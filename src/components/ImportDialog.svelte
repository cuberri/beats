<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { INSTRUMENT_BY_ID, INSTRUMENTS, type InstrumentId } from '../lib/instruments';
  import { kindOf } from '../lib/library.svelte';
  import { METERS, REST, importMatches, meterOf, type Section, type Song } from '../lib/song';

  interface Props {
    /** Library path of the file, e.g. "patterns/virgule". */
    path: string;
    /** The file, parsed. */
    source: Song;
    /** Import lines into this existing section instead of adding sections (one source section then). */
    target?: Section;
    onImport: (sections: string[], instruments: InstrumentId[]) => void;
    /** Loop a section of the file with only these instruments, or stop (null). */
    onPreview: (section: string | null, instruments: InstrumentId[]) => void;
    onClose: () => void;
  }
  let p: Props = $props();

  let dialog: HTMLDialogElement;
  // A pattern is meant to be imported whole; from a song you usually want one part of it.
  // svelte-ignore state_referenced_locally
  let picked = $state<string[]>(
    p.target
      ? p.source.sections.slice(0, 1).map((s) => s.name)
      : kindOf(p.path) === 'patterns'
        ? p.source.sections.map((s) => s.name)
        : [],
  );
  /** Instruments left out (everything else present is imported). */
  let skipped = $state<InstrumentId[]>([]);

  /** Instruments with a line in at least one picked section, in the usual order. */
  const present = $derived(
    INSTRUMENTS.filter((i) =>
      p.source.sections.some((s) => picked.includes(s.name) && s.tracks.some((tr) => tr.instrument === i.id)),
    ).map((i) => i.id),
  );
  const chosen = $derived(present.filter((i) => !skipped.includes(i)));
  /** Picked sections that still have a line once instruments are left out. */
  const count = $derived(
    p.source.sections.filter((s) => picked.includes(s.name) && s.tracks.some((tr) => chosen.includes(tr.instrument)))
      .length,
  );

  /** Lines of the target section that will be replaced although they have notes. */
  const overwritten = $derived.by(() => {
    if (!p.target) return [];
    const from = p.source.sections.find((s) => s.name === picked[0]);
    const tracks = (from?.tracks ?? []).filter((tr) => chosen.includes(tr.instrument));
    return importMatches(p.target, tracks)
      .filter((t) => t?.steps.some((c) => c !== REST))
      .map((t) => t!.label);
  });

  /** Section being previewed. */
  let previewing = $state<string | null>(null);
  function preview(name: string) {
    previewing = previewing === name ? null : name;
    if (!previewing) p.onPreview(null, []);
  }
  function stopPreview() {
    if (previewing) p.onPreview(null, []);
    previewing = null;
  }
  // Start the preview, and follow the instrument chips while it plays.
  $effect(() => {
    const c = chosen;
    if (previewing) p.onPreview(previewing, c);
  });

  function meterLabel(name: string): string {
    const m = meterOf(p.source, p.source.sections.find((s) => s.name === name));
    return METERS.find((x) => x.beats === m.beats && x.subdiv === m.subdiv)?.label ?? `${m.beats}×${m.subdiv}`;
  }
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  $effect(() => {
    dialog.showModal();
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!count) return;
    stopPreview();
    p.onImport(picked, chosen);
    dialog.close();
  }
</script>

<dialog
  bind:this={dialog}
  onclose={() => {
    stopPreview();
    p.onClose();
  }}
>
  <form onsubmit={submit}>
    {#if p.target}
      <h2>{t('imp.titleInto', { name: p.target.name })}</h2>
      <p class="note">{t('imp.noteInto', { path: p.path, n: p.target.bars })}</p>
    {:else}
      <h2>{t('imp.title', { title: p.source.title })}</h2>
      <p class="note">{t('imp.note', { path: p.path })}</p>
    {/if}

    {#if !p.source.sections.length}
      <p class="note">{t('imp.noSections')}</p>
    {:else}
      <fieldset>
        <legend>{p.target ? t('imp.from') : t('imp.sections')}</legend>
        {#each p.source.sections as sec (sec.name)}
          <div class="line">
          <label class="row">
            {#if p.target}
              <input type="radio" name="from" checked={picked[0] === sec.name} onchange={() => (picked = [sec.name])} />
            {:else}
              <input
                type="checkbox"
                checked={picked.includes(sec.name)}
                onchange={() => (picked = toggle(picked, sec.name))}
              />
            {/if}
            <span class="name">{sec.name}</span>
            <span class="meta"
              >{t('imp.bars', { n: sec.bars })} · {meterLabel(sec.name)} ·
              {sec.tracks.map((tr) => tr.label).join(', ') || t('imp.empty')}</span
            >
          </label>
          {#if sec.tracks.length}
            <button
              type="button"
              class="ghost play"
              class:on={previewing === sec.name}
              onclick={() => preview(sec.name)}
              title={previewing === sec.name ? t('imp.stop') : t('imp.listen')}
              aria-label={previewing === sec.name ? t('imp.stop') : t('imp.listen')}
              >{previewing === sec.name ? '■' : '▶'}</button
            >
          {/if}
          </div>
        {/each}
      </fieldset>

      {#if present.length > 1}
        <fieldset>
          <legend>{t('imp.instruments')}</legend>
          <div class="chips">
            {#each present as id (id)}
              <label class="chip" class:off={skipped.includes(id)} style="--hue: {INSTRUMENT_BY_ID[id].hue}">
                <input
                  type="checkbox"
                  checked={!skipped.includes(id)}
                  onchange={() => (skipped = toggle(skipped, id))}
                />
                {INSTRUMENT_BY_ID[id].name}
              </label>
            {/each}
          </div>
        </fieldset>
      {/if}

      {#if overwritten.length}
        <p class="warn">{t('imp.replaces', { labels: overwritten.join(', ') })}</p>
      {/if}
    {/if}

    <div class="buttons">
      <button
        type="button"
        onclick={() => {
          stopPreview();
          dialog.close();
        }}>{t('cancel')}</button
      >
      <button type="submit" class="primary" disabled={!count}
        >{p.target
          ? t('imp.goInto', { name: p.target.name })
          : count > 1
            ? t('imp.goN', { n: count })
            : t('imp.go')}</button
      >
    </div>
  </form>
</dialog>

<style>
  dialog {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 0;
    background: var(--panel);
    color: var(--text);
    width: min(520px, calc(100vw - 32px));
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
  form {
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .note {
    margin: -6px 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  legend {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .line .row {
    flex: 1;
    min-width: 0;
  }
  .play {
    flex: none;
    width: 30px;
    padding: 2px 0;
  }
  .play.on {
    color: var(--accent);
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 8px;
    cursor: pointer;
  }
  .row:hover {
    background: var(--panel-2);
  }
  .name {
    font-weight: 600;
  }
  .meta {
    font-size: 0.8rem;
    color: var(--muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid hsl(var(--hue) 55% 50%);
    background: color-mix(in srgb, hsl(var(--hue) 60% 50%) 15%, transparent);
    border-radius: 999px;
    padding: 3px 10px 3px 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .chip.off {
    border-color: var(--line);
    background: transparent;
    color: var(--muted);
  }
  .warn {
    margin: 0;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 0.85rem;
    background: color-mix(in srgb, #e0a020 18%, transparent);
    border: 1px solid color-mix(in srgb, #e0a020 60%, transparent);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
