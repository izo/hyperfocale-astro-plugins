import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GUARD_POLICY,
  diffSnapshots,
  guardChangeSet,
  publishable,
  resolveGuardPolicy,
} from '../../../src/ingest/index.js';
import type { GuardPolicy, SnapshotEntry } from '../../../src/ingest/index.js';
import { entry, snapshot } from './helpers.js';

const MIB = 1_048_576;

const fm = (title: string, extra = '') => `---\ntitle: ${title}\ndate: 2024-01-01\n${extra}---\n`;
const OFF: GuardPolicy = { maxDeletedSeries: null, maxDeletedMediaRatio: null, maxMovedSeries: null, maxFileBytes: null };

type Files = Record<string, string>;

/** Diagnostics `[code, severity, path]` de la garde pour deux états de fichiers. */
async function guard(base: Files | null, target: Files, policy: GuardPolicy, tweak: (e: SnapshotEntry) => SnapshotEntry = (e) => e) {
  const build = (files: Files) => snapshot(Object.entries(files).map(([path, content]) => tweak(entry(path, content))));
  const baseSnapshot = base === null ? null : await build(base);
  const targetSnapshot = await build(target);
  const changeSet = diffSnapshots(baseSnapshot, await publishable(targetSnapshot));
  const read = async (side: 'base' | 'target', path: string) => {
    const content = (side === 'base' ? base : target)?.[path];
    if (content === undefined) throw new Error(`lecture hors fichiers : ${side} ${path}`);
    return content;
  };
  const diagnostics = await guardChangeSet(changeSet, baseSnapshot, targetSnapshot, { read, policy });
  return diagnostics.map((d) => [d.code, d.severity, d.path]);
}

/** `count` séries `s-01`… sous `root`, un média chacune, aux contenus tous distincts. */
function series(root: string, count: number, mediaPerSeries = 1): Files {
  const files: Files = {};
  for (let i = 1; i <= count; i++) {
    const name = String(i).padStart(2, '0');
    files[`${root}/s-${name}/index.md`] = fm(`s-${name}`);
    for (let m = 1; m <= mediaPerSeries; m++) files[`${root}/s-${name}/media/${m}.jpg`] = `s-${name}/${m}`;
  }
  return files;
}

describe('resolveGuardPolicy — absent = défaut, null = désactivé (§4.11, v2.17)', () => {
  it('une politique vide rend les défauts de la spec', () => {
    expect(resolveGuardPolicy({})).toEqual({
      maxDeletedSeries: 10,
      maxDeletedMediaRatio: 0.25,
      maxMovedSeries: 10,
      maxFileBytes: { content: MIB, media: null, derived: MIB, other: null },
    });
    expect(resolveGuardPolicy()).toEqual(DEFAULT_GUARD_POLICY);
  });

  it('null désactive un seuil, 0 en est un', () => {
    const policy = resolveGuardPolicy({ maxDeletedSeries: null, maxMovedSeries: 0, maxDeletedMediaRatio: 0 });
    expect(policy.maxDeletedSeries).toBeNull();
    expect(policy.maxMovedSeries).toBe(0);
    expect(policy.maxDeletedMediaRatio).toBe(0);
  });

  it('maxFileBytes : chaque classe à part, ou toutes avec null, sans toucher aux autres', () => {
    expect(resolveGuardPolicy({ maxFileBytes: { content: null } }).maxFileBytes).toEqual({
      content: null,
      media: null,
      derived: MIB,
      other: null,
    });
    expect(resolveGuardPolicy({ maxFileBytes: { media: 50 } }).maxFileBytes).toEqual({
      content: MIB,
      media: 50,
      derived: MIB,
      other: null,
    });
    expect(Object.values(resolveGuardPolicy({ maxFileBytes: null }).maxFileBytes)).toEqual([null, null, null, null]);
  });

  it('une valeur explicitement `undefined` est un seuil absent : le défaut, jamais un contrôle éteint', () => {
    const policy = resolveGuardPolicy({ maxDeletedSeries: undefined, maxFileBytes: { content: undefined } } as GuardPolicy);
    expect(policy.maxDeletedSeries).toBe(10);
    expect(policy.maxFileBytes.content).toBe(MIB);
  });

  it('une classe inconnue de maxFileBytes est ignorée ; les défauts restent actifs', () => {
    const policy = resolveGuardPolicy({ maxFileBytes: { conten: 10 } } as GuardPolicy);
    expect(policy.maxFileBytes).toEqual(DEFAULT_GUARD_POLICY.maxFileBytes);
  });

  it('accepte une politique gelée et laisse les défauts intacts', () => {
    resolveGuardPolicy(Object.freeze({ maxFileBytes: Object.freeze({ media: 1 }) }));
    expect(Object.isFrozen(DEFAULT_GUARD_POLICY) && Object.isFrozen(DEFAULT_GUARD_POLICY.maxFileBytes)).toBe(true);
    expect(DEFAULT_GUARD_POLICY.maxFileBytes.media).toBeNull();
  });

  it.each([
    ['false', { maxDeletedSeries: false }],
    ['NaN', { maxMovedSeries: Number.NaN }],
    ['un négatif', { maxDeletedSeries: -1 }],
    ['une chaîne', { maxMovedSeries: '10' }],
    ['un ratio de 25 (pour 25 %)', { maxDeletedMediaRatio: 25 }],
    ['un ratio négatif', { maxDeletedMediaRatio: -0.1 }],
    ['une taille « false »', { maxFileBytes: { content: false } }],
    ['une taille chaîne', { maxFileBytes: { media: '100' } }],
    ['une taille négative', { maxFileBytes: { derived: -5 } }],
    ['maxFileBytes numérique', { maxFileBytes: 100 }],
    ['maxFileBytes tableau', { maxFileBytes: [] }],
    ['maxFileBytes chaîne', { maxFileBytes: 'off' }],
  ])('refuse %s plutôt que de désactiver un contrôle en silence', (_label, policy) => {
    expect(() => resolveGuardPolicy(policy as unknown as GuardPolicy)).toThrow(TypeError);
  });
});

describe('guardChangeSet — seuils par défaut (§4.11, v2.17)', () => {
  it('suppression de séries : 10 passent, 11 bloquent', async () => {
    const base = { ...series('series', 13) };
    const keep = (n: number) => Object.fromEntries(Object.entries(base).filter(([path]) => Number(/s-(\d+)/.exec(path)?.[1]) > n));
    expect(await guard(base, keep(10), { maxDeletedMediaRatio: null })).toEqual([]);
    expect(await guard(base, keep(11), { maxDeletedMediaRatio: null })).toEqual([['guard-mass-deletion', 'error', '']]);
  });

  it('ratio de médias : exactement 25 % passe, au-delà bloque', async () => {
    const files = (media: number): Files => ({
      'a/index.md': fm('a'),
      ...Object.fromEntries(Array.from({ length: media }, (_, i) => [`a/media/${i + 1}.jpg`, `a${i + 1}`])),
    });
    expect(await guard(files(8), files(6), {})).toEqual([]);
    expect(await guard(files(8), files(5), {})).toEqual([['guard-mass-deletion', 'error', '']]);
  });

  it('déplacement de séries : 10 passent, 11 donnent un avertissement', async () => {
    const warn = [['guard-mass-move', 'warning', '']];
    expect(await guard(series('series', 10), series('archives', 10), {})).toEqual([]);
    expect(await guard(series('series', 11), series('archives', 11), {})).toEqual(warn);
  });

  it('fichier trop lourd : content et derived plafonnés à 1 Mio, media et other libres', async () => {
    const sized = (size: number) => (e: SnapshotEntry): SnapshotEntry => ({ ...e, size });
    const files = {
      'a/index.md': fm('a'),
      'a/index.en.md': fm('a-en'),
      'a/images.json': '{"images":[]}',
      'a/media/01.jpg': 'm',
      'a/notes/lisez-moi.txt': 'o',
    };
    const tweak = (e: SnapshotEntry) => {
      if (e.path === 'a/index.md' || e.path === 'a/images.json') return sized(MIB + 1)(e);
      if (e.path === 'a/index.en.md') return sized(MIB)(e);
      return sized(2 ** 31)(e);
    };
    expect(await guard(null, files, {}, tweak)).toEqual([
      ['guard-oversize', 'error', 'a/images.json'],
      ['guard-oversize', 'error', 'a/index.md'],
    ]);
  });

  it('un plafond ajouté sur une classe ne désactive pas le défaut des autres', async () => {
    const files = { 'a/index.md': fm('a'), 'a/media/01.jpg': 'm' };
    const tweak = (e: SnapshotEntry): SnapshotEntry => ({ ...e, size: MIB + 1 });
    expect(await guard(null, files, { maxFileBytes: { media: 5 * MIB } }, tweak)).toEqual([
      ['guard-oversize', 'error', 'a/index.md'],
    ]);
    expect(await guard(null, files, { maxFileBytes: { media: MIB } }, tweak)).toEqual([
      ['guard-oversize', 'error', 'a/index.md'],
      ['guard-oversize', 'error', 'a/media/01.jpg'],
    ]);
  });

  it('un original de 2 Gio ne bloque rien : exclu de la projection, rapporté en info', async () => {
    const files = { 'a/index.md': fm('a'), 'a/media/01.RAF': 'raw' };
    const tweak = (e: SnapshotEntry): SnapshotEntry => (e.path.endsWith('.RAF') ? { ...e, size: 2 ** 31 } : e);
    expect(await guard(null, files, { maxFileBytes: { media: 100 } }, tweak)).toEqual([
      ['guard-originals-excluded', 'info', ''],
    ]);
  });

  it('une politique qui ne dit rien des seuils ne les éteint pas', async () => {
    const base = series('series', 12);
    const target = { 'autre/index.md': fm('autre') };
    expect(await guard(base, target, { maxMovedSeries: 100 })).toEqual([['guard-mass-deletion', 'error', '']]);
  });
});

describe('guardChangeSet — désactivation par null', () => {
  it('chaque seuil se désactive à part', async () => {
    const base = series('series', 12);
    const empty = { 'autre/index.md': fm('autre') };
    expect(await guard(base, empty, { maxDeletedSeries: null })).toEqual([['guard-mass-deletion', 'error', '']]);
    expect(await guard(base, empty, { maxDeletedSeries: null, maxDeletedMediaRatio: null })).toEqual([]);
    expect(await guard(series('series', 11), series('archives', 11), { maxMovedSeries: null })).toEqual([]);
  });

  it('maxFileBytes: null éteint toutes les classes, derived compris', async () => {
    const files = { 'a/index.md': fm('a'), 'a/images.json': '{"images":[]}' };
    const tweak = (e: SnapshotEntry): SnapshotEntry => ({ ...e, size: 10 * MIB });
    expect(await guard(null, files, { maxFileBytes: null }, tweak)).toEqual([]);
    expect(await guard(null, files, { maxFileBytes: { content: null } }, tweak)).toEqual([
      ['guard-oversize', 'error', 'a/images.json'],
    ]);
  });

  it('0 est un seuil, pas une désactivation', async () => {
    expect(await guard(series('series', 1), series('archives', 1), { ...OFF, maxMovedSeries: 0 })).toEqual([
      ['guard-mass-move', 'warning', ''],
    ]);
    const tweak = (e: SnapshotEntry): SnapshotEntry => ({ ...e, size: 1 });
    expect(await guard(null, { 'a/index.md': fm('a') }, { ...OFF, maxFileBytes: { content: 0 } }, tweak)).toEqual([
      ['guard-oversize', 'error', 'a/index.md'],
    ]);
  });

  it('les gardes sans seuil restent actives avec tous les seuils désactivés', async () => {
    const target = await snapshot([entry('a/media/01.jpg')], false);
    const diagnostics = await guardChangeSet(diffSnapshots(null, target), null, target, {
      read: async () => {
        throw new Error('aucune lecture attendue');
      },
      policy: OFF,
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['guard-snapshot-empty', 'guard-snapshot-incomplete']);
  });

  it('une politique invalide rejette la promesse au lieu de laisser publier', async () => {
    const target = await snapshot([entry('a/index.md', fm('a'))]);
    const call = (policy: unknown) =>
      guardChangeSet(diffSnapshots(null, target), null, target, { read: async () => fm('a'), policy: policy as GuardPolicy });
    await expect(call({ maxDeletedSeries: false })).rejects.toThrow(/maxDeletedSeries.*null pour désactiver/);
    await expect(call({ maxDeletedMediaRatio: 25 })).rejects.toThrow(/entre 0 et 1/);
    await expect(call({ maxFileBytes: 0 })).rejects.toThrow(/maxFileBytes/);
  });
});

describe('guardChangeSet — private se lit en booléen strict (§4.11)', () => {
  const exposed = (path: string) => [['guard-private-exposed', 'error', path]];

  it.each([
    ['la chaîne "true"', 'private: "true"'],
    ['yes', 'private: yes'],
    ['oui', 'private: oui'],
    ['1', 'private: 1'],
    ['la chaîne "True"', 'private: "True"'],
    ['une liste', 'private: [true]'],
    ['un mapping', 'private: { value: true }'],
    ['null explicite', 'private: null'],
    ['une valeur vide', 'private:'],
    ['false', 'private: false'],
    ['la clé Private', 'Private: true'],
    ['la clé private_', 'private_: true'],
  ])('une série privée dont target porte %s est exposée', async (_label, line) => {
    const base = { 's/index.md': fm('s', 'private: true\n') };
    expect(await guard(base, { 's/index.md': fm('s', `${line}\n`) }, OFF)).toEqual(exposed('s'));
  });

  it.each([['true'], ['True'], ['TRUE']])('`private: %s` (booléen YAML core) garde la série privée', async (value) => {
    const base = { 's/index.md': fm('s', 'private: true\n') };
    expect(await guard(base, { 's/index.md': fm('s', `private: ${value}\n`) }, OFF)).toEqual([]);
  });

  it('un private non booléen dans base ne rend jamais la série privée', async () => {
    const base = { 'a/index.md': fm('a', 'private: "true"\n'), 'b/index.md': fm('b', 'private: yes\n'), 'c/index.md': fm('c', 'private: 1\n') };
    const target = { 'a/index.md': fm('a'), 'b/index.md': fm('b'), 'c/index.md': fm('c') };
    expect(await guard(base, target, OFF)).toEqual([]);
  });

  it('un index privé suffit, même quand l\'autre porte une valeur non booléenne', async () => {
    const base = { 's/index.md': fm('s', 'private: true\n'), 's/index.en.md': fm('s-en') };
    const target = { 's/index.md': fm('s', 'private: "yes"\n'), 's/index.en.md': fm('s-en', 'private: true\n') };
    expect(await guard(base, target, OFF)).toEqual([]);
    expect(await guard(base, { ...target, 's/index.en.md': fm('s-en', 'private: "true"\n') }, OFF)).toEqual(exposed('s'));
  });

  it('une clé dupliquée dans target rend le frontmatter illisible : il ne déclare rien', async () => {
    const base = { 's/index.md': fm('s', 'private: true\n') };
    const target = { 's/index.md': fm('s', 'private: true\nprivate: false\n') };
    expect(await guard(base, target, OFF)).toEqual(exposed('s'));
  });

  it('une série privée déplacée dont le private devient une chaîne est exposée à sa destination', async () => {
    const privateIndex = fm('s', 'private: true\n');
    const make = (folder: string, content: string) => snapshot([entry(`${folder}/index.md`, content, { identity: 's' })]);
    const base = await make('avant', privateIndex);
    const targetContent = fm('s', 'private: "true"\n');
    const target = await make('apres', targetContent);
    const read = async (side: 'base' | 'target') => (side === 'base' ? privateIndex : targetContent);
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, { read, policy: OFF });
    expect(diagnostics.map((d) => [d.code, d.path])).toEqual([['guard-private-exposed', 'apres']]);
  });
});
