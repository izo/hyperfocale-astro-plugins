import { describe, expect, it } from 'vitest';
import { validateSnapshot } from '../../../src/ingest/index.js';
import type { ContentSnapshot, Diagnostic, SnapshotEntry, ValidationRoot } from '../../../src/ingest/index.js';
import { entry, memoryReader, snapshot } from './helpers.js';

const SERIES = '---\ntitle: Série\ndate: 2024-06-15\n---\nTexte.\n';
const SECTION = '---\ntype: section\ntitle: Section\n---\n';

/** Construit un corpus : chemin → contenu. Les fichiers non textuels ont un contenu fictif. */
async function corpus(files: Record<string, string>, extra: SnapshotEntry[] = []) {
  const snap = await snapshot([...Object.entries(files).map(([path, content]) => entry(path, content)), ...extra]);
  return { snap, read: memoryReader(files) };
}

async function validate(files: Record<string, string>, roots?: ValidationRoot[]) {
  const { snap, read } = await corpus(files);
  return triples(await validateSnapshot(snap, { read, ...(roots !== undefined ? { roots } : {}) }));
}

const triples = (diagnostics: Diagnostic[]) => diagnostics.map((d) => [d.code, d.severity, d.path]);

describe('validateSnapshot — snapshot et entrées', () => {
  it('un corpus conforme ne produit aucun diagnostic', async () => {
    expect(
      await validate({
        'archives/bretagne-2024/index.md': SERIES,
        'archives/bretagne-2024/index.en.md': SERIES,
        'archives/bretagne-2024/media/01.jpg': 'jpg',
        'archives/bretagne-2024/media/dossier.pdf': 'pdf',
        'archives/index.md': SECTION,
      }),
    ).toEqual([]);
  });

  it('version inconnue → snapshot-version-unsupported seul', async () => {
    const { snap, read } = await corpus({ 'a/index.md': SERIES });
    const diagnostics = await validateSnapshot({ ...snap, version: 2 } as unknown as ContentSnapshot, { read });
    expect(triples(diagnostics)).toEqual([['snapshot-version-unsupported', 'error', undefined]]);
  });

  it('snapshot incomplet et vide', async () => {
    const snap = await snapshot([entry('a/media/01.jpg')], false);
    const diagnostics = await validateSnapshot(snap, { read: memoryReader({}) });
    expect(triples(diagnostics)).toEqual([
      ['snapshot-empty', 'error', undefined],
      ['snapshot-incomplete', 'error', undefined],
      ['media-orphan', 'warning', 'a/media'],
    ]);
  });

  it('chemin invalide, non NFC, collision de casse, empreinte manquante, placeholder', async () => {
    const snap = await snapshot([
      entry('a/index.md', SERIES),
      entry('a/media/01.jpg'),
      entry('a/media/01.JPG'),
      entry('a/b\\c.txt'),
      entry('a/cafe\u0301.txt'),
      { path: 'a/nohash.txt', kind: 'other', size: 1 },
      { path: 'a/media/02.jpg', kind: 'media', size: 1, state: 'placeholder' },
    ]);
    const diagnostics = await validateSnapshot(snap, { read: memoryReader({ 'a/index.md': SERIES }) });
    expect(triples(diagnostics)).toEqual([
      ['entry-path-invalid', 'error', 'a/b\\c.txt'],
      ['entry-path-invalid', 'error', 'a/cafe\u0301.txt'],
      ['entry-path-collision', 'error', 'a/media/01.jpg'],
      ['entry-not-materialized', 'error', 'a/media/02.jpg'],
      ['entry-hash-missing', 'error', 'a/nohash.txt'],
    ]);
  });
});

describe('validateSnapshot — structure', () => {
  it('slug-invalid sur le dossier porteur, sections comprises', async () => {
    expect(
      await validate({
        'archives/Foo_Bar/index.md': SERIES,
        'archives/Music/index.md': SECTION,
        'archives/Music/ok-slug/index.md': SERIES,
      }),
    ).toEqual([
      ['slug-invalid', 'error', 'archives/Foo_Bar'],
      ['slug-invalid', 'error', 'archives/Music'],
    ]);
  });

  it('les dossiers de rangement sans index ne sont pas des slugs', async () => {
    expect(await validate({ 'Archives/2010/Concerts/ok/index.md': SERIES })).toEqual([]);
  });

  it('media-nested sur le premier dossier sous media/, media-orphan sur le media/ sans index', async () => {
    expect(
      await validate({
        'a/index.md': SERIES,
        'a/media/sub/deep/01.jpg': 'x',
        'a/media/sub/02.jpg': 'x',
        'b/media/01.jpg': 'x',
      }),
    ).toEqual([
      ['media-nested', 'error', 'a/media/sub'],
      ['media-orphan', 'warning', 'b/media'],
    ]);
  });

  it('index-default-missing : index de langue sans index.md', async () => {
    expect(await validate({ 'a/index.en.md': SERIES })).toEqual([['index-default-missing', 'warning', 'a']]);
    expect(await validate({ 'a/index.mdx': SERIES, 'a/index.en.md': SERIES })).toEqual([]);
  });

  it('nesting-too-deep : série sous une sous-série ; sections et rangement ne comptent pas', async () => {
    expect(
      await validate({
        'fest/index.md': SERIES,
        'fest/set/index.md': SERIES,
        'fest/set/encore/index.md': SERIES,
        'music/index.md': SECTION,
        'music/concerts/index.md': SECTION,
        'music/concerts/2010/show/index.md': SERIES,
        'music/concerts/2010/show/part/index.md': SERIES,
      }),
    ).toEqual([['nesting-too-deep', 'error', 'fest/set/encore']]);
  });

  it('section-has-media', async () => {
    expect(await validate({ 'music/index.md': SECTION, 'music/media/01.jpg': 'x' })).toEqual([
      ['section-has-media', 'warning', 'music'],
    ]);
  });

  it('hors racines : copié, pas validé', async () => {
    expect(
      await validate(
        { 'archives/ok/index.md': SERIES, 'pages/Bad_Slug/index.md': 'pas de frontmatter' },
        [{ path: 'archives' }],
      ),
    ).toEqual([]);
  });

  it('la racine elle-même n\'est pas soumise à la règle de slug', async () => {
    expect(await validate({ 'Archives/index.md': SECTION }, [{ path: 'Archives' }])).toEqual([]);
  });
});

describe('validateSnapshot — frontmatter', () => {
  it('frontmatter-missing, frontmatter-invalid (YAML illisible, non-mapping, bloc non refermé)', async () => {
    expect(
      await validate({
        'a/index.md': 'Pas de frontmatter',
        'b/index.md': '---\ntitle: [oops\n---\n',
        'c/index.md': '---\n- une liste\n---\n',
        'd/index.md': '---\ntitle: x\n',
      }),
    ).toEqual([
      ['frontmatter-missing', 'error', 'a/index.md'],
      ['frontmatter-invalid', 'error', 'b/index.md'],
      ['frontmatter-invalid', 'error', 'c/index.md'],
      ['frontmatter-missing', 'error', 'd/index.md'],
    ]);
  });

  it('BOM et fins de ligne CRLF sont tolérés', async () => {
    expect(await validate({ 'a/index.md': '\uFEFF---\r\ntitle: T\r\ndate: 2024-01-01\r\n---\r\n' })).toEqual([]);
  });

  it('title-missing, date-missing, date-invalid, type-invalid', async () => {
    expect(
      await validate({
        'a/index.md': '---\ndate: 2024-01-01\n---\n',
        'b/index.md': '---\ntitle: "  "\ndate: 2024-01-01\n---\n',
        'c/index.md': '---\ntitle: T\n---\n',
        'd/index.md': '---\ntitle: T\ndate: 15/06/2024\n---\n',
        'e/index.md': '---\ntitle: T\ndate: 2024-02-30\n---\n',
        'f/index.md': '---\ntitle: T\ndate: 2024-01-01\ntype: gallery\n---\n',
        'g/index.md': '---\n---\n',
      }),
    ).toEqual([
      ['title-missing', 'error', 'a/index.md'],
      ['title-missing', 'error', 'b/index.md'],
      ['date-missing', 'error', 'c/index.md'],
      ['date-invalid', 'error', 'd/index.md'],
      ['date-invalid', 'error', 'e/index.md'],
      ['type-invalid', 'error', 'f/index.md'],
      ['date-missing', 'error', 'g/index.md'],
      ['title-missing', 'error', 'g/index.md'],
    ]);
  });

  it('dates ISO acceptées : date nue, date-heure, fuseau, chaîne citée', async () => {
    for (const date of ['2024-06-15', '2024-06-15T10:00:00Z', '2024-06-15T10:00:00+02:00', '"2024-06-15"']) {
      expect(await validate({ 'a/index.md': `---\ntitle: T\ndate: ${date}\n---\n` })).toEqual([]);
    }
  });

  it('pas de date requise pour une section, ni sous une racine nodate', async () => {
    expect(await validate({ 's/index.md': SECTION })).toEqual([]);
    expect(await validate({ 'brands/acme/index.md': '---\ntitle: Acme\n---\n' }, [{ path: 'brands', dateRequired: false }])).toEqual([]);
  });

  it('la racine la plus spécifique décide de dateRequired', async () => {
    const files = { 'x/a/index.md': '---\ntitle: A\n---\n', 'x/nodate/b/index.md': '---\ntitle: B\n---\n' };
    expect(await validate(files, [{ path: 'x' }, { path: 'x/nodate', dateRequired: false }])).toEqual([
      ['date-missing', 'error', 'x/a/index.md'],
    ]);
  });

  it('chaque fichier index est validé indépendamment', async () => {
    expect(await validate({ 'a/index.md': SERIES, 'a/index.en.md': '---\ntitle: EN\n---\n' })).toEqual([
      ['date-missing', 'error', 'a/index.en.md'],
    ]);
  });

  it('un champ refusé par baseSeriesSchema remonte en frontmatter-invalid', async () => {
    expect(await validate({ 'a/index.md': '---\ntitle: T\ndate: 2024-01-01\ntags: solo\n---\n' })).toEqual([
      ['frontmatter-invalid', 'error', 'a/index.md'],
    ]);
  });

  it('cover-not-found (warning), cover-not-image (error), cover trouvée dans le snapshot ou images.json', async () => {
    const withCover = (cover: string) => `---\ntitle: T\ndate: 2024-01-01\ncover: "${cover}"\n---\n`;
    expect(
      await validate({
        'a/index.md': withCover('./media/01.jpg'),
        'a/media/01.jpg': 'x',
        'b/index.md': withCover('./media/absente.jpg'),
        'c/index.md': withCover('./media/doc.pdf'),
        'c/media/doc.pdf': 'x',
        'd/index.md': withCover('./media/03.jpg'),
        'd/images.json': JSON.stringify({ images: ['/content/d/media/03.jpg'] }),
        'e/index.md': withCover('./sub/media/01.jpg'),
        'e/sub/index.md': SERIES,
        'e/sub/media/01.jpg': 'x',
        'f/index.md': withCover('https://cdn.example.com/f.jpg'),
        'g/index.md': withCover('../../outside.jpg'),
      }),
    ).toEqual([
      ['cover-not-found', 'warning', 'b/index.md'],
      ['cover-not-image', 'error', 'c/index.md'],
      ['cover-not-found', 'warning', 'g/index.md'],
    ]);
  });

  it('images-conflict et images-json-invalid', async () => {
    expect(
      await validate({
        'a/index.md': '---\ntitle: T\ndate: 2024-01-01\nimages:\n  - url: https://cdn.example.com/1.jpg\n---\n',
        'a/images.json': '{"images": []}',
        'b/index.md': SERIES,
        'b/images.json': '{"images": "nope"}',
        'c/index.md': SERIES,
        'c/images.json': '{',
      }),
    ).toEqual([
      ['images-conflict', 'error', 'a/index.md'],
      ['images-json-invalid', 'warning', 'b/images.json'],
      ['images-json-invalid', 'warning', 'c/images.json'],
    ]);
  });

  it('attachment-not-found : entrée absente de media/', async () => {
    const fm = '---\ntitle: T\ndate: 2024-01-01\nattachments:\n  - file: ./media/ok.pdf\n  - file: absent.pdf\n  - file: ./ailleurs/x.pdf\n---\n';
    expect(await validate({ 'a/index.md': fm, 'a/media/ok.pdf': 'x', 'a/ailleurs/x.pdf': 'x' })).toEqual([
      ['attachment-not-found', 'warning', 'a/index.md'],
      ['attachment-not-found', 'warning', 'a/index.md'],
    ]);
  });

  it('embed-url-missing, sans doublon frontmatter-invalid', async () => {
    const fm = '---\ntitle: T\ndate: 2024-01-01\nembeds:\n  - platform: vimeo\n    id: "1"\n  - url: https://vimeo.com/2\n---\n';
    expect(await validate({ 'a/index.md': fm })).toEqual([['embed-url-missing', 'error', 'a/index.md']]);
  });

  it('propage une erreur de lecture plutôt que de conclure', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES)]);
    await expect(validateSnapshot(snap, { read: memoryReader({}) })).rejects.toThrow(/absent/);
  });
});
