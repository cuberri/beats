<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import type { LibEntry } from '../lib/library.svelte';

  interface Props {
    entries: LibEntry[];
    currentPath: string | null;
    onOpen: (path: string) => void;
    onAdd: (path: string) => void;
    onClose: () => void;
  }
  let p: Props = $props();

  let dialog: HTMLDialogElement;
  let filter = $state('');

  const groups = $derived.by(() => {
    const f = filter.trim().toLowerCase();
    const map = new Map<string, LibEntry[]>();
    for (const e of p.entries) {
      if (f && !e.title.toLowerCase().includes(f) && !e.path.toLowerCase().includes(f)) continue;
      if (!map.has(e.group)) map.set(e.group, []);
      map.get(e.group)!.push(e);
    }
    return [...map];
  });

  $effect(() => {
    dialog.showModal();
  });
</script>

<dialog bind:this={dialog} onclose={p.onClose} onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="inner">
    <header>
      <h2>{t('lib.title')}</h2>
      <button class="ghost" onclick={() => dialog.close()} aria-label={t('close')}>✕</button>
    </header>
    <p class="hint">{@html t('lib.hint')}</p>
    {#if p.entries.length > 6}
      <input class="filter" placeholder={t('lib.filter')} bind:value={filter} aria-label={t('lib.filterLabel')} />
    {/if}

    {#if !p.entries.length}
      <p class="empty">{@html t('lib.empty')}</p>
    {/if}

    {#each groups as [group, items] (group)}
      <h3>{group || t('lib.songs')}</h3>
      <ul>
        {#each items as e (e.path)}
          <li class:current={e.path === p.currentPath}>
            <div class="what">
              <span class="t">{e.title}</span>
              <span class="path">{e.path}</span>
            </div>
            <button
              onclick={() => {
                p.onOpen(e.path);
                dialog.close();
              }}>{t('lib.open')}</button
            >
            <button
              onclick={() => {
                p.onAdd(e.path);
                dialog.close();
              }}
              title={t('lib.addTip')}>{t('lib.add')}</button
            >
          </li>
        {/each}
      </ul>
    {/each}
  </div>
</dialog>

<style>
  dialog {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 0;
    background: var(--panel);
    color: var(--text);
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100dvh - 64px);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
  .inner {
    padding: 12px 16px 16px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .hint {
    margin: 4px 0 10px;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .inner :global(code) {
    font-family: var(--mono);
    font-size: 0.9em;
  }
  .filter {
    width: 100%;
    margin-bottom: 4px;
  }
  .empty {
    color: var(--muted);
  }
  h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 14px 0 4px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 8px;
  }
  li:hover {
    background: var(--panel-2);
  }
  li.current {
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .t {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .path {
    font-size: 0.75rem;
    color: var(--muted);
    font-family: var(--mono);
  }
  li button {
    padding: 4px 10px;
    font-size: 0.85rem;
  }
</style>
