import { describe, expect, it } from 'vitest';
import { TEST_SONG } from './testSong';
import type { PlayerState } from './player';
import { computeProgress, passLabel } from './progress';
import { parse } from './song';

const song = parse(TEST_SONG).song; // call, groove*loop, break1 (2 bars), groove*4
const base: PlayerState = {
  playing: true,
  mode: 'song',
  once: false,
  itemIdx: 0,
  pendingIdx: null,
  pendingLoop: null,
  section: 'call',
  step: 0,
  res: 4,
  pass: 0,
};

describe('computeProgress', () => {
  it('is null when stopped', () => {
    expect(computeProgress(song, { ...base, playing: false })).toBeNull();
  });

  it('counts passes and bars for a repeated part', () => {
    // groove*4, third pass, last step of the bar
    const p = computeProgress(song, { ...base, itemIdx: 3, section: 'groove', pass: 2, step: 15 })!;
    expect(passLabel(p)).toBe('3/4');
    expect(p.fraction).toBe(0.75);
    expect(p.next).toBeNull(); // last part
  });

  it('tracks bars inside a multi-bar part and says what comes next', () => {
    const p = computeProgress(song, { ...base, itemIdx: 2, section: 'break1', step: 20 })!;
    expect([p.bar, p.bars]).toEqual([1, 2]);
    expect(p.next).toEqual({ section: 'groove', queued: false, onNext: false });
  });

  it('shows pass number and per-pass progress for looping parts', () => {
    const p = computeProgress(song, { ...base, itemIdx: 1, section: 'groove', pass: 6, step: 7 })!;
    expect(passLabel(p)).toBe('7');
    expect(p.fraction).toBe(0.5);
    expect(p.next).toEqual({ section: 'break1', queued: false, onNext: true });
  });

  it('prefers the queued part', () => {
    const p = computeProgress(song, { ...base, itemIdx: 1, section: 'groove', pendingIdx: 0 })!;
    expect(p.next).toEqual({ section: 'call', queued: true, onNext: false });
  });

  it('handles loop mode', () => {
    const p = computeProgress(song, { ...base, mode: 'loop', itemIdx: -1, section: 'break1', pass: 1, step: 3 })!;
    expect(p.itemIdx).toBe(-1);
    expect(p.repeat).toBe(Infinity);
    expect(p.next).toBeNull();
  });
});
