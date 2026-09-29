import { describe, expect, it } from 'vitest';
import {
  buildImagesManifest,
  diffSnapshots,
  guardChangeSet,
  summarizeChangeSet,
  waitForQuiescence,
} from '../../../src/ingest/index.js';
import type { ContentProvider, ProviderCapabilities, ProviderDelta, SnapshotEntry } from '../../../src/ingest/index.js';
import { entry, snapshot } from './helpers.js';

const SERIES = '---\ntitle: S\ndate: 2024-01-01\n---\n';
const PRIVATE = '---\ntitle: S\ndate: 2024-01-01\nprivate: true\n---\n';

describe('summarizeChangeSet', () => {
  it('séries ajoutées, modifiées, supprimées ; un changement de sous-série est imputé à la sous-série', async () => {
    const base = await snapshot([
      entry('fest/index.md', 'f'),
      entry('fest/set/index.md', 's'),
      entry('fest/set/media/01.jpg', 'v1'),
      entry('gone/index.md', 'g'),
      entry('same/index.md', 'x'),
    ]);
    const target = await snapshot([
      entry('fest/index.md', 'f'),
      entry('fest/set/index.md', 's'),
      entry('fest/set/media/01.jpg', 'v2'),
      entry('neu/index.md', 'n'),
      entry('same/index.md', 'x'),
    ]);
    const summary = summarizeChangeSet(diffSnapshots(base, target), base, target);
    expect(summary.series).toEqual({ added: ['neu'], modified: ['fest/set'], deleted: ['gone'], moved: [] });
    expect(summary.entries).toEqual({ added: 1, modified: 1, deleted: 1, moved: 0 });
  });

  it('renommer une section de rangement déplace chacune de ses séries', async () => {
    const files = (root: string) => [
      entry(`${root}/a/index.md`, 'a'),
      entry(`${root}/a/media/01.jpg`, 'a1'),
      entry(`${root}/b/index.md`, 'b'),
      entry(`${root}/b/index.en.md`, 'b-en'),
    ];
    const base = await snapshot(files('concerts'));
    const target = await snapshot(files('live'));
    const summary = summarizeChangeSet(diffSnapshots(base, target), base, target);
    expect(summary.series).toEqual({
      added: [],
      modified: [],
      deleted: [],
      moved: [
        { from: 'concerts/a', to: 'live/a' },
        { from: 'concerts/b', to: 'live/b' },
      ],
    });
  });
});

describe('guardChangeSet (§4.11)', () => {
  /** Frontmatter lisible, non privé, propre à un titre. */
  const fm = (title: string) => `---\ntitle: ${title}\ndate: 2024-01-01\n---\n`;
  /** Fichier index au frontmatter lisible (le titre est le chemin, sauf contenu donné). */
  const idx = (path: string, content = fm(path), extra: Partial<SnapshotEntry> = {}) => entry(path, content, extra);
  /** Lecteur par côté : les contenus donnés, sinon le frontmatter par défaut d'`idx`. */
  const reader =
    (files: { base?: Record<string, string>; target?: Record<string, string> } = {}) =>
    async (side: 'base' | 'target', path: string) =>
      files[side]?.[path] ?? fm(path);

  it('incomplet et vide : toujours actifs, sans seuil, rien n\'est lu', async () => {
    const target = await snapshot([entry('a/media/01.jpg')], false);
    const read = async () => {
      throw new Error('aucune lecture attendue');
    };
    const diagnostics = await guardChangeSet(diffSnapshots(null, target), null, target, { read, policy: {} });
    expect(diagnostics.map((d) => [d.code, d.severity, d.path])).toEqual([
      ['guard-snapshot-empty', 'error', ''],
      ['guard-snapshot-incomplete', 'error', ''],
    ]);
  });

  it('suppressions massives : séries et ratio de médias', async () => {
    const base = await snapshot([
      idx('a/index.md'),
      idx('b/index.md'),
      idx('c/index.md'),
      entry('c/media/1.jpg'),
      entry('c/media/2.jpg'),
      entry('c/media/3.jpg'),
      entry('c/media/4.jpg'),
    ]);
    const target = await snapshot([idx('c/index.md'), entry('c/media/1.jpg')]);
    const cs = diffSnapshots(base, target);
    const read = reader();
    const hit = await guardChangeSet(cs, base, target, { read, policy: { maxDeletedSeries: 1, maxDeletedMediaRatio: 0.5 } });
    // Un seul diagnostic par couple (code, path) : les deux motifs se cumulent.
    expect(hit.map((d) => [d.code, d.path])).toEqual([['guard-mass-deletion', '']]);
    expect(hit[0]?.message).toMatch(/2 séries.*3 médias/);
    const mediaOnly = await guardChangeSet(cs, base, target, { read, policy: { maxDeletedMediaRatio: 0.5 } });
    expect(mediaOnly.map((d) => d.code)).toEqual(['guard-mass-deletion']);
    const ok = await guardChangeSet(cs, base, target, { read, policy: { maxDeletedSeries: 2, maxDeletedMediaRatio: 0.75 } });
    expect(ok).toEqual([]);
  });

  it('déplacements massifs : warning', async () => {
    const base = await snapshot([idx('x/a/index.md', fm('a')), idx('x/b/index.md', fm('b'))]);
    const target = await snapshot([idx('y/a/index.md', fm('a')), idx('y/b/index.md', fm('b'))]);
    const read = reader({ base: { 'x/a/index.md': fm('a'), 'x/b/index.md': fm('b') } });
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, { read, policy: { maxMovedSeries: 1 } });
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([['guard-mass-move', 'warning']]);
  });

  it('série privée exposée : au niveau de la série, suivie jusqu\'à sa destination', async () => {
    const files = {
      base: {
        'a/index.md': PRIVATE,
        'b/index.md': PRIVATE,
        'c/index.md': PRIVATE,
        'd/index.md': PRIVATE,
        'd/index.en.md': PRIVATE,
        'e/index.md': PRIVATE,
        'f/index.md': PRIVATE.replace('true', '"true"'),
      },
      target: {
        'a/index.md': SERIES,
        'b/index.md': PRIVATE.replace('true', 'false'),
        'c2/index.md': SERIES,
        // index.md n'est plus privé, mais index.en.md l'est encore : la série reste privée.
        'd/index.md': SERIES,
        'd/index.en.md': PRIVATE,
        'f/index.md': SERIES,
      },
    };
    const make = (side: 'base' | 'target', identities: Record<string, string>) =>
      snapshot(Object.entries(files[side]).map(([path, content]) => entry(path, content, { identity: identities[path] ?? path })));
    const base = await make('base', { 'c/index.md': 'c' });
    const target = await make('target', { 'c2/index.md': 'c' });
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, { read: reader(files), policy: {} });
    // e/ supprimée : pas une exposition. f/ : la chaîne "true" ne rend pas privé.
    expect(diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['guard-private-exposed', 'a'],
      ['guard-private-exposed', 'b'],
      ['guard-private-exposed', 'c2'],
    ]);
  });

  it('une série privée inchangée n\'est jamais exposée', async () => {
    const base = await snapshot([idx('secret/index.md', PRIVATE), idx('secret/media/01.jpg'), idx('autre/index.md')]);
    const target = await snapshot([idx('secret/index.md', PRIVATE), idx('secret/media/01.jpg'), idx('autre/index.md', fm('révisé'))]);
    const files = { base: { 'secret/index.md': PRIVATE }, target: { 'secret/index.md': PRIVATE } };
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, { read: reader(files), policy: {} });
    expect(diagnostics).toEqual([]);
  });

  it('fail-closed côté base : un index illisible rend la série privée par prudence', async () => {
    const base = await snapshot([
      idx('divergent/index.md'),
      idx('sans-bloc/index.md', 'pas de frontmatter'),
      { path: 'lointain/index.md', kind: 'content', size: 10, state: 'placeholder' },
      { path: 'conflit/index.md', kind: 'content', size: 10, state: 'conflict' },
      idx('lisible/index.md'),
    ]);
    const target = await snapshot([
      idx('divergent/index.md', fm('v2')),
      idx('sans-bloc/index.md'),
      idx('lointain/index.md'),
      idx('conflit/index.md'),
      idx('lisible/index.md', fm('v2')),
    ]);
    const read = async (side: 'base' | 'target', path: string) => {
      if (side === 'base' && (path.startsWith('lointain/') || path.startsWith('conflit/'))) {
        throw new Error(`lecture interdite d'une entrée non matérialisée : ${path}`);
      }
      if (side === 'base' && path === 'divergent/index.md') return `${fm(path)}modifié depuis le listing`;
      if (side === 'base' && path === 'sans-bloc/index.md') return 'pas de frontmatter';
      return side === 'target' && ['divergent/index.md', 'lisible/index.md'].includes(path) ? fm('v2') : fm(path);
    };
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, { read, policy: {} });
    // La garde n'émet pas entry-hash-mismatch : c'est le rôle de la validation.
    expect(diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['guard-private-exposed', 'conflit'],
      ['guard-private-exposed', 'divergent'],
      ['guard-private-exposed', 'lointain'],
      ['guard-private-exposed', 'sans-bloc'],
    ]);
  });

  it('côté target, un index illisible ne déclare rien : la série privée est exposée', async () => {
    const base = await snapshot([idx('s/index.md', PRIVATE)]);
    const target = await snapshot([{ path: 's/index.md', kind: 'content', size: 10, state: 'placeholder' }]);
    const read = reader({ base: { 's/index.md': PRIVATE } });
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, { read, policy: {} });
    expect(diagnostics.map((d) => [d.code, d.path])).toEqual([['guard-private-exposed', 's']]);
  });

  it('fichier trop lourd : toute entrée de target, seuil par classe', async () => {
    const big: SnapshotEntry = { ...entry('a/media/big.jpg'), size: 10_000 };
    const base = await snapshot([idx('a/index.md'), { ...entry('a/media/old.jpg'), size: 99_999 }]);
    const target = await snapshot([idx('a/index.md'), { ...entry('a/media/old.jpg'), size: 99_999 }, big]);
    const policy = { maxFileBytes: { media: 5_000 } };
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, { read: reader(), policy });
    expect(diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['guard-oversize', 'a/media/big.jpg'],
      ['guard-oversize', 'a/media/old.jpg'],
    ]);
  });

  it('une série dont l\'index est la source d\'un déplacement n\'est pas supprimée', async () => {
    // Fusion : a/ déménage dans b/, qui existait déjà.
    const base = await snapshot([idx('a/index.md', fm('A'), { identity: 'a' }), idx('b/index.en.md', fm('B'))]);
    const target = await snapshot([idx('b/index.md', fm('A'), { identity: 'a' }), idx('b/index.en.md', fm('B'))]);
    const cs = diffSnapshots(base, target);
    const read = reader({ base: { 'a/index.md': fm('A'), 'b/index.en.md': fm('B') } });
    expect(await guardChangeSet(cs, base, target, { read, policy: { maxDeletedSeries: 0 } })).toEqual([]);
    expect(summarizeChangeSet(cs, base, target).series.deleted).toEqual([]);
  });
});

describe('buildImagesManifest (§1.5.1)', () => {
  it('forme courte, images de media/ seulement, ordre canonique', async () => {
    const snap = await snapshot([
      entry('s/index.md'),
      entry('s/media/10.jpg'),
      entry('s/media/02.JPG'),
      entry('s/media/B.png'),
      entry('s/media/a.webp'),
      entry('s/media/doc.pdf'),
      entry('s/media/sub/x.jpg'),
      entry('s/other/media/y.jpg'),
      entry('s/images.json'),
    ]);
    expect(buildImagesManifest(snap, 's')).toEqual({
      images: ['./media/02.JPG', './media/10.jpg', './media/B.png', './media/a.webp'],
    });
    expect(buildImagesManifest(snap, 's', { urlFor: (e) => `/content/${e.path}` }).images[0]).toBe('/content/s/media/02.JPG');
    expect(buildImagesManifest(snap, 'absent')).toEqual({ images: [] });
  });
});

describe('waitForQuiescence', () => {
  const caps = (incrementalChanges: boolean): ProviderCapabilities => ({
    localRead: false,
    localWrite: false,
    remoteRead: true,
    remoteWrite: false,
    incrementalChanges,
    stableIdentity: false,
    serverWebhook: false,
    clientChangeObservation: false,
    materializationAware: false,
    hashAlgorithms: ['sha256'],
  });

  function clock() {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms) };
  }

  it('provider incrémental : repos après quietMs sans changement', async () => {
    const deltas: ProviderDelta[] = [
      { upserts: [entry('a.md')], deletions: [], cursor: 'c1' },
      { upserts: [], deletions: ['b.md'], cursor: 'c2' },
      { upserts: [], deletions: [], cursor: 'c3' },
      { upserts: [], deletions: [], cursor: 'c4' },
    ];
    const seen: string[] = [];
    const provider: ContentProvider = {
      type: 'test',
      capabilities: caps(true),
      list: async () => ({ entries: [], complete: true }),
      read: async () => new Uint8Array(),
      latestCursor: async () => 'c0',
      changes: async (cursor) => {
        seen.push(cursor);
        return deltas.shift() ?? { upserts: [], deletions: [], cursor };
      },
    };
    const result = await waitForQuiescence(provider, { quietMs: 2000, maxMs: 60_000, intervalMs: 1000, ...clock() });
    expect(result).toEqual({ settled: true, cursor: 'c4', waitedMs: 4000 });
    expect(seen).toEqual(['c0', 'c1', 'c2', 'c3']);
  });

  it('abandonne à maxMs si la source ne se tait pas ; reset compte comme un changement', async () => {
    let n = 0;
    const provider: ContentProvider = {
      type: 'test',
      capabilities: caps(true),
      list: async () => ({ entries: [], complete: true }),
      read: async () => new Uint8Array(),
      latestCursor: async () => `fresh${n}`,
      changes: async () => (++n % 2 === 0 ? { upserts: [], deletions: [], cursor: '', reset: true } : { upserts: [entry(`${n}.md`)], deletions: [], cursor: `c${n}` }),
    };
    const result = await waitForQuiescence(provider, { cursor: 'start', quietMs: 3000, maxMs: 5000, intervalMs: 1000, ...clock() });
    expect(result.settled).toBe(false);
    expect(result.waitedMs).toBe(5000);
  });

  it('provider sans incrémental : compare les listings successifs', async () => {
    const listings = [[entry('a.md')], [entry('a.md'), entry('b.md')], [entry('a.md'), entry('b.md')], [entry('a.md'), entry('b.md')]];
    const provider: ContentProvider = {
      type: 'test',
      capabilities: caps(false),
      list: async () => ({ entries: listings.shift() ?? [], complete: true }),
      read: async () => new Uint8Array(),
    };
    const result = await waitForQuiescence(provider, { quietMs: 2000, maxMs: 60_000, intervalMs: 1000, ...clock() });
    expect(result).toEqual({ settled: true, waitedMs: 3000 });
  });
});
