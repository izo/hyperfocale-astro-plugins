import { describe, expect, it } from 'vitest';
import { validateSnapshot } from '../../../src/ingest/index.js';
import type { ContentSnapshot, Diagnostic, SnapshotEntry, ValidationRoot } from '../../../src/ingest/index.js';
import { entry, memoryReader, sha256, snapshot } from './helpers.js';

const SERIES = '---\ntitle: Série\ndate: 2024-06-15\n---\nTexte.\n';
const SECTION = '---\ntype: section\ntitle: Section\n---\n';

/** Construit un corpus : chemin → contenu. Les fichiers non textuels ont un contenu fictif. */
async function corpus(files: Record<string, string>, extra: SnapshotEntry[] = []) {
  const snap = await snapshot([...Object.entries(files).map(([path, content]) => entry(path, content)), ...extra]);
  return { snap, read: memoryReader(files) };
}

async function validate(files: Record<string, string>, roots?: ValidationRoot[], astroSchema = false) {
  const { snap, read } = await corpus(files);
  return triples(await validateSnapshot(snap, { read, astroSchema, ...(roots !== undefined ? { roots } : {}) }));
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
    expect(triples(diagnostics)).toEqual([['snapshot-version-unsupported', 'error', '']]);
  });

  it('snapshot incomplet et vide', async () => {
    const snap = await snapshot([entry('a/media/01.jpg')], false);
    const diagnostics = await validateSnapshot(snap, { read: memoryReader({}) });
    expect(triples(diagnostics)).toEqual([
      ['snapshot-empty', 'error', ''],
      ['snapshot-incomplete', 'error', ''],
      ['media-orphan', 'warning', 'a/media'],
    ]);
  });

  it('chemin invalide, non NFC, exclu, collision de casse, empreinte manquante, placeholder', async () => {
    const snap = await snapshot([
      entry('a/index.md', SERIES),
      entry('a/media/01.jpg'),
      entry('a/media/01.JPG'),
      entry('a/media/01.Jpg'),
      entry('a/b\\c.txt'),
      entry('a/cafe\u0301.txt'),
      entry('a/media/.DS_Store'),
      { path: 'a/nohash.txt', kind: 'other', size: 1 },
      { path: 'a/media/02.jpg', kind: 'media', size: 1, state: 'placeholder' },
    ]);
    const diagnostics = await validateSnapshot(snap, { read: memoryReader({ 'a/index.md': SERIES }) });
    expect(triples(diagnostics)).toEqual([
      ['entry-path-invalid', 'error', 'a/b\\c.txt'],
      ['entry-path-invalid', 'error', 'a/cafe\u0301.txt'],
      ['entry-path-invalid', 'error', 'a/media/.DS_Store'],
      // Le second chemin de chaque groupe dans l'ordre canonique, et les suivants.
      ['entry-path-collision', 'error', 'a/media/01.Jpg'],
      ['entry-path-collision', 'error', 'a/media/01.jpg'],
      ['entry-not-materialized', 'error', 'a/media/02.jpg'],
      ['entry-hash-missing', 'error', 'a/nohash.txt'],
    ]);
  });

  it('un snapshot se vérifie : id recalculé, kind contredit par le chemin recalculé', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES), entry('a/media/01.jpg')]);
    const tampered = {
      ...snap,
      id: 'sha256:0000',
      entries: snap.entries.map((e) => (e.path === 'a/index.md' ? { ...e, kind: 'other' as const } : e)),
    };
    const diagnostics = await validateSnapshot(tampered, { read: memoryReader({ 'a/index.md': SERIES }) });
    // index.md, déclaré `other`, reste lu comme fichier index : ni snapshot-empty, ni media-orphan.
    expect(triples(diagnostics)).toEqual([
      ['snapshot-id-mismatch', 'error', ''],
      ['entry-kind-mismatch', 'error', 'a/index.md'],
    ]);
  });

  it('une entrée au chemin invalide est écartée du reste : ni contenu, ni structure', async () => {
    const snap = await snapshot([entry('/abs/index.md', 'x'), entry('ok/media/01.jpg')]);
    const diagnostics = await validateSnapshot(snap, { read: memoryReader({}) });
    expect(triples(diagnostics)).toEqual([
      ['snapshot-empty', 'error', ''],
      ['entry-path-invalid', 'error', '/abs/index.md'],
      ['media-orphan', 'warning', 'ok/media'],
    ]);
  });

  it('octets lus divergents : entry-hash-mismatch, le fichier est traité comme non lu', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES), entry('a/images.json', '{"images": []}')]);
    const read = memoryReader({ 'a/index.md': 'réécrit depuis le listing', 'a/images.json': '{' });
    const diagnostics = await validateSnapshot(snap, { read });
    // Ni frontmatter-missing ni images-json-invalid : ce qui a été lu n'est pas ce qui a été listé.
    expect(triples(diagnostics)).toEqual([
      ['entry-hash-mismatch', 'error', 'a/images.json'],
      ['entry-hash-mismatch', 'error', 'a/index.md'],
    ]);
  });

  it('règle 13 : un index aux octets divergents vaut série, sa section n\'est pas devinée', async () => {
    const files = { 'a/index.md': SECTION, 'a/b/index.md': SERIES, 'a/b/c/index.md': SERIES };
    const { snap } = await corpus(files);
    // a/index.md déclare `type: section`, mais ce qui est lu n'est pas ce qui a été listé.
    const read = memoryReader({ ...files, 'a/index.md': `${SECTION}réécrit` });
    expect(triples(await validateSnapshot(snap, { read }))).toEqual([
      ['nesting-too-deep', 'error', 'a/b/c'],
      ['entry-hash-mismatch', 'error', 'a/index.md'],
    ]);
    // Lisible, la section ne compte pas : plus d'imbrication fautive.
    expect(triples(await validateSnapshot(snap, { read: memoryReader(files) }))).toEqual([]);
  });

  it('un fichier index en conflit n\'est pas lu ; une entrée mal formée est écartée', async () => {
    const snap = {
      ...(await snapshot([entry('a/media/01.jpg')])),
      entries: [
        { path: 'a/index.md', kind: 'content', size: 10, state: 'conflict' },
        entry('a/media/01.jpg'),
        { path: 'a/media/02.jpg', kind: 'media', size: -1 },
        { kind: 'other', size: 1 },
      ],
    };
    const diagnostics = await validateSnapshot(snap, { read: memoryReader({}) });
    // Une entrée invalide rend l'id non recalculable : pas de snapshot-id-mismatch.
    expect(triples(diagnostics)).toEqual([
      ['entry-invalid', 'error', ''],
      ['entry-conflict', 'error', 'a/index.md'],
      ['entry-invalid', 'error', 'a/media/02.jpg'],
    ]);
  });

  it('rejet structurel : seul snapshot-invalid, dans l\'ordre format, version, champs', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES)]);
    const read = memoryReader({});
    const only = async (doc: unknown) => triples(await validateSnapshot(doc, { read }));
    expect(await only({ ...snap, format: 'autre', version: 2 })).toEqual([['snapshot-invalid', 'error', '']]);
    expect(await only({ ...snap, version: 2, complete: 'yes' })).toEqual([['snapshot-version-unsupported', 'error', '']]);
    expect(await only({ ...snap, complete: 'yes' })).toEqual([['snapshot-invalid', 'error', '']]);
    expect(await only(null)).toEqual([['snapshot-invalid', 'error', '']]);
  });

  it('un fichier index placeholder n\'est pas lu et vaut série', async () => {
    const snap = await snapshot([
      { path: 'a/index.md', kind: 'content', size: 10, state: 'placeholder' },
      entry('a/media/01.jpg'),
    ]);
    const diagnostics = await validateSnapshot(snap, { read: memoryReader({}) });
    expect(triples(diagnostics)).toEqual([['entry-not-materialized', 'error', 'a/index.md']]);
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
  it('frontmatter-missing, frontmatter-invalid (YAML illisible, non-mapping, vide, clé dupliquée)', async () => {
    expect(
      await validate({
        'a/index.md': 'Pas de frontmatter',
        'b/index.md': '---\ntitle: [oops\n---\n',
        'c/index.md': '---\n- une liste\n---\n',
        'd/index.md': '---\ntitle: x\n',
        'e/index.md': '---\n---\n',
        'f/index.md': '---\ntitle: a\ntitle: b\ndate: 2024-01-01\n---\n',
        'g/index.md': '--- \ntitle: T\ndate: 2024-01-01\n---\n',
      }),
    ).toEqual([
      ['frontmatter-missing', 'error', 'a/index.md'],
      ['frontmatter-invalid', 'error', 'b/index.md'],
      ['frontmatter-invalid', 'error', 'c/index.md'],
      ['frontmatter-missing', 'error', 'd/index.md'],
      ['frontmatter-invalid', 'error', 'e/index.md'],
      ['frontmatter-invalid', 'error', 'f/index.md'],
      ['frontmatter-missing', 'error', 'g/index.md'],
    ]);
  });

  it('des octets UTF-8 invalides rendent le fichier illisible', async () => {
    const bytes = new Uint8Array([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe, 0x0a, 0x2d, 0x2d, 0x2d, 0x0a]);
    const hashed = { size: bytes.length, hashes: { sha256: sha256(bytes) } };
    const snap = await snapshot([
      { path: 'a/index.md', kind: 'content', ...hashed },
      { path: 'a/images.json', kind: 'derived', ...hashed },
    ]);
    const diagnostics = await validateSnapshot(snap, { read: async () => bytes });
    expect(triples(diagnostics)).toEqual([
      ['images-json-invalid', 'warning', 'a/images.json'],
      ['frontmatter-invalid', 'error', 'a/index.md'],
    ]);
  });

  it('BOM et fins de ligne CRLF sont tolérés', async () => {
    expect(await validate({ 'a/index.md': '\uFEFF---\r\ntitle: T\r\ndate: 2024-01-01\r\n---\r\n' })).toEqual([]);
  });

  it('title-missing, date-missing, date-invalid, type-invalid', async () => {
    expect(
      await validate({
        'a/index.md': '---\ndate: 2024-01-01\n---\n',
        'b/index.md': '---\ntitle: ""\ndate: 2024-01-01\n---\n',
        'c/index.md': '---\ntitle: T\n---\n',
        'd/index.md': '---\ntitle: T\ndate: 15/06/2024\n---\n',
        'e/index.md': '---\ntitle: T\ndate: 2024-02-30\n---\n',
        'f/index.md': '---\ntitle: T\ntype: gallery\n---\n',
        'g/index.md': '---\ntitle: "  "\ndate: 2024-01-01\n---\n',
        'h/index.md': '---\ntitle: T\ndate: 2024-06-15 10:00\n---\n',
        'i/index.md': '---\ntitle: T\ndate: 2024-06-15T24:00\n---\n',
        'j/index.md': '---\ntitle: T\ndate: 2024\n---\n',
        'k/index.md': '---\ntitle: T\ndate: ~\ntype: null\n---\n',
      }),
    ).toEqual([
      ['title-missing', 'error', 'a/index.md'],
      ['title-missing', 'error', 'b/index.md'],
      ['date-missing', 'error', 'c/index.md'],
      ['date-invalid', 'error', 'd/index.md'],
      ['date-invalid', 'error', 'e/index.md'],
      // `type` invalide : le fichier est traité en série, donc daté.
      ['date-missing', 'error', 'f/index.md'],
      ['type-invalid', 'error', 'f/index.md'],
      ['date-invalid', 'error', 'h/index.md'],
      ['date-invalid', 'error', 'i/index.md'],
      ['date-invalid', 'error', 'j/index.md'],
      // `null` vaut absent.
      ['date-missing', 'error', 'k/index.md'],
    ]);
  });

  it('dates ISO acceptées : date nue, heure, secondes, fraction, fuseau, chaîne citée', async () => {
    for (const date of ['2024-06-15', '2024-06-15T10:00', '2024-06-15T10:00:59.123Z', '2024-06-15T10:00:00+02:00', '"2024-02-29"']) {
      expect(await validate({ 'a/index.md': `---\ntitle: T\ndate: ${date}\n---\n` })).toEqual([]);
    }
  });

  it('pas de date requise pour une section, ni sous une racine nodate', async () => {
    expect(await validate({ 's/index.md': SECTION })).toEqual([]);
    // La date d'une section n'est pas vérifiée par le §4.10…
    expect(await validate({ 's/index.md': '---\ntype: section\ntitle: S\ndate: 2024-02-30\n---\n' })).toEqual([]);
    // … mais le build la refuserait si elle n'est pas une date du tout : `astroSchema` le dit.
    const hier = { 's/index.md': '---\ntype: section\ntitle: S\ndate: hier\n---\n' };
    expect(await validate(hier)).toEqual([]);
    expect(await validate(hier, undefined, true)).toEqual([['x-schema-invalid', 'error', 's/index.md']]);
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

  it('astroSchema : un champ refusé par baseSeriesSchema remonte en x-schema-invalid, un par fichier', async () => {
    const files = { 'a/index.md': '---\ntitle: T\ndate: 2024-01-01\ntags: solo\nfeatured: oui\n---\n' };
    // Par défaut, la sortie est exactement celle de la spec.
    expect(await validate(files)).toEqual([]);
    expect(await validate(files, undefined, true)).toEqual([['x-schema-invalid', 'error', 'a/index.md']]);
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

  it('attachment-not-found : référence relative résolue directement dans media/', async () => {
    const ok = '---\ntitle: T\ndate: 2024-01-01\nattachments:\n  - file: ./media/ok.pdf\n  - file: media/ok.pdf\n---\n';
    expect(await validate({ 'a/index.md': ok, 'a/media/ok.pdf': 'x' })).toEqual([]);
    for (const file of ['ok.pdf', './ailleurs/x.pdf', '/a/media/ok.pdf', './media/absent.pdf']) {
      const fm = `---\ntitle: T\ndate: 2024-01-01\nattachments:\n  - file: "${file}"\n---\n`;
      expect(await validate({ 'a/index.md': fm, 'a/ok.pdf': 'x', 'a/media/ok.pdf': 'x', 'a/ailleurs/x.pdf': 'x' })).toEqual([
        ['attachment-not-found', 'warning', 'a/index.md'],
      ]);
    }
    // Entrée sans `file` : introuvable elle aussi, un seul diagnostic par fichier —
    // et refusée par le schéma du build, qui exige `file`, si on le demande.
    const many = '---\ntitle: T\ndate: 2024-01-01\nattachments:\n  - title: sans fichier\n  - file: ./media/x.pdf\n---\n';
    expect(await validate({ 'a/index.md': many })).toEqual([['attachment-not-found', 'warning', 'a/index.md']]);
    expect(await validate({ 'a/index.md': many }, undefined, true)).toEqual([
      ['attachment-not-found', 'warning', 'a/index.md'],
      ['x-schema-invalid', 'error', 'a/index.md'],
    ]);
  });

  it('embed-url-missing : entrée sans url, ou qui n\'est pas un objet ; sans doublon de schéma', async () => {
    const fm = '---\ntitle: T\ndate: 2024-01-01\nembeds:\n  - platform: vimeo\n    id: "1"\n  - url: https://vimeo.com/2\n---\n';
    expect(await validate({ 'a/index.md': fm })).toEqual([['embed-url-missing', 'error', 'a/index.md']]);
    const scalar = '---\ntitle: T\ndate: 2024-01-01\nembeds:\n  - https://vimeo.com/2\n---\n';
    expect(await validate({ 'a/index.md': scalar })).toEqual([['embed-url-missing', 'error', 'a/index.md']]);
  });

  it('propage une erreur de lecture plutôt que de conclure', async () => {
    const snap = await snapshot([entry('a/index.md', SERIES)]);
    await expect(validateSnapshot(snap, { read: memoryReader({}) })).rejects.toThrow(/absent/);
  });
});
