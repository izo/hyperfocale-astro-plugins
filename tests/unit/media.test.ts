/**
 * Résolveur de médias pur — `@regrets/hyperfocale/media` (#130).
 *
 * Deux niveaux : les règles de la spec une à une (§1.5, §1.5.1, §1.6, §1.8,
 * §1.9, §1.11, et §1.5.1 v2.12 pour les entrées locales de `images:`), puis le
 * rejeu des corpus de fixtures de la spec (tests/fixtures/spec-ingestion/) :
 * pour chaque série de chaque corpus validé par une fixture, les diagnostics
 * du résolveur doivent être exactement ceux que la fixture attend sur cette
 * série, parmi les codes qui relèvent des médias.
 */

import { describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  IMAGE_EXTENSIONS,
  ORIGINAL_EXTENSIONS,
  classifyAttachment,
  isImagePath,
  parseImageManifest,
  resolveSeriesMedia,
} from '../../src/media.js';
import type { MediaDiagnosticCode, ResolveSeriesMediaInput } from '../../src/media.js';
import { applyImageProvider, fallbackSrc, isResolvedImage } from '../../src/media.js';
import * as helpers from '../../src/helpers/index.js';
import { ORIGINAL_EXTENSIONS as SCHEMA_ORIGINAL_EXTENSIONS } from '../../src/schema.js';
import { parseFrontmatter } from '../../src/ingest/frontmatter.js';
import { readSeriesMedia } from '../../src/loader.js';

const FIXTURES = resolve(__dirname, '../fixtures/spec-ingestion');
const resolveWith = (input: Partial<ResolveSeriesMediaInput>) => resolveSeriesMedia({ frontmatter: {}, ...input });
const codes = (input: Partial<ResolveSeriesMediaInput>) => resolveWith(input).diagnostics.map((d) => d.code).sort();

describe('primitives partagées', () => {
  it('les helpers réexportent les primitives de /media, sans copie', () => {
    expect(helpers.classifyAttachment).toBe(classifyAttachment);
    expect(helpers.parseImageManifest).toBe(parseImageManifest);
  });

  it('les originaux de /media sont ceux du schéma', () => {
    expect([...ORIGINAL_EXTENSIONS]).toEqual([...SCHEMA_ORIGINAL_EXTENSIONS]);
  });

  it('IMAGE_EXTENSIONS est la classe image de §1.9', () => {
    expect([...IMAGE_EXTENSIONS]).toEqual(['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff']);
    expect(isImagePath('a/DSCF0001.TIF')).toBe(true);
  });
});

describe('galerie — scan de media/ (§1.6)', () => {
  it('images seulement, ordre canonique, sans originaux ni documents', () => {
    const r = resolveWith({ mediaFiles: ['02.jpg', '10.png', '01.JPG', 'a.RAF', 'a.xmp', 'notes.pdf', '.DS_Store'] });
    expect(r.source).toBe('media');
    expect(r.images.map((i) => i.path)).toEqual(['media/01.JPG', 'media/02.jpg', 'media/10.png']);
    expect(r.diagnostics).toEqual([]);
  });

  it('URL relative par défaut, ou rendue par `url`', () => {
    expect(resolveWith({ mediaFiles: ['01.jpg'] }).images[0]?.src).toBe('./media/01.jpg');
    const r = resolveWith({ mediaFiles: ['01.jpg'], url: (p) => `/content/archives/x/${p}` });
    expect(r.images[0]).toEqual({ src: '/content/archives/x/media/01.jpg', path: 'media/01.jpg' });
  });

  it('pas de récursion : un sous-dossier de media/ est ignoré et signalé (§1.2)', () => {
    const r = resolveWith({ mediaFiles: ['01.jpg', 'raw/01.tif', 'raw/'] });
    expect(r.images.map((i) => i.path)).toEqual(['media/01.jpg']);
    expect(r.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['media-nested', 'error'],
      ['media-nested', 'error'],
    ]);
  });

  it('les posters d\'embeds sortent du scan (§1.11)', () => {
    const r = resolveWith({
      frontmatter: { embeds: [{ url: 'https://vimeo.com/1', poster: './media/poster.jpg' }] },
      mediaFiles: ['01.jpg', 'poster.jpg'],
    });
    expect(r.images.map((i) => i.path)).toEqual(['media/01.jpg']);
  });

  it('media/ inconnu : rien à scanner', () => {
    expect(resolveWith({}).source).toBe('none');
    expect(resolveWith({}).images).toEqual([]);
    expect(resolveWith({}).cover).toBeUndefined();
  });
});

describe('galerie — images.json (§1.5.1)', () => {
  it('l\'ordre du manifeste fait foi, pas l\'ordre alphabétique', () => {
    const r = resolveWith({ manifest: '{"images":["./media/02.jpg","./media/01.jpg"]}', mediaFiles: ['01.jpg', '02.jpg'] });
    expect(r.source).toBe('manifest');
    expect(r.images.map((i) => i.path)).toEqual(['media/02.jpg', 'media/01.jpg']);
  });

  it('formes courte et longue, trois formes d\'URL', () => {
    const r = resolveWith({
      manifest: {
        images: [
          'https://cdn.example.com/a.jpg',
          '/content/x/media/b.jpg',
          { url: './media/c.jpg', alt: 'C', width: 3000, height: 2000 },
        ],
      },
    });
    expect(r.images).toEqual([
      { src: 'https://cdn.example.com/a.jpg' },
      { src: '/content/x/media/b.jpg' },
      { src: './media/c.jpg', path: 'media/c.jpg', alt: 'C', width: 3000, height: 2000 },
    ]);
  });

  it('le manifeste vaut liste de R2 : une entrée relative n\'est pas confrontée à media/', () => {
    const r = resolveWith({ manifest: '{"images":["./media/01.jpg"]}', mediaFiles: [] });
    expect(r.images.map((i) => i.path)).toEqual(['media/01.jpg']);
  });

  it('écarte les originaux et les entrées sans URL', () => {
    const r = resolveWith({ manifest: { images: ['./media/a.RAF', 'https://cdn/b.CR3?v=2', {}, '', './media/c.jpg'] } });
    expect(r.images.map((i) => i.src)).toEqual(['./media/c.jpg']);
  });

  it('JSON illisible : repli sur media/, diagnostic, aucune exception, aucun console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const manifest of ['{"images": [', '{"images":"01.jpg"}', '[]', '42']) {
      const r = resolveWith({ manifest, mediaFiles: ['01.jpg'] });
      expect(r.source).toBe('media');
      expect(r.diagnostics.map((d) => [d.code, d.severity])).toEqual([['images-json-invalid', 'warning']]);
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('clé files : documents joints du manifeste', () => {
    const r = resolveWith({
      manifest: { images: [], files: [{ url: 'https://cdn/dossier.pdf', title: 'Dossier', size: 12 }, { url: 'https://cdn/a.RAF' }] },
      mediaFiles: ['notes.pdf'],
    });
    expect(r.attachments).toEqual([{ src: 'https://cdn/dossier.pdf', kind: 'document', title: 'Dossier', size: 12 }]);
  });
});

describe('galerie — images: du frontmatter (§1.5, §1.5.1 v2.12)', () => {
  it('prioritaire sur images.json, avec images-conflict', () => {
    const r = resolveWith({
      frontmatter: { images: [{ url: 'https://cdn/a.jpg' }] },
      manifest: '{"images":["https://cdn/b.jpg"]}',
    });
    expect(r.source).toBe('frontmatter');
    expect(r.images.map((i) => i.src)).toEqual(['https://cdn/a.jpg']);
    expect(r.diagnostics.map((d) => [d.code, d.severity])).toEqual([['images-conflict', 'error']]);
  });

  it('entrées locales relatives, formes courte et longue, dans l\'ordre écrit (v2.12)', () => {
    const r = resolveWith({
      frontmatter: { images: ['./media/03.jpg', { url: './media/01.jpg', alt: 'Un' }, 'media/02.jpg'] },
      mediaFiles: ['01.jpg', '02.jpg', '03.jpg'],
      url: (p) => `/c/${p}`,
    });
    expect(r.images).toEqual([
      { src: '/c/media/03.jpg', path: 'media/03.jpg' },
      { src: '/c/media/01.jpg', path: 'media/01.jpg', alt: 'Un' },
      { src: '/c/media/02.jpg', path: 'media/02.jpg' },
    ]);
    // La couverture par défaut suit l'ordre éditorial, pas l'alphabet.
    expect(r.cover?.path).toBe('media/03.jpg');
  });

  it('extensions du plugin : { file } et { src }', () => {
    const r = resolveWith({
      frontmatter: { images: [{ file: '02.jpg', alt: 'Deux' }, { file: 'absent.jpg' }, { src: { src: '/_astro/a.webp', width: 10, height: 5 } }] },
      mediaFiles: ['02.jpg'],
    });
    expect(r.images).toEqual([
      { src: './media/02.jpg', path: 'media/02.jpg', alt: 'Deux' },
      { src: '/_astro/a.webp', width: 10, height: 5 },
    ]);
  });

  it('`images: []` ou `images: null` valent absents', () => {
    expect(resolveWith({ frontmatter: { images: [] }, mediaFiles: ['01.jpg'] }).source).toBe('media');
    expect(resolveWith({ frontmatter: { images: null }, manifest: '{"images":[]}' }).diagnostics).toEqual([]);
  });
});

describe('couverture (§1.6, §1.5.1, §1.8, §1.9)', () => {
  it('défaut : première image du scan, ou première entrée du manifeste', () => {
    expect(resolveWith({ mediaFiles: ['b.jpg', 'a.jpg'] }).cover?.path).toBe('media/a.jpg');
    expect(resolveWith({ manifest: '{"images":["./media/b.jpg","./media/a.jpg"]}' }).cover?.path).toBe('media/b.jpg');
  });

  it('cover explicite, enrichi de l\'alt et des dimensions du manifeste', () => {
    const r = resolveWith({
      frontmatter: { cover: './media/b.jpg' },
      manifest: { images: ['./media/a.jpg', { url: './media/b.jpg', alt: 'B', width: 3 }] },
    });
    expect(r.cover).toEqual({ src: './media/b.jpg', path: 'media/b.jpg', alt: 'B', width: 3 });
  });

  it('cover trouvé dans un manifeste à chemins absolus au site, par suffixe', () => {
    const r = resolveWith({
      frontmatter: { cover: './media/02.jpg' },
      manifest: '{"images":["/content/s/media/01.jpg","/content/s/media/02.jpg"]}',
    });
    expect(r.cover).toEqual({ src: '/content/s/media/02.jpg' });
    expect(r.diagnostics).toEqual([]);
  });

  it('cover vers un document ou un original : cover-not-image, repli sur la première image', () => {
    for (const cover of ['./media/dossier.pdf', './media/DSCF0001.RAF']) {
      const r = resolveWith({ frontmatter: { cover }, mediaFiles: ['01.jpg', 'dossier.pdf', 'DSCF0001.RAF'] });
      expect(r.diagnostics.map((d) => d.code)).toEqual(['cover-not-image']);
      expect(r.cover?.path).toBe('media/01.jpg');
    }
  });

  it('cover absent de media/ : cover-not-found, repli', () => {
    const r = resolveWith({ frontmatter: { cover: './media/zz.jpg' }, mediaFiles: ['01.jpg'] });
    expect(r.diagnostics.map((d) => [d.code, d.severity])).toEqual([['cover-not-found', 'warning']]);
    expect(r.cover?.path).toBe('media/01.jpg');
  });

  it('cover qui sort du corpus : cover-not-found', () => {
    expect(codes({ frontmatter: { cover: '../../x.jpg' }, mediaFiles: [] })).toEqual(['cover-not-found']);
  });

  it('cover d\'un conteneur vers une sous-série (§1.8) : rendu sans vérification', () => {
    const r = resolveWith({ frontmatter: { cover: './the-wombats/media/01.jpg' }, mediaFiles: ['01.jpg'], url: (p) => `/c/${p}` });
    expect(r.cover).toEqual({ src: '/c/the-wombats/media/01.jpg', path: 'the-wombats/media/01.jpg' });
    expect(r.diagnostics).toEqual([]);
  });

  it('cover = poster d\'embed : désigné explicitement, il est légitime (§1.11)', () => {
    const r = resolveWith({
      frontmatter: { cover: './media/p.jpg', embeds: [{ url: 'https://vimeo.com/1', poster: './media/p.jpg' }] },
      mediaFiles: ['p.jpg'],
    });
    expect(r.images).toEqual([]);
    expect(r.cover?.path).toBe('media/p.jpg');
    expect(r.diagnostics).toEqual([]);
  });

  it('cover URL absolue : rendu tel quel', () => {
    expect(resolveWith({ frontmatter: { cover: 'https://cdn/c.jpg' } }).cover).toEqual({ src: 'https://cdn/c.jpg' });
  });

  it('media/ inconnu : un cover relatif n\'est pas vérifiable, il est rendu', () => {
    const r = resolveWith({ frontmatter: { cover: './media/01.jpg' } });
    expect(r.cover?.path).toBe('media/01.jpg');
    expect(r.diagnostics).toEqual([]);
  });
});

describe('documents joints (§1.9)', () => {
  it('fichiers de media/ hors images et originaux, triés, enrichis par attachments:', () => {
    const r = resolveWith({
      frontmatter: { attachments: [{ file: './media/interview.mp3', title: 'Interview', description: 'Radio' }] },
      mediaFiles: [{ name: 'trace.gpx', size: 4 }, '01.jpg', 'interview.mp3', 'a.RAF', 'a.xmp', 'index.md', 'images.json'],
    });
    expect(r.attachments).toEqual([
      { src: './media/interview.mp3', kind: 'audio', title: 'Interview', description: 'Radio' },
      { src: './media/trace.gpx', kind: 'file', title: 'trace.gpx', size: 4 },
    ]);
  });

  it('files: du frontmatter prioritaire, originaux écartés', () => {
    const r = resolveWith({
      frontmatter: { files: [{ url: 'https://cdn/a.zip', kind: 'file' }, { url: 'https://cdn/b.NEF' }] },
      mediaFiles: ['notes.pdf'],
    });
    expect(r.attachments).toEqual([{ src: 'https://cdn/a.zip', kind: 'file', title: 'a.zip' }]);
  });

  it('attachments: vers un fichier absent, un original ou une entrée mal formée : attachment-not-found', () => {
    const r = resolveWith({
      frontmatter: { attachments: [{ file: './media/absent.pdf' }, { file: './media/a.RAF' }, './media/x.pdf', 42, { title: 'x' }] },
      mediaFiles: ['a.RAF'],
    });
    expect(r.diagnostics.map((d) => [d.code, d.severity])).toEqual(
      Array.from({ length: 5 }, () => ['attachment-not-found', 'warning']),
    );
    expect(r.attachments).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rejeu des fixtures de la spec
// ─────────────────────────────────────────────────────────────────────────────

const MEDIA_CODES = new Set<MediaDiagnosticCode>([
  'images-conflict',
  'images-json-invalid',
  'media-nested',
  'cover-not-found',
  'cover-not-image',
  'attachment-not-found',
]);

/** Dossiers porteurs d'un fichier index dans un corpus, relatifs à sa racine. */
function seriesFolders(root: string, rel = ''): string[] {
  const dir = join(root, rel);
  const names = readdirSync(dir);
  const here = names.some((n) => /^index(\.[a-z]{2}(-[A-Z]{2})?)?\.md$/.test(n)) ? [rel] : [];
  const below = names
    .filter((n) => n !== 'media' && statSync(join(dir, n)).isDirectory())
    .flatMap((n) => seriesFolders(root, rel === '' ? n : `${rel}/${n}`));
  return [...here, ...below];
}

/** Dossier de série auquel un diagnostic de §4.10 se rattache. */
function owner(path: string): string {
  const media = path.indexOf('/media/');
  if (media !== -1) return path.slice(0, media);
  return /\.(md|json)$/.test(path) ? path.slice(0, path.lastIndexOf('/')) : path;
}

const validations = readdirSync(join(FIXTURES, 'validation'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => [n.replace(/\.json$/, ''), JSON.parse(readFileSync(join(FIXTURES, 'validation', n), 'utf-8'))] as const)
  .filter(([, fixture]) => typeof fixture.corpus === 'string');

describe('fixtures de la spec — rejeu des corpus', () => {
  it('au moins un corpus par code de média est rejoué', () => {
    const seen = new Set(validations.flatMap(([, f]) => f.expected.map((d: { code: string }) => d.code)));
    for (const code of MEDIA_CODES) expect(seen.has(code)).toBe(true);
  });

  it.each(validations)('%s : diagnostics de médias identiques à ceux de la fixture', async (_, fixture) => {
    const corpus = join(FIXTURES, 'corpora', fixture.corpus);
    const roots: string[] = fixture.roots.map((r: { path: string }) => r.path);
    const inRoots = (p: string) => roots.some((r) => r === '' || p === r || p.startsWith(`${r}/`));

    const expected = new Map<string, string[]>();
    for (const d of fixture.expected as Array<{ code: MediaDiagnosticCode; severity: string; path: string }>) {
      if (!MEDIA_CODES.has(d.code)) continue;
      const key = owner(d.path);
      expected.set(key, [...(expected.get(key) ?? []), `${d.code}:${d.severity}`]);
    }

    const actual = new Map<string, string[]>();
    for (const folder of seriesFolders(corpus).filter(inRoots)) {
      const dir = join(corpus, folder);
      const index = existsSync(join(dir, 'index.md'))
        ? 'index.md'
        : readdirSync(dir).filter((n) => /^index\..+\.md$/.test(n)).sort()[0]!;
      const parsed = parseFrontmatter(readFileSync(join(dir, index)));
      if (parsed.status !== 'ok' || parsed.data.type === 'section') continue;
      const r = resolveSeriesMedia({ frontmatter: parsed.data, ...(await readSeriesMedia(dir)) });
      const found = [...new Set(r.diagnostics.map((d) => `${d.code}:${d.severity}`))];
      if (found.length > 0) actual.set(folder, found.sort());
    }
    for (const [key, list] of expected) expected.set(key, [...new Set(list)].sort());
    expect(Object.fromEntries(actual)).toEqual(Object.fromEntries(expected));
  });
});

describe('fixtures de la spec — résultats attendus des corpus valides', () => {
  const resolveCorpus = async (corpus: string, folder: string, url?: (p: string) => string) => {
    const dir = join(FIXTURES, 'corpora', corpus, folder);
    const parsed = parseFrontmatter(readFileSync(join(dir, 'index.md')));
    if (parsed.status !== 'ok') throw new Error(folder);
    return resolveSeriesMedia({ frontmatter: parsed.data, ...(await readSeriesMedia(dir)), ...(url ? { url } : {}) });
  };

  it('minimal : scan alphabétique, couverture = première image', async () => {
    const r = await resolveCorpus('minimal', 'series/bretagne-2024');
    expect(r.images.map((i) => i.path)).toEqual(['media/01.jpg', 'media/02.jpg']);
    expect(r.cover?.path).toBe('media/01.jpg');
  });

  it('manifest/salon-2022 : médias locaux et manifeste, l\'ordre du manifeste gagne', async () => {
    const r = await resolveCorpus('manifest', 'series/salon-2022');
    expect(r.source).toBe('manifest');
    expect(r.images.map((i) => i.path)).toEqual(['media/02.jpg', 'media/01.jpg']);
    expect(r.cover?.path).toBe('media/02.jpg');
  });

  it('manifest/concert-2019 : aucun média local, couverture trouvée par suffixe', async () => {
    const r = await resolveCorpus('manifest', 'series/concert-2019');
    expect(r.images.map((i) => i.src)).toEqual(['/content/series/concert-2019/media/01.jpg', '/content/series/concert-2019/media/02.jpg']);
    expect(r.cover).toEqual({ src: '/content/series/concert-2019/media/02.jpg' });
  });

  it('manifest/expo-2021 : forme longue, couverture relative résolue', async () => {
    const r = await resolveCorpus('manifest', 'series/expo-2021');
    expect(r.cover).toEqual({ src: './media/b.jpg', path: 'media/b.jpg', alt: 'Vue B' });
  });

  it('nested : le conteneur voit son propre media/, pas celui de ses sous-séries (§1.8)', async () => {
    const r = await resolveCorpus('nested', 'archives/festivals/printemps-bourges-2008', (p) => `/c/${p}`);
    expect(r.images.map((i) => i.path)).toEqual(['media/01.jpg']);
    expect(r.cover?.src).toBe('/c/the-wombats/media/01.jpg');
  });

  it('attachments : documents joints, fichier vide compris, métadonnées fusionnées', async () => {
    const r = await resolveCorpus('attachments', 'series/festival-2023');
    expect(r.images.map((i) => i.path)).toEqual(['media/01.jpg']);
    expect(r.attachments.map((a) => [a.title, a.kind, a.description])).toEqual([
      ['Dossier de presse', 'document', 'Version print, 12 pages'],
      ['Interview de l\'artiste', 'audio', undefined],
      ['notes.txt', 'document', undefined],
      ['trace.gpx', 'file', undefined],
    ]);
    expect(r.attachments.find((a) => a.title === 'notes.txt')?.size).toBe(0);
  });

  it('embeds : le poster n\'entre pas dans la galerie, mais reste couverture', async () => {
    const r = await resolveCorpus('embeds', 'series/documentaire-2022');
    expect(r.images).toEqual([]);
    expect(r.cover?.path).toBe('media/o-jardim-poster.jpg');
  });

  it('originals : ni RAW ni sidecar, nulle part', async () => {
    const r = await resolveCorpus('originals', 'projects/mariage-dupont-2026');
    expect(r.images.map((i) => i.path)).toEqual(['media/DSCF0001.JPG', 'media/DSCF0002.JPG']);
    expect(r.cover?.path).toBe('media/DSCF0002.JPG');
    expect(r.attachments.map((a) => a.title)).toEqual(['Devis signé']);
  });
});

describe('image résolue et fournisseur d’image (#136, P0)', () => {
  it('isResolvedImage : vrai pour une image résolue, faux pour un ImageMetadata d’Astro', () => {
    expect(isResolvedImage({ src: 'https://r2.example/01.jpg', width: 800, height: 600 })).toBe(true);
    expect(isResolvedImage({ src: '/_astro/01.abc.jpg', width: 800, height: 600, format: 'jpg' })).toBe(false);
    expect(isResolvedImage('/01.jpg')).toBe(false);
    expect(isResolvedImage(undefined)).toBe(false);
    expect(isResolvedImage({ width: 800 })).toBe(false);
  });

  it('applyImageProvider : sans fournisseur, l’image passe telle quelle', () => {
    const image = { src: 'https://r2.example/01.jpg', width: 800, height: 600 };
    expect(applyImageProvider(image, { width: 600 })).toBe(image);
  });

  it('applyImageProvider : le fournisseur reçoit la taille visée et rend l’image servie', () => {
    const image = { src: 'https://r2.example/01.jpg', alt: 'Phare' };
    const provider = vi.fn((img: typeof image, { width }: { width: number }) => ({
      ...img,
      src: `/cdn-cgi/image/width=${width}/${img.src}`,
      srcset: `${img.src} ${width}w`,
    }));
    const out = applyImageProvider(image, { width: 600, height: 400 }, provider);
    expect(provider).toHaveBeenCalledWith(image, { width: 600, height: 400 });
    expect(out).toEqual({
      src: '/cdn-cgi/image/width=600/https://r2.example/01.jpg',
      alt: 'Phare',
      srcset: 'https://r2.example/01.jpg 600w',
    });
  });

  it('fallbackSrc : l’URL d’origine si le fournisseur l’a réécrite, sinon rien', () => {
    const original = { src: 'https://r2.example/01.jpg' };
    expect(fallbackSrc(original, { src: '/cdn-cgi/image/w=600/https://r2.example/01.jpg' })).toBe(
      'https://r2.example/01.jpg',
    );
    expect(fallbackSrc(original, original)).toBeUndefined();
  });
});
