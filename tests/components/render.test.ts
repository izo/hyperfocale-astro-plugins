/**
 * Tests de rendu des 9 composants (#136 lot P0, #138) — API container d'Astro.
 *
 * Lancés par `npm run test:unit` via `vitest.components.config.ts`.
 * Ce qu'on vérifie, pour chaque composant : rendu sans erreur, libellés en `fr`
 * (défaut) et en `en`, `class` et attributs `data-*`/`aria-*` reportés sur la
 * racine ; `headingLevel` là où un titre est émis ; pour `SeriesFilter`, que
 * le JSON du script client est bien rendu et parseable.
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
import { HF_LABELS } from '../../src/i18n.js';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

type AnyComponent = Parameters<AstroContainer['renderToString']>[0];
const render = (component: AnyComponent, props: Record<string, unknown>) =>
  container.renderToString(component, { props });

// ─── Données ────────────────────────────────────────────────────────────────

function series(id: string, data: Record<string, unknown>) {
  return { id, collection: 'series', body: '', data: { title: id, ...data } };
}

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
  series('alpes', {
    title: 'Alpes </script><b>x</b>',
    date: new Date('2022-07-14T00:00:00Z'),
    tags: ['montagne'],
    location: 'Chamonix',
    iptc: { gps: { lat: 45.92, lng: 6.87 } },
  }),
];

const IMAGES = [
  { src: '/m/01.jpg', width: 1200, height: 800, format: 'jpg', alt: 'Phare' },
  { src: '/m/02.jpg', width: 800, height: 1200, format: 'jpg' },
  { src: '/m/03.jpg', width: 1200, height: 800, format: 'jpg' },
];

const ATTACHMENTS = [
  { src: '/content/archives/bretagne/bretagne.zip', kind: 'file', title: 'Série complète', size: 2_516_582 },
  { src: '/a/notes.pdf', kind: 'document', size: 1536 },
];

const EMBEDS = [
  { url: 'https://vimeo.com/123', playable: true, platform: 'vimeo', id: '123', title: 'Making-of', poster: '/p.jpg' },
  { url: 'https://example.org/v', playable: false },
];

/** Racine = premier élément rendu (hors `<style>`/`<script>` éventuels). */
function rootTag(html: string): string {
  const match = html.match(/<(?!style|script|link)([a-z0-9]+)\b[^>]*>/i);
  if (!match) throw new Error(`aucun élément dans : ${html.slice(0, 200)}`);
  return match[0];
}

// ─── Options par instance, communes aux 9 composants ────────────────────────

const CASES: Array<[string, AnyComponent, Record<string, unknown>]> = [
  ['SeriesAttachments', SeriesAttachments, { attachments: ATTACHMENTS }],
  ['SeriesCard', SeriesCard, { series: SERIES[0] }],
  ['SeriesEmbeds', SeriesEmbeds, { embeds: EMBEDS }],
  ['SeriesFilter', SeriesFilter, { series: SERIES }],
  ['SeriesGallery', SeriesGallery, { images: IMAGES.slice(0, 2), allImages: IMAGES, page: 1, totalPages: 2, baseUrl: '/s/b' }],
  ['SeriesLightbox', SeriesLightbox, { images: IMAGES }],
  ['SeriesList', SeriesList, { series: SERIES }],
  ['SeriesMap', SeriesMap, { series: SERIES }],
  ['SeriesMasonry', SeriesMasonry, { images: IMAGES }],
];

describe('options par instance — les 9 composants', () => {
  it('couvre les 9 composants', () => {
    expect(CASES).toHaveLength(9);
  });

  for (const [name, component, props] of CASES) {
    describe(name, () => {
      it('rend sans erreur, en fr par défaut et en en', async () => {
        const fr = await render(component, props);
        const en = await render(component, { ...props, locale: 'en' });
        expect(fr.length).toBeGreaterThan(0);
        expect(en.length).toBeGreaterThan(0);
      });

      it('reporte class, data-* et aria-* sur la racine', async () => {
        const html = await render(component, {
          ...props,
          class: 'site-extra',
          'data-testid': 'root',
          'aria-describedby': 'aide',
        });
        const root = rootTag(html);
        expect(root).toMatch(/class="[^"]*\bsite-extra\b/);
        expect(root).toContain('data-testid="root"');
        expect(root).toContain('aria-describedby="aide"');
      });

      it("n'émet pas de prop inconnue hors data-*/aria-*", async () => {
        const html = await render(component, { ...props, onclick: 'alert(1)', title: 'x' });
        expect(rootTag(html)).not.toContain('onclick');
      });
    });
  }
});

// ─── Libellés et formats ────────────────────────────────────────────────────

describe('SeriesAttachments', () => {
  it('fr : titre et tailles en o/Ko/Mo, virgule décimale', async () => {
    const html = await render(SeriesAttachments, { attachments: ATTACHMENTS });
    expect(html).toMatch(/<h2[^>]*>Documents<\/h2>/);
    expect(html).toContain('2,4 Mo');
    expect(html).toContain('2 Ko');
  });

  it('en : tailles en B/KB/MB, point décimal', async () => {
    const html = await render(SeriesAttachments, { attachments: ATTACHMENTS, locale: 'en' });
    expect(html).toContain('2.4 MB');
    expect(html).toContain('2 KB');
  });

  it('headingLevel et heading surchargeable', async () => {
    const html = await render(SeriesAttachments, {
      attachments: ATTACHMENTS,
      locale: 'en',
      heading: 'Download',
      headingLevel: 3,
    });
    expect(html).toMatch(/<h3[^>]*>Download<\/h3>/);
    expect(html).not.toContain('<h2');
    expect(rootTag(html)).toContain('aria-label="Download"');
  });

  it('labels surcharge le dictionnaire', async () => {
    const html = await render(SeriesAttachments, {
      attachments: ATTACHMENTS,
      locale: 'en',
      labels: { 'attachments.heading': 'Files', 'size.megabyte': '{n} megs' },
    });
    expect(html).toMatch(/<h2[^>]*>Files<\/h2>/);
    expect(html).toContain('2.4 megs');
  });

  it("locale sans dictionnaire (ja) : libellés en anglais, nombres selon la locale", async () => {
    const html = await render(SeriesAttachments, { attachments: ATTACHMENTS, locale: 'ja' });
    expect(html).toMatch(/<h2[^>]*>Documents<\/h2>/);
    expect(html).toContain('2.4 MB');
  });

  it('ne rend rien sans document', async () => {
    const html = await render(SeriesAttachments, { attachments: [] });
    expect(html.trim()).toBe('');
  });
});

describe('SeriesEmbeds', () => {
  it('fr / en : titre et libellé de lecture', async () => {
    const fr = await render(SeriesEmbeds, { embeds: EMBEDS });
    const en = await render(SeriesEmbeds, { embeds: EMBEDS, locale: 'en' });
    expect(fr).toMatch(/<h2[^>]*>Vidéos<\/h2>/);
    expect(fr).toContain('Lire Making-of');
    expect(en).toMatch(/<h2[^>]*>Videos<\/h2>/);
    expect(en).toContain('Play Making-of');
  });

  it('headingLevel', async () => {
    const html = await render(SeriesEmbeds, { embeds: EMBEDS, headingLevel: 4 });
    expect(html).toMatch(/<h4[^>]*>Vidéos<\/h4>/);
  });
});

describe('SeriesCard', () => {
  it('fr : date longue et libellés', async () => {
    const html = await render(SeriesCard, { series: SERIES[0] });
    expect(html).toContain('1 mars 2024');
    expect(html).toContain('aria-label="Voir la série : Bretagne"');
    expect(html).toMatch(/<h2[^>]*>Bretagne<\/h2>/);
  });

  it('en : date et libellés', async () => {
    const html = await render(SeriesCard, { series: SERIES[0], locale: 'en' });
    expect(html).toContain('March 1, 2024');
    expect(html).toContain('aria-label="View series: Bretagne"');
    expect(html).toContain('alt="Cover of the series Bretagne"');
  });

  it('ja : date selon la locale', async () => {
    const html = await render(SeriesCard, { series: SERIES[0], locale: 'ja' });
    expect(html).toContain('2024年3月1日');
  });

  it('headingLevel', async () => {
    const html = await render(SeriesCard, { series: SERIES[0], headingLevel: 3 });
    expect(html).toMatch(/<h3[^>]*>Bretagne<\/h3>/);
  });
});

describe('SeriesList', () => {
  it('liste vide en fr et en en', async () => {
    expect(await render(SeriesList, { series: [] })).toContain(HF_LABELS.fr['list.empty']);
    expect(await render(SeriesList, { series: [], locale: 'en' })).toContain(HF_LABELS.en['list.empty']);
  });

  it('transmet locale et headingLevel aux cartes', async () => {
    const html = await render(SeriesList, { series: SERIES, locale: 'en', headingLevel: 3 });
    expect(html).toContain('View series: Bretagne');
    expect(html).toMatch(/<h3[^>]*>Bretagne<\/h3>/);
  });
});

describe('SeriesGallery', () => {
  const props = { images: IMAGES.slice(0, 2), allImages: IMAGES, page: 1, totalPages: 2, baseUrl: '/s/b' };

  it('fr / en : libellés de la galerie, de la pagination et de la lightbox', async () => {
    const fr = await render(SeriesGallery, props);
    const en = await render(SeriesGallery, { ...props, locale: 'en' });
    expect(fr).toContain('aria-label="Galerie photos"');
    expect(fr).toMatch(/aria-label="Ouvrir l(?:'|&#39;)image 2"/);
    expect(fr).toContain('aria-label="Page suivante"');
    expect(fr).toContain('alt="Photo 2"');
    expect(en).toContain('aria-label="Photo gallery"');
    expect(en).toContain('aria-label="Open image 2"');
    expect(en).toContain('aria-label="Next page"');
    expect(en).toContain('aria-label="Close the viewer"');
  });
});

describe('SeriesLightbox', () => {
  it('fr / en : libellés et gabarits client', async () => {
    const fr = await render(SeriesLightbox, { images: IMAGES });
    const en = await render(SeriesLightbox, { images: IMAGES, locale: 'en' });
    expect(fr).toContain('aria-label="Fermer la visionneuse"');
    expect(fr).toContain('data-hf-label-alt="Image {n} sur {total}"');
    expect(en).toContain('aria-label="Image viewer"');
    expect(en).toContain('data-hf-label-alt="Image {n} of {total}"');
    expect(en).toContain('data-hf-label-counter="{n} / {total}"');
  });

  it('JSON des images parseable', async () => {
    const html = await render(SeriesLightbox, { images: IMAGES });
    const json = html.match(/<script type="application\/json" id="hf-lightbox-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    expect(JSON.parse(json ?? '')).toHaveLength(3);
  });
});

describe('SeriesMasonry', () => {
  it('alt de repli localisé', async () => {
    expect(await render(SeriesMasonry, { images: IMAGES })).toContain('alt="Photo 2"');
    const custom = await render(SeriesMasonry, { images: IMAGES, labels: { 'image.alt': 'Vue {n}' } });
    expect(custom).toContain('alt="Vue 3"');
    expect(custom).toContain('alt="Phare"');
  });
});

describe('SeriesMap', () => {
  it('fr / en : résumé au pluriel et carte vide', async () => {
    const fr = await render(SeriesMap, { series: SERIES });
    const en = await render(SeriesMap, { series: SERIES, locale: 'en' });
    expect(fr).toContain('2 séries géolocalisées');
    expect(fr).toContain('aria-label="Carte géographique des séries"');
    expect(en).toContain('2 geotagged series');
    expect(await render(SeriesMap, { series: SERIES.slice(0, 1) })).toContain('1 série géolocalisée');
    expect(await render(SeriesMap, { series: [], locale: 'en' })).toContain(HF_LABELS.en['map.empty']);
  });
});

describe('SeriesFilter (#138)', () => {
  function filterData(html: string) {
    const raw = html.match(/<script type="application\/json" id="hf-filter-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    expect(raw, 'script hf-filter-data absent').toBeDefined();
    return { raw: raw!, data: JSON.parse(raw!) };
  }

  it('rend le JSON des séries, parseable', async () => {
    const { data } = filterData(await render(SeriesFilter, { series: SERIES }));
    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({ id: 'bretagne', date: 2024, tags: ['mer', 'ouest'], url: '/series/bretagne/' });
    expect(data.locale).toBe('fr');
    expect(data.count).toEqual(HF_LABELS.fr['filter.count']);
  });

  it('échappe < : un titre contenant </script> ne ferme pas la balise', async () => {
    const { raw, data } = filterData(await render(SeriesFilter, { series: SERIES }));
    expect(raw).not.toContain('</script>');
    expect(raw).toContain('\\u003c/script>');
    expect(data.items[1].title).toBe('Alpes </script><b>x</b>');
  });

  it('fr / en : libellés des contrôles et formes plurielles', async () => {
    const fr = await render(SeriesFilter, { series: SERIES });
    const en = await render(SeriesFilter, { series: SERIES, locale: 'en' });
    expect(fr).toContain('Réinitialiser');
    expect(fr).toContain('placeholder="Filtrer par lieu…"');
    expect(en).toContain('>Reset<');
    expect(en).toContain('>Year<');
    expect(en).toContain('aria-label="Tags: mer, ouest"');
    expect(filterData(en).data).toMatchObject({ locale: 'en', count: HF_LABELS.en['filter.count'] });
  });
});
