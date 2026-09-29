import { describe, expect, it } from 'vitest';
import {
  CursorResetError,
  SnapshotFormatError,
  applyDelta,
  commonHashAlgorithm,
  compareEntryContent,
  computeSnapshotId,
  createSnapshot,
  dropboxContentHash,
  parseSnapshot,
  sha256Hex,
} from '../../../src/ingest/index.js';
import type { SnapshotEntry } from '../../../src/ingest/index.js';
import { dropboxHash, entry, sha256, snapshot } from './helpers.js';

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('empreintes (§2.4)', () => {
  it('sha256Hex coïncide avec node:crypto', async () => {
    expect(await sha256Hex('')).toBe(EMPTY_SHA256);
    expect(await sha256Hex('hyperfocale')).toBe(sha256('hyperfocale'));
  });

  it('dropboxContentHash : fichier vide = SHA-256 de la chaîne vide', async () => {
    expect(await dropboxContentHash(new Uint8Array())).toBe(EMPTY_SHA256);
  });

  it('dropboxContentHash : blocs de 4 Mio, frontière exacte et bloc partiel', async () => {
    const block = 4 * 1024 * 1024;
    for (const size of [1, block - 1, block, block + 1, 2 * block + 17]) {
      const bytes = new Uint8Array(size).map((_, i) => (i * 31) % 251);
      expect(await dropboxContentHash(bytes)).toBe(dropboxHash(bytes));
    }
  });

  it('préférence : sha256, puis dropbox, puis x-* alphabétique ; null sans algorithme commun', () => {
    expect(commonHashAlgorithm({ dropbox: 'a', sha256: 'b' }, { sha256: 'c', dropbox: 'd' })).toBe('sha256');
    expect(commonHashAlgorithm({ dropbox: 'a', 'x-md5': 'b' }, { 'x-md5': 'c', dropbox: 'd' })).toBe('dropbox');
    expect(commonHashAlgorithm({ 'x-md5': 'a', 'x-etag': 'b' }, { 'x-md5': 'c', 'x-etag': 'd' })).toBe('x-etag');
    expect(commonHashAlgorithm({ sha256: 'a' }, { dropbox: 'b' })).toBeNull();
    expect(commonHashAlgorithm(undefined, { dropbox: 'b' })).toBeNull();
  });

  it('compareEntryContent : kind/size d\'abord, puis premier hash commun', () => {
    const a = entry('a/index.md', 'x');
    expect(compareEntryContent(a, entry('a/index.md', 'x'))).toBe('same');
    expect(compareEntryContent(a, entry('a/index.md', 'y'))).toBe('different');
    expect(compareEntryContent(a, { ...a, size: 2 })).toBe('different');
    expect(compareEntryContent(a, { ...a, kind: 'other' })).toBe('different');
    expect(compareEntryContent(a, { ...a, hashes: { dropbox: 'z' } })).toBe('incomparable');
    // Le premier algorithme commun décide, même si un autre diverge.
    expect(
      compareEntryContent({ ...a, hashes: { sha256: 'h', 'x-etag': '1' } }, { ...a, hashes: { sha256: 'h', 'x-etag': '2' } }),
    ).toBe('same');
  });
});

describe('computeSnapshotId (§2.6)', () => {
  it('snapshot vide → SHA-256 de la chaîne vide', async () => {
    expect(await computeSnapshotId([])).toBe(`sha256:${EMPTY_SHA256}`);
  });

  it('concatène les lignes canoniques, hashes triés par nom', async () => {
    const entries: SnapshotEntry[] = [
      { path: 'b/index.md', kind: 'content', size: 3, hashes: { sha256: 'aa', dropbox: 'bb' } },
      { path: 'a/media/01.jpg', kind: 'media', size: 0, state: 'placeholder' },
    ];
    const expected = 'a/media/01.jpg\tmedia\t0\t\n' + 'b/index.md\tcontent\t3\tdropbox=bb,sha256=aa\n';
    expect(await computeSnapshotId(entries)).toBe(`sha256:${sha256(expected)}`);
  });

  it('ignore identity, modifiedAt, state et l\'ordre d\'entrée', async () => {
    const a = entry('a/index.md');
    const b = entry('b/index.md');
    const id = await computeSnapshotId([a, b]);
    expect(await computeSnapshotId([b, { ...a, identity: 'id:1', modifiedAt: '2026-01-01T00:00:00Z' }])).toBe(id);
  });
});

describe('createSnapshot / parseSnapshot (§2.5)', () => {
  it('trie les entrées, calcule l\'id, recopie complete et source', async () => {
    const snap = await createSnapshot([entry('z.md'), entry('a.md')], {
      complete: false,
      createdAt: new Date(0),
      source: { provider: 'test', revision: 'r1' },
    });
    expect(snap).toMatchObject({
      format: 'hyperfocale.snapshot',
      version: 1,
      createdAt: '1970-01-01T00:00:00.000Z',
      complete: false,
      source: { provider: 'test', revision: 'r1' },
    });
    expect(snap.entries.map((e) => e.path)).toEqual(['a.md', 'z.md']);
    expect(snap.id).toBe(await computeSnapshotId(snap.entries));
  });

  it('lève sur un chemin en double', async () => {
    await expect(createSnapshot([entry('a.md'), entry('a.md', 'autre')], { complete: true })).rejects.toThrow(
      /double/,
    );
  });

  it('relit ce qu\'il écrit, champs inconnus compris', async () => {
    const snap = await snapshot([entry('a/index.md', 'x', { 'x-origin': 'cms' })]);
    const raw = JSON.parse(JSON.stringify({ ...snap, 'x-extra': 1 }));
    const parsed = parseSnapshot(JSON.stringify(raw));
    expect(parsed).toEqual(raw);
    expect(parseSnapshot(raw)).toEqual(raw);
  });

  it('refuse une version inconnue avec le code snapshot-version-unsupported', async () => {
    const snap = await snapshot([entry('a.md')]);
    try {
      parseSnapshot({ ...snap, version: 2 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SnapshotFormatError);
      expect((err as SnapshotFormatError).code).toBe('snapshot-version-unsupported');
    }
  });

  it.each([
    ['JSON illisible', '{'],
    ['format inconnu', { format: 'x', version: 1 }],
    ['entrée sans path', { entries: [{ kind: 'content', size: 1 }] }],
    ['kind inconnu', { entries: [{ path: 'a', kind: 'dir', size: 1 }] }],
    ['size négative', { entries: [{ path: 'a', kind: 'other', size: -1 }] }],
    ['hash non chaîne', { entries: [{ path: 'a', kind: 'other', size: 1, hashes: { sha256: 1 } }] }],
    ['state inconnu', { entries: [{ path: 'a', kind: 'other', size: 1, state: 'cloud' }] }],
    ['doublon', { entries: [{ path: 'a', kind: 'other', size: 1 }, { path: 'a', kind: 'other', size: 1 }] }],
  ])('refuse : %s', async (_label, patch) => {
    const snap = await snapshot([]);
    const input = typeof patch === 'string' ? patch : { ...snap, ...patch };
    expect(() => parseSnapshot(input)).toThrow(SnapshotFormatError);
  });
});

describe('applyDelta', () => {
  it('supprime un chemin et tous ses descendants, puis applique les upserts', async () => {
    const base = await snapshot([
      entry('a/index.md'),
      entry('a/media/01.jpg'),
      entry('ab/index.md'),
      entry('b/index.md'),
    ]);
    const next = applyDelta(base, {
      deletions: ['a'],
      upserts: [entry('a/index.md', 'recréé'), entry('c/index.md')],
      cursor: 'c2',
    });
    expect(next.entries.map((e) => e.path)).toEqual(['a/index.md', 'ab/index.md', 'b/index.md', 'c/index.md']);
    expect(next.entries[0]?.hashes?.sha256).toBe(sha256('recréé'));
    expect(next).toMatchObject({ complete: true, cursor: 'c2' });
  });

  it('rapproche les chemins au repli de casse près et garde la casse connue des dossiers', async () => {
    const base = await snapshot([entry('Archives/Foo/index.md'), entry('Archives/Foo/media/01.jpg')]);
    const next = applyDelta(base, {
      deletions: ['archives/foo/media/01.jpg'],
      upserts: [entry('archives/foo/media/02.jpg'), entry('archives/Neu/index.md')],
      cursor: 'c',
    });
    expect(next.entries.map((e) => e.path)).toEqual([
      'Archives/Foo/index.md',
      'Archives/Foo/media/02.jpg',
      'Archives/Neu/index.md',
    ]);
  });

  it('un upsert remplace l\'entrée de même clé de collision', async () => {
    const base = await snapshot([entry('a/Photo.JPG', 'v1')]);
    const next = applyDelta(base, { deletions: [], upserts: [entry('a/photo.jpg', 'v2')], cursor: 'c' });
    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]?.path).toBe('a/photo.jpg');
  });

  it('reset → CursorResetError, jamais « tout supprimé »', async () => {
    const base = await snapshot([entry('a/index.md')]);
    expect(() => applyDelta(base, { deletions: [], upserts: [], cursor: '', reset: true })).toThrow(CursorResetError);
  });

  it('hérite de l\'incomplétude de l\'état de départ', () => {
    const next = applyDelta({ entries: [], complete: false }, { deletions: [], upserts: [entry('a.md')], cursor: 'c' });
    expect(next.complete).toBe(false);
  });
});
