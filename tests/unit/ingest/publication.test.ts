import { describe, expect, it } from 'vitest';
import {
  buildImagesManifest,
  diffSnapshots,
  guardChangeSet,
  summarizeChangeSet,
  waitForQuiescence,
} from '../../../src/ingest/index.js';
import type { ContentProvider, ProviderCapabilities, ProviderDelta, SnapshotEntry } from '../../../src/ingest/index.js';
import { entry, memoryReader, snapshot } from './helpers.js';

const SERIES = '---\ntitle: S\ndate: 2024-01-01\n---\n';
const PRIVATE = '---\ntitle: S\ndate: 2024-01-01\nprivate: true\n---\n';
const noRead = { readBase: memoryReader({}), readTarget: memoryReader({}) };

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

describe('guardChangeSet (§2.11)', () => {
  it('incomplet et vide : toujours actifs, sans seuil', async () => {
    const target = await snapshot([entry('a/media/01.jpg')], false);
    const diagnostics = await guardChangeSet(diffSnapshots(null, target), null, target, {}, noRead);
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['guard-snapshot-empty', 'error'],
      ['guard-snapshot-incomplete', 'error'],
    ]);
  });

  it('suppressions massives : séries et ratio de médias', async () => {
    const base = await snapshot([
      entry('a/index.md'),
      entry('b/index.md'),
      entry('c/index.md'),
      entry('c/media/1.jpg'),
      entry('c/media/2.jpg'),
      entry('c/media/3.jpg'),
      entry('c/media/4.jpg'),
    ]);
    const target = await snapshot([entry('c/index.md'), entry('c/media/1.jpg')]);
    const cs = diffSnapshots(base, target);
    const hit = await guardChangeSet(cs, base, target, { maxDeletedSeries: 1, maxDeletedMediaRatio: 0.5 }, noRead);
    expect(hit.map((d) => d.code)).toEqual(['guard-mass-deletion', 'guard-mass-deletion']);
    const ok = await guardChangeSet(cs, base, target, { maxDeletedSeries: 2, maxDeletedMediaRatio: 0.75 }, noRead);
    expect(ok).toEqual([]);
  });

  it('déplacements massifs : warning', async () => {
    const base = await snapshot([entry('x/a/index.md', 'a'), entry('x/b/index.md', 'b')]);
    const target = await snapshot([entry('y/a/index.md', 'a'), entry('y/b/index.md', 'b')]);
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, { maxMovedSeries: 1 }, noRead);
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([['guard-mass-move', 'warning']]);
  });

  it('série privée exposée : flag retiré, passé à false, ou perdu en route', async () => {
    const baseFiles = { 'a/index.md': PRIVATE, 'b/index.md': PRIVATE, 'c/index.md': PRIVATE, 'd/index.md': PRIVATE };
    const targetFiles = {
      'a/index.md': SERIES,
      'b/index.md': PRIVATE.replace('true', 'false'),
      'c2/index.md': SERIES,
      'd/index.md': PRIVATE.replace('title: S', 'title: T'),
    };
    const base = await snapshot([
      entry('a/index.md', baseFiles['a/index.md'], { identity: 'a' }),
      entry('b/index.md', baseFiles['b/index.md'], { identity: 'b' }),
      entry('c/index.md', baseFiles['c/index.md'], { identity: 'c' }),
      entry('d/index.md', baseFiles['d/index.md'], { identity: 'd' }),
    ]);
    const target = await snapshot([
      entry('a/index.md', targetFiles['a/index.md'], { identity: 'a' }),
      entry('b/index.md', targetFiles['b/index.md'], { identity: 'b' }),
      entry('c2/index.md', targetFiles['c2/index.md'], { identity: 'c' }),
      entry('d/index.md', targetFiles['d/index.md'], { identity: 'd' }),
    ]);
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, {}, {
      readBase: memoryReader(baseFiles),
      readTarget: memoryReader(targetFiles),
    });
    expect(diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['guard-private-exposed', 'a'],
      ['guard-private-exposed', 'b'],
      ['guard-private-exposed', 'c2'],
    ]);
  });

  it('fichier trop lourd : seules les entrées entrantes comptent', async () => {
    const big: SnapshotEntry = { ...entry('a/media/big.jpg'), size: 10_000 };
    const base = await snapshot([entry('a/index.md', SERIES), { ...entry('a/media/old.jpg'), size: 99_999 }]);
    const target = await snapshot([entry('a/index.md', SERIES), { ...entry('a/media/old.jpg'), size: 99_999 }, big]);
    const diagnostics = await guardChangeSet(diffSnapshots(base, target), base, target, { maxFileBytes: { media: 5_000 } }, noRead);
    expect(diagnostics.map((d) => [d.code, d.path])).toEqual([['guard-oversize', 'a/media/big.jpg']]);
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
