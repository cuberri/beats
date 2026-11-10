<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { slugPath } from '../lib/libraryWrite';

  interface Props {
    heading: string;
    /** Existing library folders, offered as suggestions. */
    folders: string[];
    defaultFolder: string;
    defaultName: string;
    note?: string;
    onSave: (path: string) => void;
    onClose: () => void;
  }
  let p: Props = $props();

  let dialog: HTMLDialogElement;
  // Initial values only; the user edits them from here.
  // svelte-ignore state_referenced_locally
  let folder = $state(p.defaultFolder);
  // svelte-ignore state_referenced_locally
  let name = $state(p.defaultName);
  const path = $derived(slugPath(folder, name));
  const valid = $derived(path.length > 0 && !path.endsWith('/') && slugPath('', name).length > 0);

  $effect(() => {
    dialog.showModal();
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!valid) return;
    p.onSave(path);
    dialog.close();
  }
</script>

<dialog bind:this={dialog} onclose={p.onClose}>
  <form onsubmit={submit}>
    <h2>{p.heading}</h2>
    {#if p.note}<p class="note">{p.note}</p>{/if}

    <label>
      {t('save.folder')}
      <input bind:value={folder} list="lib-folders" placeholder={t('save.topLevelPh')} autocomplete="off" />
      <datalist id="lib-folders">
        {#each p.folders as f (f)}<option value={f}></option>{/each}
      </datalist>
    </label>
    <div class="chips">
      <button type="button" class="chip" class:sel={folder === ''} onclick={() => (folder = '')}>{t('save.topLevel')}</button>
      {#each p.folders as f (f)}
        <button type="button" class="chip" class:sel={folder === f} onclick={() => (folder = f)}>{f}</button>
      {/each}
    </div>

    <label>
      {t('save.name')}
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={name} required autofocus autocomplete="off" />
    </label>

    <p class="path">songs/<b>{valid ? path : '…'}</b>.txt</p>

    <div class="buttons">
      <button type="button" onclick={() => dialog.close()}>{t('cancel')}</button>
      <button type="submit" class="primary" disabled={!valid}>{t('save')}</button>
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
    width: min(440px, calc(100vw - 32px));
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
  form {
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  label input {
    color: var(--text);
    font-size: 1rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: -4px;
  }
  .chip {
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.8rem;
    background: var(--panel-2);
  }
  .chip.sel {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }
  .path {
    margin: 0;
    font-family: var(--mono);
    font-size: 0.85rem;
    color: var(--muted);
    word-break: break-all;
  }
  .path b {
    color: var(--text);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
