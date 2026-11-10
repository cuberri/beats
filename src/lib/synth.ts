import type { InstrumentId, StrokeDef } from './instruments';

/**
 * Every sound is generated on the fly from oscillators and a white-noise buffer.
 * Nothing realistic: just enough character to tell the instruments apart.
 */
export class Synth {
  readonly out: GainNode;
  private noiseBuf: AudioBuffer;

  constructor(private ctx: AudioContext) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(comp);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.out);
    return g;
  }

  private tone(
    t: number,
    o: { type?: OscillatorType; f0: number; f1?: number; glide?: number; gain: number; decay: number; attack?: number },
  ) {
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? 0.05));
    const attack = o.attack ?? 0.002;
    osc.connect(this.env(t, o.gain, attack, o.decay));
    osc.start(t);
    osc.stop(t + attack + o.decay + 0.05);
  }

  private noise(
    t: number,
    o: { filter: BiquadFilterType; freq: number; q?: number; gain: number; decay: number; attack?: number },
  ) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = o.filter;
    f.frequency.value = o.freq;
    f.Q.value = o.q ?? 0.7;
    const attack = o.attack ?? 0.001;
    src.connect(f).connect(this.env(t, o.gain, attack, o.decay));
    // random offset so consecutive hits don't sound identical
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + o.decay + 0.05);
  }

  private surdo(t: number, f: number, s: StrokeDef) {
    const v = s.vel;
    if (s.kind === 'mute') {
      this.tone(t, { f0: f * 1.8, f1: f * 1.1, glide: 0.03, gain: 0.7 * v, decay: 0.09 });
      this.noise(t, { filter: 'lowpass', freq: 600, gain: 0.35 * v, decay: 0.03 });
    } else {
      this.tone(t, { f0: f * 2.2, f1: f, glide: 0.07, gain: 1.0 * v, decay: 0.9 });
      this.tone(t, { f0: f * 3.1, f1: f * 1.5, glide: 0.07, gain: 0.15 * v, decay: 0.25 });
      this.noise(t, { filter: 'lowpass', freq: 900, gain: 0.3 * v, decay: 0.025 });
    }
  }

  play(inst: InstrumentId, s: StrokeDef, t: number) {
    const v = s.vel;
    switch (inst) {
      case 'fundo1':
        return this.surdo(t, 52, s);
      case 'fundo2':
        return this.surdo(t, 62, s);
      case 'dobra':
        return this.surdo(t, 78, s);
      case 'caixa':
        this.noise(t, { filter: 'highpass', freq: 1800, gain: 0.55 * v, decay: s.kind === 'ghost' ? 0.06 : 0.14 });
        this.noise(t, { filter: 'bandpass', freq: 5000, q: 1, gain: 0.35 * v, decay: 0.08 });
        this.tone(t, { type: 'triangle', f0: 240, f1: 180, gain: 0.25 * v, decay: 0.06 });
        return;
      case 'repi':
        if (s.kind === 'rim') {
          this.noise(t, { filter: 'highpass', freq: 3000, gain: 0.6 * v, decay: 0.03 });
          this.tone(t, { type: 'square', f0: 1300, gain: 0.08 * v, decay: 0.025 });
          this.tone(t, { type: 'triangle', f0: 420, f1: 360, gain: 0.3 * v, decay: 0.1 });
        } else if (s.kind === 'slap') {
          this.noise(t, { filter: 'bandpass', freq: 1800, q: 0.8, gain: 0.9 * v, decay: 0.08 });
          this.tone(t, { type: 'triangle', f0: 330, f1: 280, gain: 0.3 * v, decay: 0.05 });
        } else {
          this.tone(t, { type: 'triangle', f0: 400, f1: 310, glide: 0.04, gain: 0.55 * v, decay: 0.28 });
          this.noise(t, { filter: 'bandpass', freq: 3000, q: 1, gain: 0.35 * v, decay: 0.035 });
        }
        return;
    }
  }

  click(t: number, downbeat: boolean) {
    this.tone(t, { type: 'square', f0: downbeat ? 1800 : 1200, gain: 0.12, decay: 0.03 });
  }
}
