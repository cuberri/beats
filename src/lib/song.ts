import { t as msg } from './i18n.svelte';
import { INSTRUMENT_BY_ID, findStroke, resolveInstrument, type InstrumentId } from './instruments';

export const REST = '.';
const REST_CHARS = new Set(['.', '-', '_']);

export interface Track {
  /** As written by the user, e.g. "repi lead". Unique within a section. */
  label: string;
  instrument: InstrumentId;
  /** Own steps per beat (e.g. 3 for triplets over a square section); unset = the section's. */
  subdiv?: number;
  /** One entry per step: a stroke char or REST. */
  steps: string[];
}

export interface Section {
  name: string;
  bars: number;
  tracks: Track[];
  /** Own time signature; unset = the song's. */
  beats?: number;
  subdiv?: number;
}

/** Beats per bar and steps per beat. */
export interface Meter {
  beats: number;
  subdiv: number;
}

export interface ArrItem {
  section: string;
  /** Number of passes; Infinity = loop until told otherwise. */
  repeat: number;
}

export interface Song {
  title: string;
  tempo: number;
  /** 0..100, delays the off-beat steps. */
  swing: number;
  /** Beats per bar. */
  beats: number;
  /** Steps per beat. */
  subdiv: number;
  sections: Section[];
  arrangement: ArrItem[];
}

export interface ParseIssue {
  line: number;
  message: string;
}

export function stepsPerBar(m: Meter): number {
  return m.beats * m.subdiv;
}

/** The time signature a section plays in. */
export function meterOf(song: Song, sec: Section | undefined): Meter {
  return { beats: sec?.beats ?? song.beats, subdiv: sec?.subdiv ?? song.subdiv };
}

/** A line's grid: the section's beats, and its own steps per beat if it has them. */
export function trackMeter(m: Meter, t: Pick<Track, 'subdiv'>): Meter {
  return { beats: m.beats, subdiv: t.subdiv ?? m.subdiv };
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Finest grid that holds every line of a section: ticks per beat (e.g. 12 when lines use 3 and 4). */
export function ticksPerBeat(song: Song, sec: Section | undefined): number {
  const m = meterOf(song, sec);
  return (sec?.tracks ?? []).reduce((acc, t) => {
    const d = t.subdiv ?? m.subdiv;
    return (acc * d) / gcd(acc, d);
  }, m.subdiv);
}

/** Steps of a line that follows the section's grid. */
export function sectionSteps(song: Song, sec: Section): number {
  return sec.bars * stepsPerBar(meterOf(song, sec));
}

const HEADER_KEYS = new Set(['title', 'tempo', 'bpm', 'swing', 'beats', 'subdiv', 'arrangement']);

function clampInt(v: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

interface RawSection {
  name: string;
  bars: number | null;
  beats?: number;
  subdiv?: number;
  tracks: (Track & { line: number })[];
  line: number;
}

export function parse(text: string): { song: Song; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const song: Song = { title: 'Untitled', tempo: 100, swing: 0, beats: 4, subdiv: 4, sections: [], arrangement: [] };
  const raw: RawSection[] = [];
  let current: RawSection | null = null;
  let arrangement: { value: string; line: number } | null = null;

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const lineNo = i + 1;
    // "#" starts a comment at the start of a line or after a space ("file#section" is not a comment).
    const line = rawLine.replace(/(^|\s)#.*$/, '').trim();
    if (!line) return;

    const header = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (header) {
      const name = header[1].trim();
      if (raw.some((s) => s.name === name)) issues.push({ line: lineNo, message: msg('parse.sectionTwice', { name }) });
      const link = header[2].match(/^=\s*(.+)$/);
      current = { name, bars: null, tracks: [], line: lineNo };
      raw.push(current);
      if (link) {
        // Sections used to be able to point at a library file. Patterns are now imported (copied) instead.
        issues.push({ line: lineNo, message: msg('parse.linkRemoved', { name, ref: link[1].trim() }) });
        return;
      }
      for (const m of header[2].matchAll(/(\w+)\s*=\s*(\S+)/g)) {
        const opt = m[1].toLowerCase();
        if (opt === 'bars') current.bars = clampInt(m[2], 1, 64, 1);
        else if (opt === 'beats') current.beats = clampInt(m[2], 1, 16, 4);
        else if (opt === 'subdiv') current.subdiv = clampInt(m[2], 1, 8, 4);
        else issues.push({ line: lineNo, message: msg('parse.unknownOption', { name: m[1] }) });
      }
      return;
    }

    const colon = line.indexOf(':');
    if (colon < 0) {
      issues.push({ line: lineNo, message: msg('parse.expectedKV') });
      return;
    }
    let key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    // Line options: "caixa {subdiv=3}: ..."
    let trackSubdiv: number | undefined;
    const opts = key.match(/\{([^}]*)\}\s*$/);
    if (opts) {
      key = key.slice(0, opts.index).trim();
      for (const m of opts[1].matchAll(/(\w+)\s*=\s*(\S+)/g)) {
        if (m[1].toLowerCase() === 'subdiv') trackSubdiv = clampInt(m[2], 1, 8, 4);
        else issues.push({ line: lineNo, message: msg('parse.unknownLineOption', { name: m[1] }) });
      }
    }
    const lkey = key.toLowerCase();

    if (HEADER_KEYS.has(lkey)) {
      switch (lkey) {
        case 'title':
          song.title = value || 'Untitled';
          break;
        case 'tempo':
        case 'bpm':
          song.tempo = clampInt(value, 30, 300, song.tempo);
          break;
        case 'swing':
          song.swing = clampInt(value.replace('%', ''), 0, 100, 0);
          break;
        case 'beats':
          song.beats = clampInt(value, 1, 16, 4);
          break;
        case 'subdiv':
          song.subdiv = clampInt(value, 1, 8, 4);
          break;
        case 'arrangement':
          arrangement = { value, line: lineNo };
          break;
      }
      return;
    }

    const instrument = resolveInstrument(key);
    if (!instrument) {
      issues.push({ line: lineNo, message: msg('parse.unknownInstrument', { name: key }) });
      return;
    }
    if (!current) {
      current = { name: 'main', bars: null, tracks: [], line: lineNo };
      raw.push(current);
    }
    const sec: RawSection = current;
    if (sec.tracks.some((t) => t.label === key)) {
      issues.push({ line: lineNo, message: msg('parse.labelTwice', { label: key, name: sec.name }) });
      return;
    }
    const inst = INSTRUMENT_BY_ID[instrument];
    const steps: string[] = [];
    const bad = new Set<string>();
    for (const ch of value) {
      if (/\s|\|/.test(ch)) continue;
      if (REST_CHARS.has(ch)) steps.push(REST);
      else {
        const s = findStroke(inst, ch);
        if (s) steps.push(s.char);
        else {
          bad.add(ch);
          steps.push(REST);
        }
      }
    }
    if (bad.size)
      issues.push({
        line: lineNo,
        message: msg('parse.badStrokes', {
          inst: inst.name,
          bad: [...bad].join('", "'),
          ok: inst.strokes.map((s) => s.char).join(' '),
        }),
      });
    sec.tracks.push({
      label: key,
      instrument,
      ...(trackSubdiv !== undefined ? { subdiv: trackSubdiv } : {}),
      steps,
      line: lineNo,
    });
  });

  for (const r of raw) {
    // A section that sets either value has its own time signature (the other comes from the song).
    const own = r.beats !== undefined || r.subdiv !== undefined;
    const meter: Partial<Meter> = own ? { beats: r.beats ?? song.beats, subdiv: r.subdiv ?? song.subdiv } : {};
    const secMeter = { beats: r.beats ?? song.beats, subdiv: r.subdiv ?? song.subdiv };
    // Length in bars comes from the longest line, each measured on its own grid.
    const longest = Math.max(0, ...r.tracks.map((t) => t.steps.length / stepsPerBar(trackMeter(secMeter, t))));
    const bars = r.bars ?? Math.max(1, Math.ceil(longest));
    song.sections.push({
      name: r.name,
      bars,
      ...meter,
      tracks: r.tracks.map(({ line, ...t }) => {
        const len = bars * stepsPerBar(trackMeter(secMeter, t));
        if (t.steps.length > len)
          issues.push({ line, message: msg('parse.tooLong', { label: t.label, n: t.steps.length, name: r.name, len }) });
        const steps = t.steps.slice(0, len);
        while (steps.length < len) steps.push(REST);
        return { ...t, steps };
      }),
    });
  }

  if (arrangement) {
    const { value, line } = arrangement as { value: string; line: number };
    for (const part of value.split(',')) {
      const p = part.trim();
      if (!p) continue;
      const m = p.match(/^(.+?)\s*(?:[*×]\s*(\S+))?$/)!;
      const name = m[1].trim();
      let repeat = 1;
      if (m[2]) {
        const r = m[2].toLowerCase();
        if (r === 'loop' || r === 'inf' || r === '∞') repeat = Infinity;
        else {
          repeat = clampInt(r, 1, 999, NaN);
          if (Number.isNaN(repeat)) {
            issues.push({ line, message: msg('parse.badRepeat', { value: m[2], name }) });
            repeat = 1;
          }
        }
      }
      if (!song.sections.some((s) => s.name === name)) {
        issues.push({ line, message: msg('parse.unknownSection', { name }) });
        continue;
      }
      song.arrangement.push({ section: name, repeat });
    }
  } else {
    song.arrangement = song.sections.map((s) => ({
      section: s.name,
      repeat: song.sections.length === 1 ? Infinity : 1,
    }));
  }

  issues.sort((a, b) => a.line - b.line);
  return { song, issues };
}

export function formatRepeat(r: number): string {
  return r === Infinity ? 'loop' : String(r);
}

export function formatSteps(m: Meter, steps: string[]): string {
  const spb = stepsPerBar(m);
  let out = '';
  steps.forEach((s, i) => {
    if (i > 0) {
      if (i % spb === 0) out += ' | ';
      else if (i % m.subdiv === 0) out += ' ';
    }
    out += s;
  });
  return out;
}

export function serialize(song: Song): string {
  const lines: string[] = [`title: ${song.title}`, `tempo: ${song.tempo}`, `swing: ${song.swing}`];
  if (song.beats !== 4) lines.push(`beats: ${song.beats}`);
  if (song.subdiv !== 4) lines.push(`subdiv: ${song.subdiv}`);

  for (const sec of song.sections) {
    const m = meterOf(song, sec);
    let head = `[${sec.name}] bars=${sec.bars}`;
    if (m.beats !== song.beats) head += ` beats=${m.beats}`;
    if (m.subdiv !== song.subdiv) head += ` subdiv=${m.subdiv}`;
    lines.push('', head);
    const names = sec.tracks.map((t) =>
      t.subdiv !== undefined && t.subdiv !== m.subdiv ? `${t.label} {subdiv=${t.subdiv}}:` : `${t.label}:`,
    );
    const width = Math.max(0, ...names.map((n) => n.length));
    sec.tracks.forEach((t, i) => lines.push(`${names[i].padEnd(width)} ${formatSteps(trackMeter(m, t), t.steps)}`));
  }

  if (song.arrangement.length) {
    lines.push(
      '',
      'arrangement: ' +
        song.arrangement.map((a) => (a.repeat === 1 ? a.section : `${a.section}*${formatRepeat(a.repeat)}`)).join(', '),
    );
  }
  return lines.join('\n') + '\n';
}

/* ---------- editing helpers (mutate the song passed in) ---------- */

export function resizeSection(song: Song, sec: Section, bars: number) {
  sec.bars = Math.max(1, Math.min(64, Math.round(bars)));
  for (const t of sec.tracks) {
    const len = sec.bars * stepsPerBar(trackMeter(meterOf(song, sec), t));
    t.steps = t.steps.slice(0, len);
    while (t.steps.length < len) t.steps.push(REST);
  }
}

/**
 * Copy sections of another file (a pattern or a song) into `song`, keeping only the given
 * instruments. Each copy keeps the file's time signature and gets a free name: a file with a single
 * section names it after the file (`baseName`). Sections left with no line are skipped.
 * The copies are independent: later changes to the file don't affect them.
 * @returns how many sections were added.
 */
export function importSections(
  song: Song,
  source: Song,
  names: string[],
  instruments: InstrumentId[],
  baseName: string,
): number {
  let n = 0;
  for (const sec of source.sections) {
    if (!names.includes(sec.name)) continue;
    const tracks = sec.tracks.filter((tr) => instruments.includes(tr.instrument));
    if (!tracks.length) continue;
    song.sections.push({
      name: uniqueName(
        song.sections.map((x) => x.name),
        source.sections.length > 1 ? sec.name : baseName,
      ),
      bars: sec.bars,
      ...meterOf(source, sec),
      tracks: structuredClone(tracks),
    });
    n++;
  }
  return n;
}

/**
 * Where imported lines go in `sec`: for each source line, the line it replaces (same label, else the
 * first not-yet-taken line of the same instrument), or null when it is added.
 */
export function importMatches(sec: Section, tracks: Track[]): (Track | null)[] {
  const taken = new Set<Track>();
  return tracks.map((src) => {
    const t =
      sec.tracks.find((x) => !taken.has(x) && x.label === src.label && x.instrument === src.instrument) ??
      sec.tracks.find((x) => !taken.has(x) && x.instrument === src.instrument) ??
      null;
    if (t) taken.add(t);
    return t;
  });
}

/**
 * Copy the lines of `from` (a section of `source`) for the given instruments into the existing section
 * `sec`. Each line replaces the matching one (see importMatches) or is added; it keeps its steps per
 * beat and is repeated beat by beat to fill the section, whatever their lengths.
 * @returns the labels of the lines replaced and added.
 */
export function importIntoSection(
  song: Song,
  sec: Section,
  source: Song,
  from: Section,
  instruments: InstrumentId[],
): { replaced: string[]; added: string[] } {
  const m = meterOf(song, sec);
  const srcMeter = meterOf(source, from);
  const tracks = from.tracks.filter((tr) => instruments.includes(tr.instrument));
  const matches = importMatches(sec, tracks);
  const out = { replaced: [] as string[], added: [] as string[] };
  tracks.forEach((src, i) => {
    const subdiv = trackMeter(srcMeter, src).subdiv;
    const len = sec.bars * m.beats * subdiv;
    const steps = Array.from({ length: len }, (_, j) => src.steps[j % src.steps.length] ?? REST);
    let t = matches[i];
    if (t) out.replaced.push(t.label);
    else {
      t = { label: uniqueName(sec.tracks.map((x) => x.label), src.label), instrument: src.instrument, steps: [] };
      sec.tracks.push(t);
      out.added.push(t.label);
    }
    t.steps = steps;
    if (subdiv === m.subdiv) delete t.subdiv;
    else t.subdiv = subdiv;
  });
  return out;
}

/** Steps of one line in bar `bar` (0-based): [start, end). */
function barRange(song: Song, sec: Section, t: Track, bar: number): [number, number] {
  const n = stepsPerBar(trackMeter(meterOf(song, sec), t));
  return [bar * n, (bar + 1) * n];
}

/** Insert a copy of bar `bar` right after it; later bars move right. False at the 64-bar limit. */
export function duplicateBar(song: Song, sec: Section, bar: number): boolean {
  if (bar < 0 || bar >= sec.bars || sec.bars >= 64) return false;
  for (const t of sec.tracks) {
    const [a, b] = barRange(song, sec, t, bar);
    t.steps.splice(b, 0, ...t.steps.slice(a, b));
  }
  sec.bars++;
  return true;
}

/** Remove bar `bar`; later bars move left. A section keeps at least one bar. */
export function deleteBar(song: Song, sec: Section, bar: number): boolean {
  if (bar < 0 || bar >= sec.bars || sec.bars <= 1) return false;
  for (const t of sec.tracks) {
    const [a, b] = barRange(song, sec, t, bar);
    t.steps.splice(a, b - a);
  }
  sec.bars--;
  return true;
}

/** Whether any line plays in bar `bar`. */
export function barHasNotes(song: Song, sec: Section, bar: number): boolean {
  return sec.tracks.some((t) => {
    const [a, b] = barRange(song, sec, t, bar);
    return t.steps.slice(a, b).some((c) => c !== REST);
  });
}

/** Common meters offered in the app, as beats per bar × steps per beat. */
export const METERS: { label: string; beats: number; subdiv: number }[] = [
  { label: '4/4', beats: 4, subdiv: 4 },
  { label: '2/4', beats: 2, subdiv: 4 },
  { label: '3/4', beats: 3, subdiv: 4 },
  { label: '6/8', beats: 2, subdiv: 3 },
  { label: '12/8', beats: 4, subdiv: 3 },
];

/**
 * Move notes from one time signature's grid to another's. Each beat keeps its place in the bar and
 * each note goes to the nearest step; beats past the new bar length are dropped, new beats are silent.
 * @returns the new steps and how many notes were dropped (two notes on one step, or beats cut off).
 */
export function convertSteps(steps: string[], bars: number, from: Meter, to: Meter): { steps: string[]; lost: number } {
  const out: string[] = Array(bars * stepsPerBar(to)).fill(REST);
  let lost = 0;
  steps.forEach((ch, i) => {
    if (ch === REST) return;
    const bar = Math.floor(i / stepsPerBar(from));
    const beat = Math.floor(i / from.subdiv) % from.beats;
    const pos = Math.min(to.subdiv - 1, Math.round(((i % from.subdiv) * to.subdiv) / from.subdiv));
    const j = (bar * to.beats + beat) * to.subdiv + pos;
    if (beat >= to.beats || out[j] !== REST) lost++;
    else out[j] = ch;
  });
  return { steps: out, lost };
}

function convertSection(sec: Section, from: Meter, to: Meter): number {
  if (from.beats === to.beats && from.subdiv === to.subdiv) return 0;
  let lost = 0;
  for (const t of sec.tracks) {
    // Lines with their own steps per beat keep them; only the beats change for them.
    const r = convertSteps(t.steps, sec.bars, trackMeter(from, t), trackMeter(to, t));
    t.steps = r.steps;
    lost += r.lost;
  }
  return lost;
}

/**
 * Change the song's time signature. Sections that follow it are converted; sections with their own
 * keep theirs.
 * @returns how many notes were dropped.
 */
export function changeMeter(song: Song, beats: number, subdiv: number): number {
  const before = song.sections.map((sec) => meterOf(song, sec));
  song.beats = beats;
  song.subdiv = subdiv;
  return song.sections.reduce((lost, sec, i) => lost + convertSection(sec, before[i], meterOf(song, sec)), 0);
}

/**
 * Give one section its own time signature (or the song's again, when `to` is null).
 * @returns how many notes were dropped.
 */
export function changeSectionMeter(song: Song, sec: Section, to: Meter | null): number {
  const from = meterOf(song, sec);
  const target = to ?? { beats: song.beats, subdiv: song.subdiv };
  if (to && (to.beats !== song.beats || to.subdiv !== song.subdiv)) {
    sec.beats = to.beats;
    sec.subdiv = to.subdiv;
  } else {
    delete sec.beats;
    delete sec.subdiv;
  }
  return convertSection(sec, from, target);
}

/**
 * Give one line its own steps per beat (or the section's again, when `subdiv` is null).
 * @returns how many notes were dropped.
 */
export function changeTrackSubdiv(song: Song, sec: Section, ti: number, subdiv: number | null): number {
  const m = meterOf(song, sec);
  const t = sec.tracks[ti];
  const from = trackMeter(m, t);
  if (subdiv === null || subdiv === m.subdiv) delete t.subdiv;
  else t.subdiv = subdiv;
  const r = convertSteps(t.steps, sec.bars, from, trackMeter(m, t));
  t.steps = r.steps;
  return r.lost;
}

export function uniqueName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}${i}`)) i++;
  return `${base}${i}`;
}

export function addTrack(song: Song, sec: Section, instrument: InstrumentId) {
  const label = uniqueName(
    sec.tracks.map((t) => t.label),
    INSTRUMENT_BY_ID[instrument].aliases[0],
  );
  sec.tracks.push({ label, instrument, steps: Array(sectionSteps(song, sec)).fill(REST) });
}

export function renameSection(song: Song, oldName: string, newName: string): boolean {
  newName = newName.replace(/[\[\],*#:]/g, '').trim();
  if (!newName || song.sections.some((s) => s.name === newName)) return false;
  const sec = song.sections.find((s) => s.name === oldName);
  if (!sec) return false;
  sec.name = newName;
  for (const a of song.arrangement) if (a.section === oldName) a.section = newName;
  return true;
}

export function deleteSection(song: Song, name: string) {
  song.sections = song.sections.filter((s) => s.name !== name);
  song.arrangement = song.arrangement.filter((a) => a.section !== name);
}

/** Move a section to another place in the list. Only the page and text order change, not playback. */
export function moveSection(song: Song, from: number, to: number) {
  const n = song.sections.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
  const [sec] = song.sections.splice(from, 1);
  song.sections.splice(to, 0, sec);
}

export function moveTrack(sec: Section, from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= sec.tracks.length || to >= sec.tracks.length) return;
  const [t] = sec.tracks.splice(from, 1);
  sec.tracks.splice(to, 0, t);
}

/**
 * Reorder the tracks of every other section to follow `source`'s order.
 * Lines that `source` doesn't have keep their relative order and go after the others.
 */
export function applyTrackOrder(song: Song, source: Section) {
  const rank = new Map(source.tracks.map((t, i) => [t.label, i]));
  for (const sec of song.sections) {
    if (sec === source) continue;
    sec.tracks = sec.tracks
      .map((t, i) => ({ t, k: rank.get(t.label) ?? rank.size + i }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.t);
  }
}
