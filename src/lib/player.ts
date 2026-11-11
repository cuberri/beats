import { INSTRUMENT_BY_ID, findStroke, type InstrumentId } from './instruments';
import { REST, meterOf, ticksPerBeat, type ArrItem, type Song } from './song';
import { Synth } from './synth';

export interface PlayerState {
  playing: boolean;
  /** 'song' = following the arrangement, 'loop' = playing one section on its own. */
  mode: 'song' | 'loop';
  /** In 'loop' mode: the section plays once and stops instead of repeating. */
  once: boolean;
  /** In 'loop' mode: the only bar being played (0-based), or null for the whole section. */
  onlyBar: number | null;
  /** Arrangement item index (song mode) currently sounding. */
  itemIdx: number;
  /** Arrangement item queued to start at the next bar line. */
  pendingIdx: number | null;
  /** Section queued to start looping at the next bar line (loop mode). */
  pendingLoop: string | null;
  /** Section and position currently sounding: `step` ticks into the section, `res` ticks per beat. */
  section: string | null;
  step: number;
  res: number;
  /** Which pass of the current item (0-based). */
  pass: number;
}

interface Cursor {
  itemIdx: number;
  pass: number;
  bar: number;
  /** Tick within the bar, on the section's finest grid (ticksPerBeat). */
  step: number;
}

interface Tick {
  time: number;
  itemIdx: number;
  section: string;
  step: number;
  res: number;
  pass: number;
}

const LOOKAHEAD = 0.12; // seconds of audio scheduled in advance
const TIMER_MS = 25;

export class Player {
  private ctx: AudioContext | null = null;
  private synth: Synth | null = null;
  private song: Song;
  private program: ArrItem[] = [];
  private mode: 'song' | 'loop' = 'song';
  private cur: Cursor = { itemIdx: 0, pass: 0, bar: 0, step: 0 };
  /** Time of the next step on the straight (un-swung) grid. */
  private nextTime = 0;
  private pendingIdx: number | null = null;
  private pendingLoop: string | null = null;
  /** Play only this bar of the section (loop mode), or null. */
  private onlyBar: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private ticks: Tick[] = [];
  private endAt: number | null = null;
  private shown: Tick | null = null;
  /** Bumped on every start and stop, so a start still waiting for the audio can tell it was overtaken. */
  private run = 0;

  muted = new Set<string>();
  soloed = new Set<string>();
  click = false;

  constructor(
    song: Song,
    private onState: (s: PlayerState) => void,
  ) {
    this.song = song;
  }

  setSong(song: Song) {
    this.song = song;
    if (this.mode === 'song') this.program = song.arrangement;
  }

  get playing() {
    return this.timer !== null;
  }

  private async audio(): Promise<AudioContext> {
    if (!this.ctx) {
      // Lets iOS play sound even with the silent switch on.
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.synth = new Synth(this.ctx);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  /** Play a single stroke right now (used when editing the grid). */
  async preview(instrument: InstrumentId, char: string) {
    if (char === REST) return;
    const ctx = await this.audio();
    const s = findStroke(INSTRUMENT_BY_ID[instrument], char);
    if (s) this.synth!.play(instrument, s, ctx.currentTime + 0.005);
  }

  /** Follow the arrangement from item `idx`. */
  async playSong(idx = 0) {
    this.stopTimers();
    this.mode = 'song';
    this.program = this.song.arrangement;
    this.onlyBar = null;
    await this.begin(idx);
  }

  /** Loop a single section forever. */
  playLoop(section: string) {
    return this.playSection(section, true);
  }

  /** Play one section on its own, right away: once, or until stopped. With `bar`, only that bar. */
  async playSection(section: string, loop: boolean, bar: number | null = null) {
    this.stopTimers();
    this.mode = 'loop';
    this.program = [{ section, repeat: loop ? Infinity : 1 }];
    this.onlyBar = bar;
    await this.begin(0, bar ?? 0);
  }

  /** While a section plays on its own: keep repeating it, or stop at the end of this pass. */
  setSectionLoop(loop: boolean) {
    if (!this.playing || this.mode !== 'loop' || !this.program[0]) return;
    this.program = [{ ...this.program[0], repeat: loop ? Infinity : this.cur.pass + 1 }];
    this.emit();
  }

  /** While playing: jump to arrangement item `idx` at the next bar line. */
  queueItem(idx: number) {
    if (!this.playing) return void this.playSong(idx);
    // From loop mode, this leaves the loop at the bar line and picks up the arrangement.
    this.pendingLoop = null;
    this.pendingIdx = this.pendingIdx === idx ? null : idx;
    this.emit();
  }

  /** While playing: switch the loop to another section at the next bar line. */
  queueLoop(section: string) {
    if (!this.playing) return void this.playLoop(section);
    this.pendingIdx = null;
    this.pendingLoop = this.pendingLoop === section ? null : section;
    this.emit();
  }

  /** Leave the current item (e.g. an endless groove) at the next bar line. */
  next() {
    if (!this.playing || this.mode !== 'song') return;
    this.queueItem(this.shown ? this.shown.itemIdx + 1 : this.cur.itemIdx + 1);
  }

  stop() {
    this.run++;
    this.stopTimers();
    this.ticks = [];
    this.shown = null;
    this.pendingIdx = null;
    this.pendingLoop = null;
    this.emit();
  }

  private stopTimers() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    cancelAnimationFrame(this.raf);
    this.endAt = null;
  }

  private async begin(idx: number, bar = 0) {
    const run = ++this.run;
    const ctx = await this.audio();
    // Started again or stopped while the audio was starting: leave it to the newer call.
    if (run !== this.run) return;
    this.stopTimers();
    this.cur = { itemIdx: idx, pass: 0, bar, step: 0 };
    this.pendingIdx = null;
    this.pendingLoop = null;
    this.ticks = [];
    this.shown = null;
    this.endAt = null;
    if (!this.settle()) return this.stop();
    this.nextTime = ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), TIMER_MS);
    this.schedule();
    const frame = () => {
      this.updateDisplay();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Skip items that no longer exist. Returns false when we ran off the end. */
  private settle(): boolean {
    while (this.cur.itemIdx < this.program.length) {
      const it = this.program[this.cur.itemIdx];
      if (it && it.repeat > 0 && this.song.sections.some((s) => s.name === it.section)) return true;
      this.cur = { itemIdx: this.cur.itemIdx + 1, pass: 0, bar: 0, step: 0 };
    }
    return false;
  }

  private schedule() {
    const ctx = this.ctx!;
    if (this.endAt !== null) {
      if (ctx.currentTime >= this.endAt) this.stop();
      return;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.nextTime);
      if (!this.advance()) {
        this.endAt = this.nextTime;
        return;
      }
    }
  }

  private playStep(gridTime: number) {
    const song = this.song;
    const item = this.program[this.cur.itemIdx];
    const sec = item && song.sections.find((s) => s.name === item.section);
    if (!sec) return;
    // The section is played on its finest grid (e.g. 12 ticks per beat when lines use 3 and 4);
    // each line sounds on the ticks that fall on its own steps.
    const m = meterOf(song, sec);
    const res = ticksPerBeat(song, sec);
    const beatDur = 60 / song.tempo;
    const beat = this.cur.bar * m.beats + Math.floor(this.cur.step / res);
    const sub = this.cur.step % res;

    const anySolo = this.soloed.size > 0;
    let changed = sub === 0;
    for (const tr of sec.tracks) {
      const d = tr.subdiv ?? m.subdiv;
      const every = res / d;
      if (sub % every) continue;
      changed = true;
      if (anySolo ? !this.soloed.has(tr.label) : this.muted.has(tr.label)) continue;
      const j = sub / every;
      const ch = tr.steps[beat * d + j];
      if (!ch || ch === REST) continue;
      // Swing pushes every second step back, up to a third of a step. Not on lines split in
      // three, which are already ternary.
      const swung = d % 2 === 0 && j % 2 === 1;
      const t = gridTime + (swung ? (song.swing / 100) * (beatDur / d / 3) : 0);
      const s = findStroke(INSTRUMENT_BY_ID[tr.instrument], ch);
      if (s) this.synth!.play(tr.instrument, s, t);
    }
    if (this.click && sub === 0) this.synth!.click(gridTime, this.cur.step === 0);

    if (changed)
      this.ticks.push({
        time: gridTime,
        itemIdx: this.mode === 'song' ? this.cur.itemIdx : -1,
        section: sec.name,
        step: this.cur.bar * m.beats * res + this.cur.step,
        res,
        pass: this.cur.pass,
      });
  }

  /** Move the cursor one tick. Returns false at the end of the song. */
  private advance(): boolean {
    const song = this.song;
    const c = this.cur;
    const item = this.program[c.itemIdx];
    const sec = song.sections.find((s) => s.name === item?.section);
    // Each section plays in its own time signature; the beat (tempo) stays the same.
    const m = meterOf(song, sec);
    const res = ticksPerBeat(song, sec);
    this.nextTime += 60 / song.tempo / res;
    c.step++;
    if (c.step < m.beats * res) return true;

    // Bar line. When playing a single bar, it is both the first and the last bar.
    c.step = 0;
    c.bar++;
    const only = this.onlyBar !== null && sec ? Math.min(this.onlyBar, sec.bars - 1) : null;
    if (!sec || c.bar >= (only !== null ? only + 1 : sec.bars)) {
      c.bar = only ?? 0;
      c.pass++;
      if (!item || c.pass >= item.repeat) {
        c.itemIdx++;
        c.pass = 0;
      }
    }
    if (this.pendingLoop !== null) {
      this.mode = 'loop';
      this.program = [{ section: this.pendingLoop, repeat: Infinity }];
      this.onlyBar = null;
      this.cur = { itemIdx: 0, pass: 0, bar: 0, step: 0 };
      this.pendingLoop = null;
      this.emit();
    } else if (this.pendingIdx !== null) {
      this.mode = 'song';
      this.program = song.arrangement;
      this.onlyBar = null;
      this.cur = { itemIdx: this.pendingIdx, pass: 0, bar: 0, step: 0 };
      this.pendingIdx = null;
      this.emit();
    }
    return this.settle();
  }

  private updateDisplay() {
    const now = this.ctx!.currentTime;
    let latest: Tick | null = null;
    while (this.ticks.length && this.ticks[0].time <= now) latest = this.ticks.shift()!;
    if (latest) {
      this.shown = latest;
      this.emit();
    }
  }

  private emit() {
    const s = this.shown;
    this.onState({
      playing: this.playing,
      mode: this.mode,
      once: this.mode === 'loop' && this.program[0]?.repeat !== Infinity,
      onlyBar: this.mode === 'loop' ? this.onlyBar : null,
      itemIdx: s?.itemIdx ?? -1,
      pendingIdx: this.pendingIdx,
      pendingLoop: this.pendingLoop,
      section: s?.section ?? null,
      step: s?.step ?? -1,
      res: s?.res ?? 1,
      pass: s?.pass ?? 0,
    });
  }
}
