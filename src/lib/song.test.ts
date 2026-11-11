import { describe, expect, it } from 'vitest';
import { EMPTY_SONG } from './newSong';
import { TEST_SONG } from './testSong';
import { applyTrackOrder, barHasNotes, importIntoSection, importSections, changeMeter, deleteBar, duplicateBar, changeSectionMeter, changeTrackSubdiv, formatSteps, meterOf, ticksPerBeat, trackMeter, moveSection, moveTrack, parse, renameSection, resizeSection, serialize } from './song';
import { resolveInstrument } from './instruments';

describe('parse', () => {
  it('parses the test song without issues', () => {
    const { song, issues } = parse(TEST_SONG);
    expect(issues).toEqual([]);
    expect(song.title).toBe('Test song');
    expect(song.tempo).toBe(100);
    expect(song.swing).toBe(15);
    expect(song.sections.map((s) => [s.name, s.bars, s.tracks.length])).toEqual([
      ['call', 1, 1],
      ['groove', 1, 5],
      ['break1', 2, 5],
    ]);
    expect(song.arrangement).toEqual([
      { section: 'call', repeat: 1 },
      { section: 'groove', repeat: Infinity },
      { section: 'break1', repeat: 1 },
      { section: 'groove', repeat: 4 },
    ]);
    const fundo1 = song.sections[1].tracks[0];
    expect(fundo1.steps.join('')).toBe('m...X...m...X...');
  });

  it('round-trips through serialize', () => {
    for (const src of [TEST_SONG, EMPTY_SONG]) {
      const a = parse(src).song;
      const b = parse(serialize(a));
      expect(b.issues).toEqual([]);
      expect(b.song).toEqual(a);
    }
  });

  it('pads short lines and infers bars', () => {
    const { song, issues } = parse('[g]\ncaixa: x.x.\nrepi: ' + 'x'.repeat(20));
    expect(issues).toEqual([]);
    expect(song.sections[0].bars).toBe(2);
    expect(song.sections[0].tracks[0].steps).toHaveLength(32);
  });

  it('reports truncation, unknown strokes and unknown instruments', () => {
    const { song, issues } = parse('[g] bars=1\ncaixa: ' + 'x'.repeat(18) + '\nrepi: xq\nbanjo: x\narrangement: g, nope');
    expect(song.sections[0].tracks[0].steps).toHaveLength(16);
    expect(issues.map((i) => i.line)).toEqual([2, 3, 4, 5]);
  });

  it('loops a lone section by default', () => {
    expect(parse('[g]\nfundo1: x').song.arrangement).toEqual([{ section: 'g', repeat: Infinity }]);
  });

  it('accepts inf, ∞ and loop', () => {
    const { song } = parse('[a]\nrepi: x\n[b]\nrepi: x\narrangement: a*inf, b*∞, a * loop, b*3');
    expect(song.arrangement.map((a) => a.repeat)).toEqual([Infinity, Infinity, Infinity, 3]);
  });
});

describe('instruments', () => {
  it('resolves labels by alias prefix', () => {
    expect(resolveInstrument('fundo1')).toBe('fundo1');
    expect(resolveInstrument('Fundo 2')).toBe('fundo2');
    expect(resolveInstrument('dobra 2')).toBe('dobra');
    expect(resolveInstrument('surdo1')).toBeNull(); // old names are gone
    expect(resolveInstrument('Repi lead')).toBe('repi');
    expect(resolveInstrument('Repique')).toBe('repi');
    expect(resolveInstrument('Agogô')).toBeNull(); // not modelled for now
    expect(resolveInstrument('banjo')).toBeNull();
  });
});

describe('editing', () => {
  it('renames sections and updates the arrangement', () => {
    const { song } = parse(TEST_SONG);
    expect(renameSection(song, 'groove', 'main')).toBe(true);
    expect(song.arrangement.filter((a) => a.section === 'main')).toHaveLength(2);
    expect(renameSection(song, 'main', 'call')).toBe(false);
  });

  it('resizes sections', () => {
    const { song } = parse(TEST_SONG);
    resizeSection(song, song.sections[1], 2);
    expect(song.sections[1].tracks.every((t) => t.steps.length === 32)).toBe(true);
  });
});

describe('old library links', () => {
  it('reports "[name] = path" and keeps the section, empty', () => {
    const { song, issues } = parse('[main] = grooves/basic   # old style\narrangement: main*loop\n');
    expect(issues.map((i) => i.line)).toEqual([1]);
    expect(issues[0].message).toMatch(/no longer supported/);
    expect(song.sections).toEqual([{ name: 'main', bars: 1, tracks: [] }]);
  });
});

describe('importing sections', () => {
  const pattern = parse(
    'subdiv: 3\n[groove]\nfundo1: X.. ... X.. ...\ncaixa: x.x x.x x.x x.x\n[break] bars=2\nrepi: X.. ... ... ... | X.. ... ... ...\n',
  ).song;

  it('copies the chosen sections and instruments, with the file\'s time signature', () => {
    const { song } = parse('[groove]\nfundo1: X... .... .... ....\n');
    const n = importSections(song, pattern, ['groove', 'break'], ['caixa', 'repi'], 'virgule');
    // groove keeps only its caixa line; break keeps its repi line
    expect(n).toBe(2);
    expect(song.sections.map((x) => x.name)).toEqual(['groove', 'groove2', 'break']);
    expect(song.sections[1].tracks.map((t) => t.label)).toEqual(['caixa']);
    expect(song.sections[1]).toMatchObject({ beats: 4, subdiv: 3, bars: 1 });
    expect(song.sections[2].bars).toBe(2);
    // a real copy: changing the import leaves the pattern alone
    song.sections[1].tracks[0].steps[0] = 'X';
    expect(pattern.sections[0].tracks[1].steps[0]).toBe('x');
    expect(parse(serialize(song)).issues).toEqual([]);
  });

  it('skips sections left with no line, and names a single section after the file', () => {
    const { song } = parse('[a]\nrepi: x...\n');
    expect(importSections(song, pattern, ['groove', 'break'], ['fundo1'], 'virgule')).toBe(1);
    expect(song.sections.map((x) => x.name)).toEqual(['a', 'groove']);
    const one = parse('[only]\nrepi: X...\n').song;
    importSections(song, one, ['only'], ['repi'], 'repique-virgule');
    expect(song.sections.at(-1)!.name).toBe('repique-virgule');
  });
});

describe('importing lines into a section', () => {
  const pattern = parse(
    "beats: 2\nsubdiv: 3\n[virgule]\ncaixa: x.x X.x\nrepi lead: X.. ...\n",
  ).song;
  const from = pattern.sections[0];

  it('replaces the matching line, repeated to fill the section, with its own steps per beat', () => {
    const { song } = parse('[groove] bars=2\nfundo1: X... .... .... .... | X... .... .... ....\ncaixa: xxxx xxxx xxxx xxxx | xxxx xxxx xxxx xxxx\n');
    const sec = song.sections[0];
    const r = importIntoSection(song, sec, pattern, from, ['caixa']);
    expect(r).toEqual({ replaced: ['caixa'], added: [] });
    expect(sec.tracks.map((t) => t.label)).toEqual(['fundo1', 'caixa']);
    expect(sec.tracks[1].subdiv).toBe(3);
    // 2 beats of pattern repeated over 2 bars of 4 beats
    expect(sec.tracks[1].steps.join('')).toBe('x.xX.x'.repeat(4));
    const again = parse(serialize(song));
    expect(again.issues).toEqual([]);
    expect(again.song.sections[0].tracks[1].steps.join('')).toBe('x.xX.x'.repeat(4));
  });

  it('adds lines the section lacks, and drops its own subdiv when the grids agree', () => {
    const { song } = parse('subdiv: 3\n[a] beats=3\ncaixa {subdiv=4}: xxxx xxxx xxxx\n');
    const sec = song.sections[0];
    const r = importIntoSection(song, sec, pattern, from, ['caixa', 'repi']);
    expect(r).toEqual({ replaced: ['caixa'], added: ['repi lead'] });
    expect(sec.tracks[0].subdiv).toBeUndefined();
    expect(sec.tracks[0].steps.join('')).toBe('x.xX.xx.x');
    expect(sec.tracks[1].steps.join('')).toBe("X.....X..");
  });
});

describe('bars', () => {
  const src = 'tempo: 100\n[a] bars=2\nfundo1: X... .... .... .... | m... .... .... ....\ncaixa {subdiv=3}: x.. ... ... ... | g.. ... ... ...\n';

  it('duplicates a bar right after itself, per line subdivision', () => {
    const { song } = parse(src);
    const a = song.sections[0];
    expect(duplicateBar(song, a, 0)).toBe(true);
    expect(a.bars).toBe(3);
    expect(a.tracks[0].steps.join('')).toBe('X...............X...............m...............');
    expect(a.tracks[1].steps.join('')).toBe('x...........x...........g...........');
    const again = parse(serialize(song));
    expect(again.issues).toEqual([]);
    expect(again.song).toEqual(song);
  });

  it('deletes a bar and keeps at least one', () => {
    const { song } = parse(src);
    const a = song.sections[0];
    expect(barHasNotes(song, a, 0)).toBe(true);
    expect(deleteBar(song, a, 0)).toBe(true);
    expect(a.bars).toBe(1);
    expect(a.tracks[0].steps.join('')).toBe('m...............');
    expect(a.tracks[1].steps.join('')).toBe('g...........');
    expect(deleteBar(song, a, 0)).toBe(false);
    expect(a.bars).toBe(1);
  });

  it('stops at 64 bars', () => {
    const { song } = parse('[a] bars=64\nfundo1: X...\n');
    expect(duplicateBar(song, song.sections[0], 0)).toBe(false);
    expect(song.sections[0].bars).toBe(64);
  });
});

describe('section order', () => {
  it('moves a section and keeps the arrangement', () => {
    const { song } = parse(TEST_SONG);
    const before = serialize(song);
    moveSection(song, 0, 2); // call after break1
    expect(song.sections.map((x) => x.name)).toEqual(['groove', 'break1', 'call']);
    expect(song.arrangement.map((a) => a.section)).toEqual(['call', 'groove', 'break1', 'groove']);
    const text = serialize(song);
    expect(text.indexOf('[call]')).toBeGreaterThan(text.indexOf('[break1]'));
    moveSection(song, 2, 0);
    expect(serialize(song)).toBe(before);
  });

  it('ignores moves past either end', () => {
    const { song } = parse(TEST_SONG);
    moveSection(song, 0, -1);
    moveSection(song, 2, 3);
    expect(song.sections.map((x) => x.name)).toEqual(['call', 'groove', 'break1']);
  });
});

describe('track order', () => {
  it('moves a track', () => {
    const { song } = parse(TEST_SONG);
    const g = song.sections[1];
    moveTrack(g, 4, 0); // repi to the top
    expect(g.tracks.map((t) => t.label).slice(0, 3)).toEqual(['repi', 'fundo1', 'fundo2']);
    moveTrack(g, 0, 4);
    expect(g.tracks.at(-1)!.label).toBe('repi');
  });

  it('applies one section order to the others, keeping extra lines after', () => {
    const { song } = parse('[a]\nrepi: x\ncaixa: x\nfundo1: x\n[b]\nfundo1: x\nrepi 2: x\ncaixa: x\nrepi: x\n[c] = x/y');
    applyTrackOrder(song, song.sections[0]);
    expect(song.sections[1].tracks.map((t) => t.label)).toEqual(['repi', 'caixa', 'fundo1', 'repi 2']);
  });
});

describe('language', () => {
  it('reports problems in the chosen language', async () => {
    const { setLang } = await import('./i18n.svelte');
    const text = 'title: x\n[a]\nbongo: x...\n';
    setLang('fr');
    expect(parse(text).issues[0].message).toBe('Instrument inconnu « bongo »');
    setLang('en');
    expect(parse(text).issues[0].message).toBe('Unknown instrument "bongo"');
  });
});

describe('changeMeter', () => {
  const base = (body: string) => parse(`title: x\n[a] bars=1\n${body}\n`).song;

  it('moves sixteenths onto triplets', () => {
    const s = base('caixa: X..x x.x. X... ..xg');
    const lost = changeMeter(s, 4, 3);
    expect(lost).toBe(1); // the last beat's x and g share a step
    expect(formatSteps(s, s.sections[0].tracks[0].steps)).toBe('X.x x.x X.. ..x');
    expect(serialize(s)).toContain('subdiv: 3');
  });

  it('goes back from triplets without losing anything', () => {
    const s = parse('title: x\nsubdiv: 3\n[a]\ncaixa: X.x x.x X.x xxx\n').song;
    expect(changeMeter(s, 4, 4)).toBe(0);
    expect(formatSteps(s, s.sections[0].tracks[0].steps)).toBe('X..x x..x X..x xx.x');
  });

  it('drops or adds beats per bar', () => {
    const s = parse('title: x\n[a]\nfundo1: x... x... x... x... | x... x... x... x...\n').song;
    expect(changeMeter(s, 3, 4)).toBe(2);
    expect(s.sections[0].tracks[0].steps.length).toBe(2 * 12);
  });

  it('leaves sections with their own time signature alone', () => {
    const s = parse('title: x\n[a]\ncaixa: x.x. x.x. x.x. x.x.\n[b] subdiv=3\ncaixa: x.x x.x x.x x.x\n').song;
    expect(changeMeter(s, 2, 4)).toBe(4); // only [a] loses its last two beats
    expect(s.sections[1].tracks[0].steps.length).toBe(12);
    expect(serialize(s)).toContain('[b] bars=1 beats=4 subdiv=3');
  });
});

describe('section time signature', () => {
  const text = 'title: x\n[groove]\nfundo1: x... x... x... x...\n[break] bars=2 subdiv=3\ncaixa: X.x x.x X.x x.x\n';

  it('reads, plays and writes a section in its own time signature', () => {
    const { song, issues } = parse(text);
    expect(issues).toEqual([]);
    expect(meterOf(song, song.sections[0])).toEqual({ beats: 4, subdiv: 4 });
    expect(meterOf(song, song.sections[1])).toEqual({ beats: 4, subdiv: 3 });
    expect(song.sections[1].tracks[0].steps).toHaveLength(24);
    expect(serialize(song)).toContain('[break] bars=2 subdiv=3\ncaixa: X.x x.x X.x x.x | ... ... ... ...');
    expect(parse(serialize(song)).song).toEqual(song);
  });

  it('switches one section and back', () => {
    const { song } = parse(text);
    expect(changeSectionMeter(song, song.sections[0], { beats: 4, subdiv: 3 })).toBe(0);
    expect(song.sections[0]).toMatchObject({ beats: 4, subdiv: 3 });
    expect(changeSectionMeter(song, song.sections[0], null)).toBe(0);
    expect(song.sections[0].subdiv).toBeUndefined();
    expect(formatSteps(meterOf(song, song.sections[0]), song.sections[0].tracks[0].steps)).toBe(
      'x... x... x... x...',
    );
  });
});

describe('line subdivision', () => {
  const text = 'title: x\n[g] bars=1\nfundo1:           m... X... m... X...\ncaixa {subdiv=3}: X.x x.x X.x x.x\n';

  it('reads, pads and writes a line with its own steps per beat', () => {
    const { song, issues } = parse(text);
    expect(issues).toEqual([]);
    const [surdo, caixa] = song.sections[0].tracks;
    expect(surdo.subdiv).toBeUndefined();
    expect(caixa).toMatchObject({ label: 'caixa', subdiv: 3 });
    expect(caixa.steps).toHaveLength(12);
    expect(ticksPerBeat(song, song.sections[0])).toBe(12);
    expect(serialize(song)).toContain('caixa {subdiv=3}: X.x x.x X.x x.x');
    expect(parse(serialize(song)).song).toEqual(song);
  });

  it('measures bars on each line’s own grid', () => {
    const { song } = parse('[g]\ncaixa {subdiv=3}: x.. x.. x.. x.. x\n');
    expect(song.sections[0].bars).toBe(2);
    expect(song.sections[0].tracks[0].steps).toHaveLength(24);
  });

  it('switches a line to triplets and back', () => {
    const { song } = parse(text);
    const sec = song.sections[0];
    expect(changeTrackSubdiv(song, sec, 0, 3)).toBe(0);
    expect(formatSteps(trackMeter(meterOf(song, sec), sec.tracks[0]), sec.tracks[0].steps)).toBe('m.. X.. m.. X..');
    expect(changeTrackSubdiv(song, sec, 1, null)).toBe(0);
    expect(sec.tracks[1].subdiv).toBeUndefined();
    expect(sec.tracks[1].steps).toHaveLength(16);
  });

  it('keeps a line’s own split when the section changes time signature', () => {
    const { song } = parse(text);
    changeSectionMeter(song, song.sections[0], { beats: 3, subdiv: 4 });
    expect(song.sections[0].tracks[1]).toMatchObject({ subdiv: 3 });
    expect(song.sections[0].tracks[1].steps).toHaveLength(9);
  });

  it('reports unknown line options', () => {
    expect(parse('[g]\ncaixa {swing=40}: x...\n').issues[0].message).toMatch(/line option/);
  });
});
