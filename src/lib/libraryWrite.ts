import { t } from './i18n.svelte';

/** Saving into songs/ only works under `npm run dev`; the deployed site downloads files instead. */
export const CAN_WRITE = import.meta.env.DEV;

export type WriteResult = { ok: true } | { ok: false; exists: true } | { ok: false; exists: false; error: string };

export async function writeSong(path: string, text: string, overwrite = false): Promise<WriteResult> {
  try {
    const res = await fetch('/__songs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Beats': '1' },
      body: JSON.stringify({ path, text, overwrite }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) return { ok: false, exists: true };
    return { ok: false, exists: false, error: body.error ?? `HTTP ${res.status}` };
  } catch {
    return { ok: false, exists: false, error: t('write.noServer') };
  }
}

/** "Samba Reggaé 2" -> "samba-reggae-2" */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugPath(folder: string, name: string): string {
  return [...folder.split('/').map(slug), slug(name)].filter(Boolean).join('/');
}
