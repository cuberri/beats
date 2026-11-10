import type { PlayerState } from './player';
import { meterOf, type Song } from './song';

/** Where playback is, in terms people read: part, pass, bar, and how far through the part. */
export interface Progress {
  section: string;
  /** Arrangement item index, or -1 when looping a single section. */
  itemIdx: number;
  /** 0-based */
  pass: number;
  /** Infinity for looping parts. */
  repeat: number;
  /** 0-based */
  bar: number;
  bars: number;
  /** 0..1 through the whole part (all passes); through the current pass for looping parts. */
  fraction: number;
  /** What plays after this part, if known. */
  next: { section: string; queued: boolean; onNext: boolean } | null;
}

export function computeProgress(song: Song, ps: PlayerState): Progress | null {
  if (!ps.playing || !ps.section || ps.step < 0) return null;
  const sec = song.sections.find((s) => s.name === ps.section);
  if (!sec) return null;
  // ps.step counts ticks, ps.res ticks per beat.
  const spb = meterOf(song, sec).beats * ps.res;
  const total = sec.bars * spb;
  const inSong = ps.mode === 'song' && ps.itemIdx >= 0;
  // A section played on its own once ends with the current pass.
  const repeat = inSong ? (song.arrangement[ps.itemIdx]?.repeat ?? 1) : ps.once ? ps.pass + 1 : Infinity;
  const done = ps.step + 1;
  const fraction = Math.min(1, repeat === Infinity ? done / total : (ps.pass * total + done) / (repeat * total));

  let next: Progress['next'] = null;
  if (ps.pendingLoop !== null) next = { section: ps.pendingLoop, queued: true, onNext: false };
  else if (ps.pendingIdx !== null && song.arrangement[ps.pendingIdx])
    next = { section: song.arrangement[ps.pendingIdx].section, queued: true, onNext: false };
  else if (inSong && song.arrangement[ps.itemIdx + 1])
    next = { section: song.arrangement[ps.itemIdx + 1].section, queued: false, onNext: repeat === Infinity };

  return {
    section: sec.name,
    itemIdx: inSong ? ps.itemIdx : -1,
    pass: ps.pass,
    repeat,
    bar: Math.floor(ps.step / spb),
    bars: sec.bars,
    fraction,
    next,
  };
}

/** "2/4" for counted parts, "3" (pass number) for looping ones. */
export function passLabel(p: Progress): string {
  return p.repeat === Infinity ? String(p.pass + 1) : `${p.pass + 1}/${p.repeat}`;
}
