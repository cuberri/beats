import { describe, expect, it } from 'vitest';
import { Player } from './player';
import { parse, type Song } from './song';

/** Run the scheduler offline and collect when each line sounds. */
function render(song: Song): { label: string; time: number }[] {
  const p = new Player(song, () => {}) as any;
  const hits: { label: string; time: number }[] = [];
  p.synth = { play: (inst: string, _s: unknown, time: number) => hits.push({ label: inst, time }), click: () => {} };
  p.program = song.arrangement;
  p.cur = { itemIdx: 0, pass: 0, bar: 0, step: 0 };
  p.nextTime = 0;
  do p.playStep(p.nextTime);
  while (p.advance());
  return hits;
}

describe('player timing', () => {
  it('keeps the beat when a section switches to a ternary time signature', () => {
    const { song } = parse(
      'tempo: 120\n[bin]\nfundo1: x... x... x... x...\n[ter] subdiv=3\nfundo1: x.. x.. x.. x..\narrangement: bin, ter\n',
    );
    const times = render(song).map((h) => h.time);
    // Two bars of 4 beats at 120 bpm: one beat every 0.5 s, all the way through.
    expect(times).toHaveLength(8);
    times.forEach((t, i) => expect(t).toBeCloseTo(i * 0.5, 6));
  });

  it('plays lines with different steps per beat against the same beat', () => {
    const { song } = parse('tempo: 120\n[g]\nfundo1: x... x... x... x...\ncaixa {subdiv=3}: xxx xxx xxx xxx\n');
    song.arrangement = [{ section: 'g', repeat: 1 }];
    const hits = render(song);
    const surdo = hits.filter((h) => h.label === 'fundo1').map((h) => h.time);
    const caixa = hits.filter((h) => h.label === 'caixa').map((h) => h.time);
    expect(surdo).toHaveLength(4);
    surdo.forEach((t, i) => expect(t).toBeCloseTo(i * 0.5, 6));
    expect(caixa).toHaveLength(12);
    caixa.forEach((t, i) => expect(t).toBeCloseTo(i * (0.5 / 3), 6));
  });

  it('swings only the lines split in two or four', () => {
    const { song } = parse('tempo: 60\nswing: 100\n[g]\ncaixa: xx.. ....\nrepi {subdiv=3}: xx. ...\n');
    song.arrangement = [{ section: 'g', repeat: 1 }];
    const hits = render(song);
    const caixa = hits.filter((h) => h.label === 'caixa').map((h) => h.time);
    const tam = hits.filter((h) => h.label === 'repi').map((h) => h.time);
    expect(caixa[1]).toBeCloseTo(0.25 + 0.25 / 3, 6); // second sixteenth pushed late
    expect(tam[1]).toBeCloseTo(1 / 3, 6); // triplet untouched
  });

  it('plays a section once, or loops it until looping is turned off', () => {
    const { song } = parse('[a]\nfundo1: x... .... .... ....\n[b]\nfundo1: x... x... x... x...\n');
    const p = new Player(song, () => {}) as any;
    let hits = 0;
    p.synth = { play: () => hits++, click: () => {} };
    const run = (until: () => boolean) => {
      do p.playStep(p.nextTime);
      while (p.advance() && !until());
    };
    p.mode = 'loop';
    p.cur = { itemIdx: 0, pass: 0, bar: 0, step: 0 };

    p.program = [{ section: 'a', repeat: 1 }]; // ▶ with loop off
    run(() => false);
    expect(hits).toBe(1);

    hits = 0;
    p.program = [{ section: 'a', repeat: Infinity }]; // ▶ with loop on
    p.cur = { itemIdx: 0, pass: 0, bar: 0, step: 0 };
    p.timer = 1; // pretend to be playing
    run(() => p.cur.pass === 3 && p.cur.step === 5);
    p.setSectionLoop(false); // during the 4th pass: finish it, then stop
    run(() => false);
    expect(hits).toBe(4);
    p.timer = null;
  });

  it('plays a single bar of a section, once or repeated', () => {
    const { song } = parse('tempo: 120\n[a] bars=3\nfundo1: x... .... .... .... | X... X... .... .... | m... .... .... ....\n');
    const p = new Player(song, () => {}) as any;
    const hits: { ch: string; time: number }[] = [];
    p.synth = { play: (_i: string, s: { char: string }, time: number) => hits.push({ ch: s.char, time }), click: () => {} };
    const run = (repeat: number) => {
      hits.length = 0;
      p.mode = 'loop';
      p.program = [{ section: 'a', repeat }];
      p.onlyBar = 1;
      p.cur = { itemIdx: 0, pass: 0, bar: 1, step: 0 };
      p.nextTime = 0;
      do p.playStep(p.nextTime);
      while (p.advance());
    };
    run(1); // bar 2 only: two accents on beats 1 and 2
    expect(hits.map((h) => h.ch)).toEqual(['X', 'X']);
    expect(hits.map((h) => h.time)).toEqual([0, 0.5]);
    run(2); // the same bar twice, back to back (one bar of 4 beats = 2 s)
    expect(hits.map((h) => h.time)).toEqual([0, 0.5, 2, 2.5]);
  });
});
