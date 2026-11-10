<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import type { ArrItem, Song } from '../lib/song';

  interface Props {
    song: Song;
    onChange: (items: ArrItem[]) => void;
    /** Part playing now, or -1. */
    currentIdx: number;
    /** Part queued to play next, or null. */
    pendingIdx: number | null;
  }
  let p: Props = $props();

  function update(fn: (items: ArrItem[]) => void) {
    const items = p.song.arrangement.map((a) => ({ ...a }));
    fn(items);
    p.onChange(items);
  }

  function move(i: number, d: number) {
    update((items) => {
      const j = i + d;
      if (j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
    });
  }
</script>

<section class="card">
  <h2>{t('arr.title')}</h2>
  <p class="hint">{@html t('arr.hint')}</p>
  <ol>
    {#each p.song.arrangement as item, i (i)}
      <li class:now={p.currentIdx === i} class:pending={p.pendingIdx === i}>
        <span class="n">{p.currentIdx === i ? '▶' : i + 1}</span>
        <select
          value={item.section}
          onchange={(e) => update((items) => (items[i].section = e.currentTarget.value))}
          aria-label={t('arr.section')}
        >
          {#each p.song.sections as s (s.name)}
            <option value={s.name}>{s.name}</option>
          {/each}
        </select>
        <label class="loop">
          <input
            type="checkbox"
            checked={item.repeat === Infinity}
            onchange={(e) => update((items) => (items[i].repeat = e.currentTarget.checked ? Infinity : 1))}
          />
          {t('arr.loop')}
        </label>
        {#if item.repeat !== Infinity}
          <label class="times">
            ×
            <input
              type="number"
              min="1"
              max="999"
              value={item.repeat}
              onchange={(e) =>
                update((items) => (items[i].repeat = Math.max(1, Math.round(Number(e.currentTarget.value)) || 1)))}
              aria-label={t('arr.repeats')}
            />
          </label>
        {/if}
        <span class="spacer"></span>
        <button class="ghost" onclick={() => move(i, -1)} disabled={i === 0} aria-label={t('arr.up')}>↑</button>
        <button
          class="ghost"
          onclick={() => move(i, 1)}
          disabled={i === p.song.arrangement.length - 1}
          aria-label={t('arr.down')}>↓</button
        >
        <button class="ghost" onclick={() => update((items) => items.splice(i, 1))} aria-label={t('arr.remove')}>×</button>
      </li>
    {/each}
  </ol>
  {#if p.song.sections.length}
    <button onclick={() => update((items) => items.push({ section: p.song.sections[0].name, repeat: 1 }))}
      >{t('arr.addPart')}</button
    >
  {/if}
</section>

<style>
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 12px;
  }
  h2 {
    font-size: 1.05rem;
    margin: 0 0 2px;
  }
  .hint {
    margin: 0 0 8px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  ol {
    list-style: none;
    padding: 0;
    margin: 0 0 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 2px 6px;
    margin: 0 -6px;
    border-radius: 8px;
  }
  li.now {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  li.now .n {
    color: var(--accent);
  }
  li.pending {
    box-shadow: inset 3px 0 0 var(--accent);
    animation: pulse 0.6s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from {
      background: transparent;
    }
    to {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
  }
  .n {
    width: 1.6em;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .loop,
  .times {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .loop input {
    accent-color: var(--accent);
  }
  .times input {
    width: 4em;
  }
  .spacer {
    flex: 1;
  }
  li button {
    padding: 4px 8px;
  }
</style>
