/**
 * Bornes de lecture (§1.12, « Bornes de lecture » ; §4.10, règles 4 et 6) : taille,
 * profondeur, nœuds après expansion des alias, alias circulaire, clé dupliquée.
 */
import { describe, expect, it } from 'vitest';
import {
  BOUND_MESSAGES,
  MAX_EXPANDED_TEXT,
  MAX_NESTING_DEPTH,
  MAX_NODES,
  MAX_READ_BYTES,
  exceedsReadBytes,
  jsonExceedsDepth,
  measureStructure,
} from '../../../src/ingest/bounds.js';
import { parseFrontmatter } from '../../../src/ingest/frontmatter.js';

/** `levels` tableaux imbriqués, l'intérieur vide. */
function nest(levels: number, inner: unknown = []): unknown {
  let value = inner;
  for (let i = 1; i < levels; i++) value = [value];
  return value;
}

/** Arbre partagé de la bombe de la spec : `levels` niveaux de neuf références au niveau précédent. */
function sharedBomb(levels: number): unknown {
  let value: unknown = Array(9).fill('x');
  for (let i = 1; i < levels; i++) value = Array(9).fill(value);
  return value;
}

describe('measureStructure', () => {
  it('une valeur sans collection est sûre', () => {
    for (const value of ['x', 3, null, undefined, true]) expect(measureStructure(value)).toBeNull();
  });

  it('32 collections imbriquées passent, 33 non', () => {
    expect(measureStructure(nest(MAX_NESTING_DEPTH))).toBeNull();
    expect(measureStructure(nest(MAX_NESTING_DEPTH + 1))).toBe('depth');
  });

  it('un scalaire ne compte pas dans la profondeur', () => {
    expect(measureStructure(nest(MAX_NESTING_DEPTH, ['x']))).toBeNull();
    expect(measureStructure({ a: nest(MAX_NESTING_DEPTH - 1, 'x') })).toBeNull();
    expect(measureStructure({ a: nest(MAX_NESTING_DEPTH, 'x') })).toBeNull();
    expect(measureStructure({ a: nest(MAX_NESTING_DEPTH + 1, 'x') })).toBe('depth');
  });

  it('un objet partagé compte à chaque profondeur où il apparaît', () => {
    const deep = nest(20);
    const root = { shallow: deep, later: nest(14, deep) };
    expect(measureStructure(root)).toBe('depth');
    expect(measureStructure({ shallow: deep, later: nest(12, deep) })).toBeNull();
  });

  it('compte les nœuds de l\'arbre développé, non ceux de la structure partagée', () => {
    // 10, 91, 820, 7 381, 66 430, 597 871 nœuds : six niveaux de neuf références.
    expect(measureStructure(sharedBomb(5))).toBeNull();
    expect(measureStructure(sharedBomb(6))).toBe('nodes');
  });

  it('refuse en quelques millisecondes une bombe de 9^10 nœuds', () => {
    const bomb = sharedBomb(10);
    const started = performance.now();
    expect(measureStructure(bomb)).toBe('nodes');
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('la limite est de 100 000 nœuds, tableau et scalaires compris', () => {
    expect(measureStructure(Array(MAX_NODES - 1).fill('x'))).toBeNull();
    expect(measureStructure(Array(MAX_NODES).fill('x'))).toBe('nodes');
  });

  it('une clé de mapping compte pour un nœud, comme sa valeur', () => {
    const keys = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, 'x']));
    expect(measureStructure(keys((MAX_NODES - 1) / 2))).toBeNull();
    expect(measureStructure(keys(MAX_NODES / 2))).toBe('nodes');
  });

  it('un alias circulaire est refusé, direct ou par un descendant', () => {
    const direct: unknown[] = [];
    direct.push(direct);
    const indirect: Record<string, unknown> = { child: { grandchild: [] } };
    ((indirect.child as Record<string, unknown>).grandchild as unknown[]).push(indirect);
    expect(measureStructure(direct)).toBe('circular');
    expect(measureStructure(indirect)).toBe('circular');
  });

  it('un objet partagé sans cycle n\'est pas circulaire', () => {
    const shared = { w: 1 };
    expect(measureStructure({ a: shared, b: [shared, shared] })).toBeNull();
  });

  it('une date ou un binaire est un scalaire', () => {
    expect(measureStructure({ at: new Date(), blob: new Uint8Array(1_000_000) })).toBeNull();
  });

  it('`maxNodes: Infinity` ne borne que la profondeur', () => {
    expect(measureStructure(Array(MAX_NODES * 2).fill('x'), { maxNodes: Infinity })).toBeNull();
    expect(measureStructure(nest(MAX_NESTING_DEPTH + 1), { maxNodes: Infinity })).toBe('depth');
  });
});

describe('exceedsReadBytes', () => {
  it('compte des octets UTF-8, pas des unités UTF-16', () => {
    expect(exceedsReadBytes('x'.repeat(MAX_READ_BYTES))).toBe(false);
    expect(exceedsReadBytes('x'.repeat(MAX_READ_BYTES + 1))).toBe(true);
    const euros = '€'.repeat(Math.floor(MAX_READ_BYTES / 3));
    expect(euros.length).toBeLessThan(MAX_READ_BYTES);
    expect(exceedsReadBytes(euros)).toBe(false);
    expect(exceedsReadBytes(`${euros}€`)).toBe(true);
    expect(exceedsReadBytes('😀'.repeat(MAX_READ_BYTES / 4 + 1))).toBe(true);
  });

  it('mesure des octets sans les décoder', () => {
    expect(exceedsReadBytes(new Uint8Array(MAX_READ_BYTES))).toBe(false);
    expect(exceedsReadBytes(new Uint8Array(MAX_READ_BYTES + 1))).toBe(true);
  });
});

describe('jsonExceedsDepth', () => {
  const deep = (levels: number) => `{"a":${'['.repeat(levels - 1)}${']'.repeat(levels - 1)}}`;

  it('32 niveaux passent, 33 non — la racine compte pour 1', () => {
    expect(jsonExceedsDepth(deep(MAX_NESTING_DEPTH))).toBe(false);
    expect(jsonExceedsDepth(deep(MAX_NESTING_DEPTH + 1))).toBe(true);
  });

  it('les crochets d\'une chaîne ne comptent pas, guillemet échappé compris', () => {
    const brackets = '[{'.repeat(100);
    expect(jsonExceedsDepth(`{"a":"${brackets}"}`)).toBe(false);
    expect(jsonExceedsDepth(`{"a":"x\\"${brackets}\\\\"}`)).toBe(false);
    expect(jsonExceedsDepth(`{"a":"x\\"","b":${deep(MAX_NESTING_DEPTH)}}`)).toBe(true);
  });

  it('s\'arrête à l\'imbrication de trop sans lire la suite', () => {
    const started = performance.now();
    expect(jsonExceedsDepth('['.repeat(MAX_READ_BYTES))).toBe(true);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

const doc = (yaml: string) => `---\n${yaml}\n---\ncorps\n`;

/** Bombe de la spec : dix niveaux d'alias de neuf éléments, 9^10 nœuds une fois développée. */
function yamlBomb(levels: number): string {
  const names = 'abcdefghijklmnopqrstuvwxyz';
  const lines = [`a: &a [${Array(9).fill('"x"').join(',')}]`];
  for (let i = 1; i < levels; i++) {
    lines.push(`${names[i]}: &${names[i]} [${Array(9).fill(`*${names[i - 1]}`).join(',')}]`);
  }
  return lines.join('\n');
}

describe('parseFrontmatter — bornes de lecture (§1.12)', () => {
  it('refuse la bombe de la spec en quelques millisecondes, sans la développer', () => {
    const started = performance.now();
    const result = parseFrontmatter(doc(`title: T\n${yamlBomb(10)}`));
    expect(performance.now() - started).toBeLessThan(100);
    expect(result).toEqual({ status: 'invalid', reason: BOUND_MESSAGES.nodes });
  });

  it('ne borne pas le nombre d\'alias mais l\'arbre développé qu\'ils produisent', () => {
    const result = parseFrontmatter(doc(`title: T\n${yamlBomb(4)}`));
    expect(result.status).toBe('ok');
    const many = ['base: &b [1]', ...Array.from({ length: 1000 }, (_, i) => `k${i}: *b`)];
    expect(parseFrontmatter(doc(many.join('\n'))).status).toBe('ok');
  });

  it('la limite de nœuds s\'applique sans aucun alias', () => {
    const flat = (count: number) => doc(`a: [${Array(count).fill(1).join(',')}]`);
    // racine, clé `a`, séquence : trois nœuds avant les éléments.
    expect(parseFrontmatter(flat(MAX_NODES - 3)).status).toBe('ok');
    expect(parseFrontmatter(flat(MAX_NODES - 2))).toEqual({ status: 'invalid', reason: BOUND_MESSAGES.nodes });
  });

  it('32 collections passent, 33 non — en flux comme en bloc, racine comprise', () => {
    const flow = (levels: number) => doc(`deep: ${'['.repeat(levels - 1)}${']'.repeat(levels - 1)}`);
    const block = (levels: number) =>
      doc(Array.from({ length: levels }, (_, i) => `${'  '.repeat(i)}k${i}:${i === levels - 1 ? ' 1' : ''}`).join('\n'));
    for (const build of [flow, block]) {
      expect(parseFrontmatter(build(MAX_NESTING_DEPTH)).status).toBe('ok');
      expect(parseFrontmatter(build(MAX_NESTING_DEPTH + 1)).status).toBe('invalid');
    }
  });

  it('une imbrication démesurée est refusée sans épuiser la pile', () => {
    const result = parseFrontmatter(doc(`deep: ${'['.repeat(100_000)}${']'.repeat(100_000)}`));
    expect(result.status).toBe('invalid');
  });

  it('la profondeur se mesure aussi à travers les alias : une chaîne d\'ancres ne la contourne pas', () => {
    const chain = (anchors: number) => {
      const lines = ['a0: &a0 [x]'];
      for (let i = 1; i < anchors; i++) lines.push(`a${i}: &a${i} [*a${i - 1}]`);
      return doc(lines.join('\n'));
    };
    // `a30` compte 31 collections, plus la racine : 32.
    expect(parseFrontmatter(chain(MAX_NESTING_DEPTH - 1)).status).toBe('ok');
    expect(parseFrontmatter(chain(MAX_NESTING_DEPTH))).toEqual({ status: 'invalid', reason: BOUND_MESSAGES.depth });
  });

  it('la profondeur d\'une ancre s\'ajoute à l\'endroit où elle est réutilisée', () => {
    const reuse = (nesting: number) =>
      doc(`deep: &d ${'['.repeat(20)}${']'.repeat(20)}\nlater: ${'['.repeat(nesting)}*d${']'.repeat(nesting)}`);
    // racine + 11 + 20 = 32 collections, puis 33.
    expect(parseFrontmatter(reuse(11)).status).toBe('ok');
    expect(parseFrontmatter(reuse(12))).toEqual({ status: 'invalid', reason: BOUND_MESSAGES.depth });
  });

  it('un alias qui désigne l\'un de ses ancêtres rend le YAML illisible', () => {
    for (const yaml of ['a: &a [*a]', 'a: &a {k: *a}', 'a: &a [[*a]]', 'a: &a\n  b:\n    c: *a']) {
      expect(parseFrontmatter(doc(yaml)), yaml).toEqual({ status: 'invalid', reason: BOUND_MESSAGES.circular });
    }
  });

  it('un fichier de plus de 1 Mio est illisible, quel que soit le poids de son frontmatter', () => {
    const body = 'x'.repeat(MAX_READ_BYTES);
    const result = parseFrontmatter(`---\ntitle: T\n---\n${body}`);
    expect(result).toMatchObject({ status: 'invalid' });
    expect((result as { reason: string }).reason).toContain(String(MAX_READ_BYTES));
    const prefix = '---\ntitle: T\n---\n';
    expect(parseFrontmatter(`${prefix}${'x'.repeat(MAX_READ_BYTES - prefix.length)}`).status).toBe('ok');
  });

  it('juge la taille des octets avant de les décoder', () => {
    const result = parseFrontmatter(new Uint8Array(MAX_READ_BYTES + 1).fill(0xff));
    expect(result).toMatchObject({ status: 'invalid', reason: expect.stringContaining(String(MAX_READ_BYTES)) });
  });
});

describe('parseFrontmatter — clé dupliquée (§4.10, règle 6)', () => {
  it.each([
    ['au premier niveau', 'title: A\ndate: 2024-06-15\ntitle: B'],
    ['dans un mapping imbriqué', 'title: A\niptc:\n  city: Brest\n  city: Quimper'],
    ['dans un élément de séquence', 'title: A\nfiles:\n  - url: /a.pdf\n    url: /b.pdf'],
    ['écrite entre guillemets puis nue', 'title: A\n"title": B'],
    ['en flux', 'title: A\ngps: {lat: 1, lng: 2, lat: 3}'],
    ['après un alias', 'base: &b {w: 1}\ntitle: A\nbase: *b'],
  ])('%s : le YAML est illisible', (_label, yaml) => {
    expect(parseFrontmatter(doc(yaml)).status).toBe('invalid');
  });

  it('deux clés qui ne diffèrent que par la casse sont distinctes', () => {
    expect(parseFrontmatter(doc('title: A\nTitle: B')).status).toBe('ok');
  });
});

describe('measureStructure — poids du texte après expansion des alias', () => {
  it('un alias vers une longue chaîne pèse sa longueur à chaque rencontre, sans qu\'elle soit copiée', () => {
    const long = 'a'.repeat(100_000);
    const hostile = { s: long, type: Array(30_000).fill(long) };
    const started = performance.now();
    expect(measureStructure(hostile)).toBe('weight');
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('le poids se somme à travers les ancres de collection, mémoïsées', () => {
    const level = Array(1000).fill('x'.repeat(1000));
    const nested = { a: level, b: [level, level], c: [[level, level], [level, level]] };
    expect(measureStructure(nested)).toBe('weight');
  });

  it('les clés comptent comme les valeurs', () => {
    expect(measureStructure({ ['k'.repeat(MAX_EXPANDED_TEXT)]: 1 })).toBeNull();
    expect(measureStructure({ ['k'.repeat(MAX_EXPANDED_TEXT)]: 'v' })).toBe('weight');
  });

  it('la limite est exacte : MAX_EXPANDED_TEXT caractères passent, un de plus non', () => {
    expect(measureStructure(['x'.repeat(MAX_EXPANDED_TEXT)])).toBeNull();
    expect(measureStructure(['x'.repeat(MAX_EXPANDED_TEXT), 'y'])).toBe('weight');
  });

  it('un nombre, un booléen ou une date ne pèsent rien', () => {
    expect(measureStructure(Array(MAX_NODES / 2 - 1).fill(1.5))).toBeNull();
    expect(measureStructure(Array(5000).fill(new Date(0)))).toBeNull();
  });

  it('un YAML ordinaire, même riche en alias, ne s\'en approche pas', () => {
    const many = ['base: &b [one, two]', ...Array.from({ length: 1000 }, (_, i) => `k${i}: *b`)];
    expect(parseFrontmatter(doc(many.join('\n'))).status).toBe('ok');
  });

  it('plafond de 1 Mio de texte : la borne propre au plugin n\'est jamais plus large que la lecture', () => {
    expect(MAX_EXPANDED_TEXT).toBeLessThanOrEqual(MAX_READ_BYTES);
  });
});

describe('parseFrontmatter — amplification par alias de chaîne (R3)', () => {
  const amplified = (refs: number) => `title: T\ns: &s ${'a'.repeat(100_000)}\ntype: [${Array(refs).fill('*s').join(',')}]`;

  it('190 Kio de YAML qui développent 3 Go de texte sont illisibles, en quelques millisecondes', () => {
    const started = performance.now();
    const result = parseFrontmatter(doc(amplified(30_000)));
    expect(performance.now() - started).toBeLessThan(500);
    expect(result).toEqual({ status: 'invalid', reason: BOUND_MESSAGES.weight });
  });

  it('quelques références à la même chaîne passent', () => {
    expect(parseFrontmatter(doc(amplified(5))).status).toBe('ok');
  });

  it('une liste de tags qui répète une chaîne par alias est jugée sur son poids', () => {
    const tags = `title: T\ns: &s ${'a'.repeat(100_000)}\ntags: [${Array(2500).fill('*s').join(',')}]`;
    expect(parseFrontmatter(doc(tags))).toEqual({ status: 'invalid', reason: BOUND_MESSAGES.weight });
  });
});

