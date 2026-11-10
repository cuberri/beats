export type InstrumentId =
  | 'fundo1'
  | 'fundo2'
  | 'dobra'
  | 'caixa'
  | 'repi';

/** What kind of sound a stroke makes; the synth switches on this. */
export type StrokeKind = 'open' | 'mute' | 'hit' | 'ghost' | 'rim' | 'slap';

export interface StrokeDef {
  char: string;
  label: string;
  kind: StrokeKind;
  /** 0..1 loudness */
  vel: number;
}

export interface InstrumentDef {
  id: InstrumentId;
  name: string;
  /** Names accepted as the start of a track label (normalized: lowercase, no accents/spaces). The first is the default label. */
  aliases: string[];
  hue: number;
  strokes: StrokeDef[];
  /** Order strokes appear in when tapping a grid cell repeatedly. */
  cycle: string[];
  /** Extra characters accepted in text and mapped to a real stroke. */
  charAliases?: Record<string, string>;
}

const surdoStrokes: StrokeDef[] = [
  { char: 'X', label: 'open, accent', kind: 'open', vel: 1 },
  { char: 'x', label: 'open', kind: 'open', vel: 0.7 },
  { char: 'm', label: 'muted', kind: 'mute', vel: 0.7 },
];

const hitStrokes: StrokeDef[] = [
  { char: 'X', label: 'accent', kind: 'hit', vel: 1 },
  { char: 'x', label: 'hit', kind: 'hit', vel: 0.55 },
];

export const INSTRUMENTS: InstrumentDef[] = [
  {
    id: 'fundo1',
    name: 'Fundo 1',
    aliases: ['fundo1'],
    hue: 265,
    strokes: surdoStrokes,
    cycle: ['x', 'X', 'm'],
  },
  {
    id: 'fundo2',
    name: 'Fundo 2',
    aliases: ['fundo2'],
    hue: 245,
    strokes: surdoStrokes,
    cycle: ['x', 'X', 'm'],
  },
  {
    id: 'dobra',
    name: 'Dobra',
    aliases: ['dobra'],
    hue: 220,
    strokes: surdoStrokes,
    cycle: ['x', 'X', 'm'],
  },
  {
    id: 'caixa',
    name: 'Caixa',
    aliases: ['caixa', 'tarol', 'snare'],
    hue: 15,
    strokes: [...hitStrokes, { char: 'g', label: 'ghost', kind: 'ghost', vel: 0.25 }],
    cycle: ['x', 'X', 'g'],
  },
  {
    id: 'repi',
    name: 'Repinique',
    aliases: ['repi', 'repinique', 'repique'],
    hue: 350,
    strokes: [
      ...hitStrokes,
      { char: 'r', label: 'rim', kind: 'rim', vel: 0.8 },
      { char: 's', label: 'slap', kind: 'slap', vel: 0.85 },
    ],
    cycle: ['x', 'X', 'r', 's'],
  },
];

export const INSTRUMENT_BY_ID: Record<InstrumentId, InstrumentDef> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.id, i]),
) as Record<InstrumentId, InstrumentDef>;

export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const ALIAS_TABLE = INSTRUMENTS.flatMap((inst) => inst.aliases.map((a) => ({ alias: a, id: inst.id }))).sort(
  (a, b) => b.alias.length - a.alias.length,
);

/** "Repi lead" -> repi, "Fundo 2" -> fundo2. Longest alias prefix wins. */
export function resolveInstrument(label: string): InstrumentId | null {
  const n = normalizeName(label);
  for (const { alias, id } of ALIAS_TABLE) if (n.startsWith(alias)) return id;
  return null;
}

export function findStroke(inst: InstrumentDef, ch: string): StrokeDef | null {
  const exact = inst.strokes.find((s) => s.char === ch);
  if (exact) return exact;
  const mapped = inst.charAliases?.[ch];
  return mapped ? (inst.strokes.find((s) => s.char === mapped) ?? null) : null;
}
