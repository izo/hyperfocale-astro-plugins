/**
 * Garde contre les libellés en dur (#136, revue de #139, W3).
 *
 * Chaque composant est rendu avec un dictionnaire **sentinelle** : toutes les
 * clés de `HyperfocaleLabels` valent `⟦clé {params}⟧`. Tout texte lisible du
 * HTML — nœuds texte et attributs lus par un humain ou un lecteur d'écran
 * (`aria-label`, `alt`, `title`, `placeholder`, gabarits `data-hf-label-*`) —
 * doit alors être soit une sentinelle, soit une donnée passée en props (titre,
 * lieu, tag, nom de fichier, date formatée par `Intl`…), soit des chiffres et de
 * la ponctuation. Un mot écrit en dur dans un `.astro` fait échouer le test,
 * dans n'importe quelle langue.
 *
 * Les props couvrent les branches qui émettent du texte : liste vide, carte
 * vide, document avec et sans taille, embed jouable et non jouable, deux
 * variantes de `SeriesAttachments`.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import SeriesAttachments from '../../src/components/SeriesAttachments.astro';
import SeriesCard from '../../src/components/SeriesCard.astro';
import SeriesEmbeds from '../../src/components/SeriesEmbeds.astro';
import SeriesFilter from '../../src/components/SeriesFilter.astro';
import SeriesGallery from '../../src/components/SeriesGallery.astro';
import SeriesLightbox from '../../src/components/SeriesLightbox.astro';
import SeriesList from '../../src/components/SeriesList.astro';
import SeriesMap from '../../src/components/SeriesMap.astro';
import SeriesMasonry from '../../src/components/SeriesMasonry.astro';
import { HF_LABELS, formatDate, type HyperfocaleLabels } from '../../src/i18n.js';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

type AnyComponent = Parameters<AstroContainer['renderToString']>[0];

// ─── Dictionnaire sentinelle ────────────────────────────────────────────────

const params = (template: string) => [...template.matchAll(/\{\w+\}/g)].map((m) => m[0]).join(' ');
const sentinel = (key: string, template: string) => `⟦${key}${template.includes('{') ? ` ${params(template)}` : ''}⟧`;

const SENTINEL = Object.fromEntries(
  Object.entries(HF_LABELS.fr).map(([key, value]) => [
    key,
    typeof value === 'string'
      ? sentinel(key, value)
      : Object.fromEntries(Object.entries(value).map(([form, t]) => [form, sentinel(key, t as string)])),
  ]),
) as unknown as HyperfocaleLabels;

// ─── Données ────────────────────────────────────────────────────────────────

const series = (id: string, data: Record<string, unknown>) => ({ id, collection: 'series', body: '', data: { title: id, ...data } });

const SERIES = [
  series('bretagne', {
    title: 'Bretagne',
    date: new Date('2024-03-01T00:00:00Z'),
    description: 'Côtes',
    tags: ['mer', 'ouest'],
    location: 'Brest',
    images: ['https://cdn.example/bretagne/01.jpg'],
    iptc: { gps: { lat: 48.39, lng: -4.49 } },
  }),
  series('alpes', { title: 'Alpes', date: new Date('2022-07-14T00:00:00Z'), tags: ['montagne'], location: 'Chamonix', iptc: { gps: { lat: 45.92, lng: 6.87 } } }),
];
const IMAGES = [
  { src: '/m/01.jpg', width: 1200, height: 800, format: 'jpg', alt: 'Phare' },
  { src: '/m/02.jpg', width: 800, height: 1200, format: 'jpg' },
  { src: '/m/03.jpg', width: 1200, height: 800, format: 'jpg' },
];
const ATTACHMENTS = [
  { src: '/a/serie.zip', kind: 'file', title: 'Serie', size: 2_516_582 },
  { src: '/a/notes.pdf', kind: 'document', description: 'Carnet', size: 1536 },
  { src: '/a/sans-extension', kind: 'file', title: 'Brut' },
  { src: '/a/clip.mp4', kind: 'video', title: 'Clip' },
  { src: '/a/son.mp3', kind: 'audio', title: 'Son' },
];
const EMBEDS = [
  { url: 'https://vimeo.com/123', playable: true, platform: 'vimeo', id: '123', title: 'Making-of', poster: '/p.jpg' },
  { url: 'https://example.org/v', playable: false },
];

const CASES: Array<[string, AnyComponent, Record<string, unknown>]> = [
  ['SeriesAttachments (list)', SeriesAttachments, { attachments: ATTACHMENTS }],
  ['SeriesAttachments (inline)', SeriesAttachments, { attachments: ATTACHMENTS, variant: 'inline' }],
  ['SeriesCard', SeriesCard, { series: SERIES[0] }],
  ['SeriesEmbeds', SeriesEmbeds, { embeds: EMBEDS }],
  ['SeriesFilter', SeriesFilter, { series: SERIES }],
  ['SeriesGallery', SeriesGallery, { images: IMAGES.slice(0, 2), allImages: IMAGES, page: 1, totalPages: 2, baseUrl: '/s/b' }],
  ['SeriesLightbox', SeriesLightbox, { images: IMAGES }],
  ['SeriesList', SeriesList, { series: SERIES }],
  ['SeriesList (vide)', SeriesList, { series: [] }],
  ['SeriesMap', SeriesMap, { series: SERIES }],
  ['SeriesMap (vide)', SeriesMap, { series: [] }],
  ['SeriesMasonry', SeriesMasonry, { images: IMAGES }],
];

// ─── Extraction du texte lisible ────────────────────────────────────────────

const READABLE_ATTRS = /\s(aria-label|aria-roledescription|aria-valuetext|aria-description|aria-placeholder|aria-braillelabel|alt|title|placeholder|data-hf-label-[\w-]+)="([^"]*)"/g;

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function readableTexts(html: string): string[] {
  const body = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
  const attrs = [...body.matchAll(READABLE_ATTRS)].map((m) => m[2] ?? '');
  const texts = body.split(/<[^>]*>/);
  return [...attrs, ...texts].map(decode).filter((t) => t.trim() !== '');
}

/** Toutes les chaînes des props, et ce qu'un composant en dérive (nom de fichier, hôte, extension, date). */
function dataStrings(props: unknown): string[] {
  const out = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      out.add(value);
      const path = value.split(/[?#]/)[0] ?? value;
      const base = path.split('/').pop() ?? '';
      if (base) out.add(base);
      const ext = base.includes('.') ? base.split('.').pop() : undefined;
      if (ext) out.add(ext.toUpperCase());
      try {
        out.add(new URL(value).hostname);
      } catch {
        // pas une URL
      }
    } else if (value instanceof Date) {
      out.add(formatDate(value, 'en'));
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };
  visit(props);
  return [...out].filter((s) => s.length > 1).sort((a, b) => b.length - a.length);
}

function leftovers(text: string, data: string[]): string {
  let rest = text.replace(/⟦[^⟧]*⟧/g, ' ');
  for (const d of data) rest = rest.split(d).join(' ');
  // Chiffres, ponctuation et symboles (séparateurs « · », « / », « — »…) ne sont pas des mots.
  return rest.replace(/[\s\p{N}\p{P}\p{S}]+/gu, '');
}

describe('aucun texte lisible hors des libellés (dictionnaire sentinelle)', () => {
  it('couvre les 9 composants', () => {
    expect(new Set(CASES.map(([name]) => name.split(' ')[0])).size).toBe(9);
  });

  it('le dictionnaire sentinelle couvre toutes les clés', () => {
    expect(Object.keys(SENTINEL).sort()).toEqual(Object.keys(HF_LABELS.en).sort());
  });

  for (const [name, component, props] of CASES) {
    it(name, async () => {
      const html = await container.renderToString(component, { props: { ...props, locale: 'en', labels: SENTINEL } });
      const data = dataStrings(props);
      const offending = readableTexts(html)
        .map((text) => ({ text, rest: leftovers(text, data) }))
        .filter(({ rest }) => rest !== '');
      expect(offending).toEqual([]);
    });
  }

  it('la garde détecte un libellé en dur (témoin)', () => {
    const html = '<section aria-label="⟦attachments.heading⟧"><h2>Documents</h2><a title="Télécharger">x.zip</a></section>';
    const found = readableTexts(html).map((t) => leftovers(t, ['x.zip'])).filter(Boolean);
    expect(found.sort()).toEqual(['Documents', 'Télécharger']);
  });
});
