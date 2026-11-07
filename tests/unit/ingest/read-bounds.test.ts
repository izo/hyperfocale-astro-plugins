/**
 * Bornes de lecture appliquées par la validation, la garde et la lecture d'un
 * `images.json` (§1.12 ; §4.10, règles 4 et 6) : un fichier au-delà d'une borne
 * est illisible, et un fichier trop gros n'est jamais lu.
 */
import { describe, expect, it, vi } from 'vitest';
import { MAX_NESTING_DEPTH, MAX_READ_BYTES } from '../../../src/ingest/bounds.js';
import { buildSeriesImagesManifest, diffSnapshots, guardChangeSet, validateSnapshot } from '../../../src/ingest/index.js';
import type { Diagnostic } from '../../../src/ingest/index.js';
import { readImagesManifest } from '../../../src/ingest/manifest.js';
import { resolveSeriesMedia } from '../../../src/media.js';
import { entry, memoryReader, snapshot } from './helpers.js';

const SERIES = '---\ntitle: Série\ndate: 2024-06-15\n---\nTexte.\n';
const PRIVATE = '---\ntitle: T\nprivate: true\n---\n';
const PUBLIC = '---\ntitle: T\n---\n';
const OVERSIZE = MAX_READ_BYTES + 1;

const triples = (diagnostics: Diagnostic[]) => diagnostics.map((d) => [d.code, d.severity, d.path]);

/** Lecteur qui échoue sur les chemins que la validation ne doit jamais lire. */
function forbidding(files: Record<string, string>, forbidden: string[]) {
  const read = memoryReader(files);
  return vi.fn(async (path: string) => {
    if (forbidden.includes(path)) throw new Error(`lecture interdite : ${path}`);
    return read(path);
  });
}

/** `images.json` d'exactement `bytes` octets, valide. */
function manifestOfSize(bytes: number): string {
  const head = '{"images":[],"pad":"';
  const tail = '"}';
  return `${head}${'x'.repeat(bytes - head.length - tail.length)}${tail}`;
}

const deepJson = (levels: number) => `{"images":[],"x":${'['.repeat(levels - 1)}${']'.repeat(levels - 1)}}`;

describe('validateSnapshot — un fichier index de plus de 1 Mio n\'est pas lu (règle 4)', () => {
  it('la taille déclarée suffit : frontmatter-invalid, aucune lecture', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES, { size: OVERSIZE }), entry('b/index.md', SERIES)]);
    const read = forbidding({ 'b/index.md': SERIES }, ['a/index.md']);
    expect(triples(await validateSnapshot(snap, { read }))).toEqual([['frontmatter-invalid', 'error', 'a/index.md']]);
    expect(read).not.toHaveBeenCalledWith('a/index.md');
  });

  it('1 048 576 octets déclarés se lisent', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES, { size: MAX_READ_BYTES })]);
    const read = forbidding({ 'a/index.md': SERIES }, []);
    expect(await validateSnapshot(snap, { read })).toEqual([]);
    expect(read).toHaveBeenCalledWith('a/index.md');
  });

  it('chaque fichier index est jugé à part : un `index.en.md` trop gros ne touche pas `index.md`', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES), entry('a/index.en.md', SERIES, { size: OVERSIZE })]);
    const read = forbidding({ 'a/index.md': SERIES }, ['a/index.en.md']);
    expect(triples(await validateSnapshot(snap, { read }))).toEqual([['frontmatter-invalid', 'error', 'a/index.en.md']]);
  });

  it('un fichier trop gros hors des racines est copié, pas jugé', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES), entry('hors/index.md', SERIES, { size: OVERSIZE })]);
    const read = forbidding({ 'a/index.md': SERIES }, ['hors/index.md']);
    expect(await validateSnapshot(snap, { read, roots: [{ path: 'a' }] })).toEqual([]);
  });

  it('un fichier non matérialisé n\'est jamais lu : pas de diagnostic de contenu en plus', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES, { size: OVERSIZE, state: 'placeholder' })]);
    const read = forbidding({}, ['a/index.md']);
    expect(triples(await validateSnapshot(snap, { read }))).toEqual([['entry-not-materialized', 'error', 'a/index.md']]);
  });

  it('un index illisible vaut série : la section parente n\'est pas devinée', async () => {
    const section = '---\ntype: section\ntitle: Rubrique\n---\n';
    const snap = await snapshot([entry('r/index.md', section, { size: OVERSIZE }), entry('r/s/index.md', SERIES)]);
    const read = forbidding({ 'r/s/index.md': SERIES }, ['r/index.md']);
    expect(triples(await validateSnapshot(snap, { read }))).toEqual([['frontmatter-invalid', 'error', 'r/index.md']]);
  });
});

describe('validateSnapshot — un `images.json` hors bornes est illisible (règles 4 et 6)', () => {
  const withManifest = async (manifest: string, size?: number) => {
    const files = {
      'a/index.md': '---\ntitle: T\ndate: 2024-06-15\ncover: ./media/01.jpg\n---\n',
      'a/images.json': manifest,
    };
    const snap = await snapshot([
      entry('a/index.md', files['a/index.md']),
      entry('a/images.json', manifest, size === undefined ? {} : { size }),
    ]);
    return { snap, read: forbidding(files, size !== undefined && size > MAX_READ_BYTES ? ['a/images.json'] : []) };
  };

  it('plus de 1 Mio déclaré : images-json-invalid, jamais lu, et il ne sert pas à trouver la couverture', async () => {
    const { snap, read } = await withManifest('{"images":["./media/01.jpg"]}', OVERSIZE);
    expect(triples(await validateSnapshot(snap, { read }))).toEqual([
      ['images-json-invalid', 'warning', 'a/images.json'],
      ['cover-not-found', 'warning', 'a/index.md'],
    ]);
    expect(read).not.toHaveBeenCalledWith('a/images.json');
  });

  it('32 niveaux de JSON passent, 33 non', async () => {
    const ok = await withManifest(deepJson(MAX_NESTING_DEPTH).replace('"images":[]', '"images":["./media/01.jpg"]'));
    expect(await validateSnapshot(ok.snap, { read: ok.read })).toEqual([]);
    const deep = await withManifest(deepJson(MAX_NESTING_DEPTH + 1).replace('"images":[]', '"images":["./media/01.jpg"]'));
    expect(triples(await validateSnapshot(deep.snap, { read: deep.read }))).toEqual([
      ['images-json-invalid', 'warning', 'a/images.json'],
      ['cover-not-found', 'warning', 'a/index.md'],
    ]);
  });
});

describe('validateSnapshot — les bornes du YAML dans un snapshot', () => {
  it('une bombe d\'alias dans un index de langue : seul ce fichier est illisible', async () => {
    const names = 'abcdefghij';
    const lines = [`a: &a [${Array(9).fill('"x"').join(',')}]`];
    for (let i = 1; i < 10; i++) lines.push(`${names[i]}: &${names[i]} [${Array(9).fill(`*${names[i - 1]}`).join(',')}]`);
    const bomb = `---\ntitle: T\ndate: 2024-06-15\n${lines.join('\n')}\n---\n`;
    const files = { 'a/index.md': SERIES, 'a/index.fr.md': bomb };
    const snap = await snapshot(Object.entries(files).map(([path, content]) => entry(path, content)));
    expect(triples(await validateSnapshot(snap, { read: memoryReader(files) }))).toEqual([
      ['frontmatter-invalid', 'error', 'a/index.fr.md'],
    ]);
  });
});

describe('guardChangeSet — un index de plus de 1 Mio n\'est pas lu (§4.10 règle 4, §4.11)', () => {
  const exposed = (diagnostics: Diagnostic[]) => triples(diagnostics.filter((d) => d.code === 'guard-private-exposed'));

  it('côté base, il rend la série privée par prudence : exposée si target ne l\'est pas', async () => {
    const base = await snapshot([entry('s/index.md', PRIVATE, { size: OVERSIZE })]);
    const target = await snapshot([entry('s/index.md', PUBLIC)]);
    const { diagnostics: _ignored, ...changeSet } = diffSnapshots(base, target);
    const read = vi.fn(async (side: 'base' | 'target', path: string) => {
      if (side === 'base') throw new Error(`lecture interdite : ${side} ${path}`);
      return PUBLIC;
    });
    expect(exposed(await guardChangeSet(changeSet, base, target, { read, policy: {} }))).toEqual([
      ['guard-private-exposed', 'error', 's'],
    ]);
  });

  it('côté target, il ne déclare rien : une série privée dans base y est exposée', async () => {
    const base = await snapshot([entry('s/index.md', PRIVATE)]);
    const target = await snapshot([entry('s/index.md', PRIVATE, { size: OVERSIZE })]);
    const { diagnostics: _ignored, ...changeSet } = diffSnapshots(base, target);
    const read = vi.fn(async (side: 'base' | 'target', path: string) => {
      if (side === 'target') throw new Error(`lecture interdite : ${side} ${path}`);
      return PRIVATE;
    });
    expect(exposed(await guardChangeSet(changeSet, base, target, { read, policy: {} }))).toEqual([
      ['guard-private-exposed', 'error', 's'],
    ]);
  });
});

describe('buildSeriesImagesManifest — un index de plus de 1 Mio n\'est pas lu', () => {
  it('rend null sans lire le fichier : on ne sait pas s\'il porte `images:`', async () => {
    const snap = await snapshot([entry('s/index.md', SERIES, { size: OVERSIZE }), entry('s/media/01.jpg')]);
    const read = vi.fn(async () => {
      throw new Error('lecture interdite');
    });
    expect(await buildSeriesImagesManifest(snap, 's', { read })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    const small = await snapshot([entry('s/index.md', SERIES), entry('s/media/01.jpg')]);
    expect(await buildSeriesImagesManifest(small, 's', { read: async () => SERIES })).toEqual({ images: ['./media/01.jpg'] });
  });
});

describe('readImagesManifest — bornes de lecture (§1.12)', () => {
  it('1 048 576 octets passent, un de plus non', () => {
    expect(readImagesManifest(manifestOfSize(MAX_READ_BYTES)).ok).toBe(true);
    expect(readImagesManifest(manifestOfSize(OVERSIZE))).toEqual({ ok: false, problem: 'limits' });
  });

  it('la taille est celle des octets UTF-8 : un texte court en caractères peut être trop gros', () => {
    const wide = `{"images":[],"pad":"${'€'.repeat(Math.ceil(MAX_READ_BYTES / 3))}"}`;
    expect(wide.length).toBeLessThan(MAX_READ_BYTES);
    expect(readImagesManifest(wide)).toEqual({ ok: false, problem: 'limits' });
  });

  it('32 niveaux passent, 33 non', () => {
    expect(readImagesManifest(deepJson(MAX_NESTING_DEPTH)).ok).toBe(true);
    expect(readImagesManifest(deepJson(MAX_NESTING_DEPTH + 1))).toEqual({ ok: false, problem: 'limits' });
  });

  it('des crochets dans une chaîne ne comptent pas', () => {
    expect(readImagesManifest(`{"images":[],"x":"${'['.repeat(500)}"}`).ok).toBe(true);
  });

  it('une valeur déjà parsée est jugée de même : profondeur et cycle', () => {
    let deep: unknown = [];
    for (let i = 1; i < MAX_NESTING_DEPTH; i++) deep = [deep];
    expect(readImagesManifest({ images: [], x: deep }).ok).toBe(false);
    expect(readImagesManifest({ images: [], x: [deep] })).toEqual({ ok: false, problem: 'limits' });
    const cyclic: Record<string, unknown> = { images: [] };
    cyclic.self = cyclic;
    expect(readImagesManifest(cyclic)).toEqual({ ok: false, problem: 'limits' });
  });

  it('un JSON de 40 000 entrées, sous 1 Mio, reste lisible : la borne de nœuds est celle du YAML', () => {
    const images = Array.from({ length: 40_000 }, (_, i) => `./media/${i}.jpg`);
    const text = JSON.stringify({ images });
    expect(text.length).toBeLessThan(MAX_READ_BYTES);
    expect(readImagesManifest(text).ok).toBe(true);
  });

  it('resolveSeriesMedia le range en images-json-invalid et se replie sur media/', () => {
    const resolved = resolveSeriesMedia({
      frontmatter: {},
      manifest: manifestOfSize(OVERSIZE),
      mediaFiles: ['01.jpg', '02.jpg'],
    });
    expect(resolved.diagnostics.map((d) => d.code)).toEqual(['images-json-invalid']);
    expect(resolved.source).toBe('media');
    expect(resolved.images).toHaveLength(2);
  });
});
