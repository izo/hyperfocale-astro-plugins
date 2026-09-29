import { describe, expect, it } from 'vitest';
import { diffSnapshots } from '../../../src/ingest/index.js';
import type { ContentChangeSet } from '../../../src/ingest/index.js';
import { entry, snapshot } from './helpers.js';

const codes = (cs: ContentChangeSet) => cs.diagnostics.map((d) => [d.code, d.severity, d.path]);

describe('diffSnapshots (§2.7)', () => {
  it('base null : tout est ajouté', async () => {
    const target = await snapshot([entry('b.md'), entry('a.md')]);
    const cs = diffSnapshots(null, target);
    expect(cs).toMatchObject({ format: 'hyperfocale.changeset', version: 1, base: null, target: target.id });
    expect(cs.added.map((e) => e.path)).toEqual(['a.md', 'b.md']);
  });

  it('diff(S, S) est vide, sans diagnostic — même avec des entrées sans empreinte', async () => {
    const s = await snapshot([entry('a/index.md'), { path: 'a/media/01.jpg', kind: 'media', size: 1, state: 'placeholder' }]);
    const cs = diffSnapshots(s, s);
    expect([cs.added, cs.modified, cs.deleted, cs.moved, cs.diagnostics]).toEqual([[], [], [], [], []]);
    expect(cs.base).toBe(s.id);
  });

  it('ajouts, modifications et suppressions, triés par chemin', async () => {
    const base = await snapshot([entry('a.md'), entry('b.md', 'v1'), entry('c.md', 'garde'), entry('z.md', 'bye')]);
    const target = await snapshot([entry('b.md', 'v2'), entry('c.md', 'garde'), entry('y.md', 'hello'), entry('d.md', 'd')]);
    const cs = diffSnapshots(base, target);
    expect(cs.added.map((e) => e.path)).toEqual(['d.md', 'y.md']);
    expect(cs.modified.map((m) => m.path)).toEqual(['b.md']);
    expect(cs.modified[0]?.before.hashes).not.toEqual(cs.modified[0]?.after.hashes);
    expect(cs.deleted.map((e) => e.path)).toEqual(['a.md', 'z.md']);
    expect(cs.diagnostics).toEqual([]);
  });

  it('changement de kind ou de taille seul → modified', async () => {
    const e = entry('a/x', 'abc');
    const base = await snapshot([e]);
    const target = await snapshot([{ ...e, kind: 'content' }]);
    expect(diffSnapshots(base, target).modified).toHaveLength(1);
  });

  it('aucun hash commun → modified + hash-incomparable (warning)', async () => {
    const base = await snapshot([{ path: 'a.md', kind: 'content', size: 3, hashes: { sha256: 'aa' } }]);
    const target = await snapshot([{ path: 'a.md', kind: 'content', size: 3, hashes: { 'x-etag': '01' } }]);
    const cs = diffSnapshots(base, target);
    expect(cs.modified.map((m) => m.path)).toEqual(['a.md']);
    expect(codes(cs)).toEqual([['hash-incomparable', 'warning', 'a.md']]);
  });

  it('move par identité, modifié ou non', async () => {
    const base = await snapshot([
      entry('old/index.md', 'texte', { identity: 'id:1' }),
      entry('old/media/01.jpg', 'img', { identity: 'id:2' }),
    ]);
    const target = await snapshot([
      entry('new/index.md', 'texte révisé', { identity: 'id:1' }),
      entry('new/media/01.jpg', 'img', { identity: 'id:2' }),
    ]);
    const cs = diffSnapshots(base, target);
    expect(cs.moved.map(({ from, to, modified }) => ({ from, to, modified }))).toEqual([
      { from: 'old/index.md', to: 'new/index.md', modified: true },
      { from: 'old/media/01.jpg', to: 'new/media/01.jpg', modified: false },
    ]);
    expect([cs.added, cs.deleted, cs.modified]).toEqual([[], [], []]);
  });

  it('une identité dupliquée d\'un côté n\'apparie rien par identité', async () => {
    const base = await snapshot([entry('a.md', 'a', { identity: 'dup' })]);
    const target = await snapshot([entry('b.md', 'b', { identity: 'dup' }), entry('c.md', 'c', { identity: 'dup' })]);
    const cs = diffSnapshots(base, target);
    expect(cs.moved).toEqual([]);
    expect(cs.deleted.map((e) => e.path)).toEqual(['a.md']);
  });

  it('move par contenu : appariement 1:1 unique, modified: false', async () => {
    const base = await snapshot([entry('a/media/01.jpg', 'pixels')]);
    const target = await snapshot([entry('b/media/01.jpg', 'pixels')]);
    const cs = diffSnapshots(base, target);
    expect(cs.moved).toEqual([
      { from: 'a/media/01.jpg', to: 'b/media/01.jpg', before: base.entries[0], after: target.entries[0], modified: false },
    ]);
  });

  it('move par contenu : pas d\'appariement sans hash commun', async () => {
    const base = await snapshot([{ path: 'a.jpg', kind: 'other', size: 3, hashes: { sha256: 'aa' } }]);
    const target = await snapshot([{ path: 'b.jpg', kind: 'other', size: 3, hashes: { dropbox: 'aa' } }]);
    const cs = diffSnapshots(base, target);
    expect(cs.moved).toEqual([]);
    expect(cs.added).toHaveLength(1);
    expect(cs.deleted).toHaveLength(1);
  });

  it('plusieurs candidats → pas de move, move-ambiguous (info) sur chaque chemin concerné', async () => {
    const base = await snapshot([entry('a/1.jpg', 'same'), entry('a/2.jpg', 'same'), entry('u.jpg', 'unique')]);
    const target = await snapshot([entry('b/1.jpg', 'same'), entry('v.jpg', 'unique')]);
    const cs = diffSnapshots(base, target);
    expect(cs.moved.map((m) => [m.from, m.to])).toEqual([['u.jpg', 'v.jpg']]);
    expect(cs.added.map((e) => e.path)).toEqual(['b/1.jpg']);
    expect(cs.deleted.map((e) => e.path)).toEqual(['a/1.jpg', 'a/2.jpg']);
    expect(codes(cs)).toEqual([
      ['move-ambiguous', 'info', 'a/1.jpg'],
      ['move-ambiguous', 'info', 'a/2.jpg'],
      ['move-ambiguous', 'info', 'b/1.jpg'],
    ]);
  });

  it('renommage d\'un dossier de série : un move par fichier, triés par destination', async () => {
    const base = await snapshot([entry('s/old/index.md', 'i'), entry('s/old/media/01.jpg', '1'), entry('s/old/media/02.jpg', '2')]);
    const target = await snapshot([entry('s/new/index.md', 'i'), entry('s/new/media/01.jpg', '1'), entry('s/new/media/02.jpg', '2')]);
    const cs = diffSnapshots(base, target);
    expect(cs.moved.map((m) => m.to)).toEqual(['s/new/index.md', 's/new/media/01.jpg', 's/new/media/02.jpg']);
    expect([cs.added, cs.deleted, cs.modified, cs.diagnostics]).toEqual([[], [], [], []]);
  });

  it('est déterministe quel que soit l\'ordre de construction', async () => {
    const entries = [entry('a/1.jpg', 'x'), entry('a/2.jpg', 'x'), entry('c.md'), entry('d.md')];
    const base = await snapshot(entries);
    const t1 = await snapshot([entry('b/1.jpg', 'x'), entry('c.md', 'v2')]);
    const t2 = await snapshot([entry('c.md', 'v2'), entry('b/1.jpg', 'x')]);
    expect(diffSnapshots(base, t1)).toEqual(diffSnapshots(base, t2));
  });
});
