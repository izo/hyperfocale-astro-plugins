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
import SeriesPagination from '../../src/components/SeriesPagination.astro';
import SeriesLineup from '../../src/components/SeriesLineup.astro';
import TwoAttachments from './fixtures/TwoAttachments.astro';
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
  ['SeriesPagination', SeriesPagination, { page: 2, totalPages: 5, baseUrl: '/s/b' }],
  ['SeriesLineup', SeriesLineup, { series: SERIES }],
];

describe('options par instance — les 11 composants', () => {
  it('couvre les 11 composants', () => {
    expect(CASES).toHaveLength(11);
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

  it('coverImage résolu : <img> simple, srcset et sizes repris, alt de l’image', async () => {
    const html = await render(SeriesCard, {
      series: SERIES[0],
      coverImage: {
        src: 'https://r2.example/bretagne/01.jpg',
        width: 1200,
        height: 800,
        alt: 'Phare',
        srcset: 'https://r2.example/bretagne/01-600.jpg 600w, https://r2.example/bretagne/01-1200.jpg 1200w',
        sizes: '(min-width: 40rem) 600px, 100vw',
      },
    });
    expect(html).toContain('src="https://r2.example/bretagne/01.jpg"');
    expect(html).toContain('srcset="https://r2.example/bretagne/01-600.jpg 600w, https://r2.example/bretagne/01-1200.jpg 1200w"');
    expect(html).toContain('sizes="(min-width: 40rem) 600px, 100vw"');
    expect(html).toContain('alt="Phare"');
    expect(html).not.toContain('_astro/');
  });

  it('imageProvider réécrit l’URL de coverImage, sans toucher aux autres champs', async () => {
    const html = await render(SeriesCard, {
      series: SERIES[0],
      coverImage: { src: 'https://r2.example/bretagne/01.jpg', width: 1200, height: 800 },
      imageProvider: (image: { src: string }, { width }: { width: number }) => ({
        ...image,
        src: `/cdn-cgi/image/width=${width}/${image.src}`,
      }),
    });
    expect(html).toContain('src="/cdn-cgi/image/width=600/https://r2.example/bretagne/01.jpg"');
    expect(html).toContain(`alt="${HF_LABELS.fr['card.coverAlt'].replace('{title}', 'Bretagne')}"`);
    expect(html).toContain('data-hf-fallback="https://r2.example/bretagne/01.jpg"');
  });

  it('sans imageProvider, pas de data-hf-fallback', async () => {
    const html = await render(SeriesCard, {
      series: SERIES[0],
      coverImage: { src: 'https://r2.example/bretagne/01.jpg' },
    });
    expect(html).not.toContain('data-hf-fallback');
  });

  it('SeriesList : coverImages par identifiant de série et imageProvider transmis aux cartes', async () => {
    const html = await render(SeriesList, {
      series: SERIES,
      coverImages: { bretagne: { src: 'https://r2.example/bretagne/cover.jpg' } },
      imageProvider: (image: { src: string }) => ({ ...image, src: `/cdn-cgi/image/${image.src}` }),
    });
    expect(html).toContain('src="/cdn-cgi/image/https://r2.example/bretagne/cover.jpg"');
    expect(html).toContain('data-hf-fallback="https://r2.example/bretagne/cover.jpg"');
    expect(html.match(/data-hf-fallback=/g)).toHaveLength(1);
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

  it('pagination : la page 2 est sous `page/` (spec §1.6), la page 1 est la série', async () => {
    const html = await render(SeriesGallery, props);
    expect(html).toContain('href="/s/b/page/2/"');
    expect(html).not.toContain('href="/s/b/2/"');
    const page2 = await render(SeriesGallery, { ...props, page: 2, images: IMAGES.slice(2) });
    expect(page2).toContain('href="/s/b/"');
    expect(page2).not.toContain('href="/s/b/1/"');
  });

  it('images résolues : <img> simple aux dimensions fournies, sans passer par astro:assets', async () => {
    const resolved = [{ src: 'https://r2.example/b/01.jpg', width: 800, height: 600, alt: 'Phare' }];
    const html = await render(SeriesGallery, { ...props, images: resolved, allImages: resolved });
    expect(html).toContain('src="https://r2.example/b/01.jpg"');
    expect(html).toContain('width="800"');
    expect(html).toContain('height="600"');
    expect(html).toContain('alt="Phare"');
    expect(html).not.toContain('_astro/');
  });

  it('imageProvider s’applique aux images résolues', async () => {
    const resolved = [{ src: 'https://r2.example/b/01.jpg', width: 800, height: 600 }];
    const html = await render(SeriesGallery, {
      ...props,
      images: resolved,
      allImages: resolved,
      imageProvider: (image: { src: string }, { width }: { width: number }) => ({
        ...image,
        src: `/cdn-cgi/image/width=${width}/${image.src}`,
      }),
    });
    expect(html).toContain('src="/cdn-cgi/image/width=600/https://r2.example/b/01.jpg"');
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

// ─── SeriesAttachments : variante, titre, attributs du lien, nom accessible (#136, 0.24.0) ───

describe('SeriesAttachments — 0.24.0', () => {
  const ZIP = { src: '/content/archives/bretagne/download.zip', kind: 'file', title: 'Série complète', size: 2_516_582 };

  it('variant inline : badge « ZIP » sans titre ni liste, racine en ligne', async () => {
    const html = await render(SeriesAttachments, { attachments: [ZIP], variant: 'inline', class: 'mt-4' });
    const root = rootTag(html);
    expect(root).toMatch(/^<span class="hf-attachments hf-attachments--inline mt-4"/);
    expect(root).not.toContain('aria-label');
    expect(html).not.toMatch(/<h\d/);
    expect(html).not.toContain('<ul');
    expect(html).toMatch(/<a class="hf-attachments__badge" href="\/content\/archives\/bretagne\/download\.zip" download aria-label="Série complète — ZIP, 2,4 Mo">ZIP<\/a>/);
  });

  it('variant inline : un document sans extension montre son titre ; vidéo et audio deviennent des badges', async () => {
    const html = await render(SeriesAttachments, {
      variant: 'inline',
      locale: 'en',
      attachments: [
        { src: '/dl/serie', kind: 'file', title: 'Full series' },
        { src: '/v/clip.mp4', kind: 'video', title: 'Clip' },
      ],
    });
    expect(html).toContain('>Full series</a>');
    expect(html).toContain('aria-label="Clip — MP4">MP4</a>');
    expect(html).not.toContain('<video');
  });

  it('variant list (défaut) : rendu inchangé, titre h2', async () => {
    const html = await render(SeriesAttachments, { attachments: [ZIP] });
    expect(rootTag(html)).toMatch(/^<section class="hf-attachments" aria-label="Documents"/);
    expect(html).toMatch(/<h2 class="hf-attachments__heading">Documents<\/h2>/);
  });

  it.each([false, ''])('heading=%j : aucun titre, la section reste nommée par le libellé', async (heading) => {
    const html = await render(SeriesAttachments, { attachments: [ZIP], heading, locale: 'en' });
    expect(html).not.toMatch(/<h\d/);
    expect(rootTag(html)).toContain('aria-label="Documents"');
  });

  it('nom accessible : titre, format et taille (fr / en) ; le badge reste aria-hidden', async () => {
    const fr = await render(SeriesAttachments, { attachments: [ZIP] });
    const en = await render(SeriesAttachments, { attachments: [ZIP], locale: 'en' });
    expect(fr).toContain('aria-label="Série complète — ZIP, 2,4 Mo"');
    expect(en).toContain('aria-label="Série complète — ZIP, 2.4 MB"');
    expect(fr).toContain('<span class="hf-attachments__kind" aria-hidden="true">ZIP</span>');
  });

  it('nom accessible : format seul, taille seule, ni l’un ni l’autre', async () => {
    const html = await render(SeriesAttachments, {
      locale: 'en',
      attachments: [
        { src: '/a/notes.pdf', kind: 'document', title: 'Notes' },
        { src: '/a/readme', kind: 'file', title: 'Read me', size: 2048 },
        { src: '/a/bare', kind: 'file', title: 'Bare' },
      ],
    });
    expect(html).toContain('aria-label="Notes — PDF"');
    expect(html).toContain('aria-label="Read me — 2 KB"');
    expect(html).toMatch(/<a class="hf-attachments__link" href="\/a\/bare" download><span class="hf-attachments__title">Bare<\/span><\/a>/);
  });

  it('data: URL (petit fichier inliné par Vite) : format lu sur le titre', async () => {
    const html = await render(SeriesAttachments, {
      locale: 'en',
      attachments: [
        { src: 'data:application/pdf;base64,YXRlbGllci9kZXZpcy5wZGYK', kind: 'document', title: 'devis.pdf' },
        { src: '/a/archive.tar.gz?v=2#x', kind: 'file', title: 'Archive' },
        { src: '/a/notes.v2', kind: 'file', title: 'Notes' },
      ],
    });
    expect(html).toContain('aria-label="devis.pdf — PDF"');
    expect(html).toContain('aria-label="Archive — GZ"');
    expect(html).toContain('aria-label="Notes — V2"');
  });

  it('libellés attachments.linkLabel / linkDetails surchargeables', async () => {
    const html = await render(SeriesAttachments, {
      attachments: [ZIP],
      locale: 'en',
      labels: { 'attachments.linkLabel': 'Download {title} ({details})', 'attachments.linkDetails': '{format} · {size}' },
    });
    expect(html).toContain('aria-label="Download Série complète (ZIP · 2.4 MB)"');
  });

  it('la description, masquée par aria-label, passe par aria-describedby', async () => {
    const html = await render(SeriesAttachments, {
      attachments: [{ src: '/a/notes.pdf', kind: 'document', title: 'Notes', description: 'Notes de tournage' }],
    });
    const id = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toMatch(/^hf-attachment-desc-[0-9a-z]+$/);
    expect(html).toContain(`<span class="hf-attachments__description" id="${id}">Notes de tournage</span>`);
  });

  it('attributs par document sur le lien ; ceux de l’instance restent sur la racine', async () => {
    const html = await render(SeriesAttachments, {
      variant: 'inline',
      'data-section': 'download',
      attachments: [
        { ...ZIP, attrs: { 'data-track-event': 'download_started', 'data-track-slug': 'bretagne', class: 'track' } },
      ],
    });
    expect(rootTag(html)).toContain('data-section="download"');
    expect(rootTag(html)).not.toContain('data-track-event');
    expect(html).toMatch(/<a class="hf-attachments__badge track" [^>]*data-track-event="download_started" data-track-slug="bretagne">ZIP<\/a>/);
  });

  it('linkAttrs (objet ou fonction) sur chaque lien, attrs du document prioritaires', async () => {
    const both = [ZIP, { src: '/a/notes.pdf', kind: 'document', attrs: { 'data-kind': 'notes' } }];
    const obj = await render(SeriesAttachments, { attachments: both, linkAttrs: { 'data-kind': 'zip', 'data-track': 'dl' } });
    expect(obj.match(/data-track="dl"/g)).toHaveLength(2);
    expect(obj).toContain('data-kind="zip"');
    expect(obj).toContain('data-kind="notes"');
    const fn = await render(SeriesAttachments, {
      attachments: both,
      linkAttrs: (att: { src: string }, i: number) => ({ 'data-index': i, 'data-file': att.src.split('/').pop() }),
    });
    expect(fn).toContain('data-index="0" data-file="download.zip"');
    expect(fn).toContain('data-index="1" data-file="notes.pdf"');
  });

  it('attributs du lien filtrés : ni on*, ni href, ni style, ni download', async () => {
    const html = await render(SeriesAttachments, {
      attachments: [{ ...ZIP, attrs: { onclick: 'alert(1)', href: 'javascript:alert(1)', style: 'color:red', download: 'x.exe', 'aria-label': 'Get it' } }],
      linkAttrs: { onmouseover: 'alert(2)', 'data-ok': true },
    });
    expect(html).not.toMatch(/on(click|mouseover)/);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('style="color');
    expect(html).not.toContain('x.exe');
    expect(html).toContain('href="/content/archives/bretagne/download.zip" download aria-label="Get it"');
    expect(html).toContain('data-ok');
  });

  it("nom d'attribut malveillant écarté : ni espace ni guillemet ne crée d'attribut (garde indépendante d'Astro)", async () => {
    const html = await render(SeriesAttachments, {
      attachments: [{ ...ZIP, attrs: { 'data-x onfocus=alert(1) autofocus': 'y', 'data-"><script>alert(3)</script>': 'z' } }],
      linkAttrs: { 'aria-x onmouseover=alert(4)': 'w' },
    });
    expect(html).not.toMatch(/onfocus|onmouseover|autofocus|<script>alert/);
  });

  it("aucun attribut data-astro-cid : le composant n'a plus de style scopé", async () => {
    for (const variant of ['list', 'inline']) {
      const html = await render(SeriesAttachments, { attachments: ATTACHMENTS, variant });
      expect(html).not.toContain('data-astro-cid');
    }
  });

  it('feuille émise une fois, avant le composant, compactée ; rien avec unstyled ni sans document', async () => {
    const html = await render(SeriesAttachments, { attachments: ATTACHMENTS });
    expect(html.match(/<style data-hf-styles="attachments">/g)).toHaveLength(1);
    expect(html.indexOf('<style')).toBeLessThan(html.indexOf('<section'));
    expect(html).toContain('.hf-attachments__badge{');
    expect(html).not.toContain('/*');
    expect(await render(SeriesAttachments, { attachments: ATTACHMENTS, unstyled: true })).not.toContain('<style');
    expect((await render(SeriesAttachments, { attachments: [] })).trim()).toBe('');
  });

  it('deux instances sur une page : une seule feuille, émise par la première qui rend', async () => {
    const html = await render(TwoAttachments, { attachments: ATTACHMENTS });
    expect(html.match(/<style data-hf-styles="attachments">/g)).toHaveLength(1);
    expect(html.indexOf('<style')).toBeLessThan(html.indexOf('hf-attachments--inline'));
    expect(html).toContain('<section class="hf-attachments"');
  });
});

describe('SeriesMasonry et SeriesEmbeds — images résolues (#136, P0)', () => {
  it('SeriesMasonry : image résolue réécrite par le fournisseur, origine en repli', async () => {
    const html = await render(SeriesMasonry, {
      images: [{ src: 'https://r2.example/m/01.jpg', width: 800, height: 600 }],
      imageProvider: (image: { src: string }, { width }: { width: number }) => ({
        ...image,
        src: `/cdn-cgi/image/width=${width}/${image.src}`,
      }),
    });
    expect(html).toContain('src="/cdn-cgi/image/width=600/https://r2.example/m/01.jpg"');
    expect(html).toContain('data-hf-fallback="https://r2.example/m/01.jpg"');
    expect(html).not.toContain('_astro/');
  });

  it('SeriesEmbeds : poster résolu, réécrit par le fournisseur', async () => {
    const html = await render(SeriesEmbeds, {
      embeds: [
        {
          url: 'https://vimeo.com/123',
          playable: true,
          platform: 'vimeo',
          id: '123',
          title: 'Making-of',
          poster: { src: 'https://r2.example/p.jpg', width: 640, height: 360 },
        },
      ],
      imageProvider: (image: { src: string }) => ({ ...image, src: `/cdn-cgi/image/${image.src}` }),
    });
    expect(html).toContain('class="hf-embeds__poster" src="/cdn-cgi/image/https://r2.example/p.jpg"');
    expect(html).toContain('data-hf-fallback="https://r2.example/p.jpg"');
  });
});

describe('SeriesGallery — colonnes, maçonnerie, eagerCount, sizes (#136, P1)', () => {
  const images = [
    { src: '/m/01.jpg', width: 800, height: 600, format: 'jpg' },
    { src: '/m/02.jpg', width: 800, height: 600, format: 'jpg' },
    { src: '/m/03.jpg', width: 800, height: 600, format: 'jpg' },
  ];
  const base = { images, allImages: images, page: 1, totalPages: 1, baseUrl: '/s/b' };

  it('columns : variable CSS et classe de grille fixe', async () => {
    const html = await render(SeriesGallery, { ...base, columns: 4 });
    expect(html).toContain('--hf-gallery-columns: 4');
    expect(html).toContain('hf-gallery--columns');
    expect(html).not.toContain('hf-gallery--masonry');
  });

  it('masonry : classe de maçonnerie', async () => {
    const html = await render(SeriesGallery, { ...base, masonry: true });
    expect(html).toContain('hf-gallery--masonry');
  });

  it('eagerCount : les premières images seules sont eager', async () => {
    const html = await render(SeriesGallery, { ...base, eagerCount: 2 });
    // La lightbox rendue avec la galerie porte aussi un `eager` : on ne compte que les vignettes.
    const thumbs = html.match(/<img[^>]*class="hf-gallery__img"[^>]*>/g) ?? [];
    expect(thumbs.map((t) => t.match(/loading="(\w+)"/)?.[1])).toEqual(['eager', 'eager', 'lazy']);
  });

  it('sizes : repris sur les images', async () => {
    const html = await render(SeriesGallery, { ...base, sizes: '(min-width: 40rem) 33vw, 100vw' });
    expect(html).toContain('sizes="(min-width: 40rem) 33vw, 100vw"');
  });
});


describe('SeriesCard — variantes, champs, état privé, attributs du lien (#136, P2)', () => {
  const tagged = series('tagged', {
    title: 'Tagged',
    description: 'Avec mots-clés',
    location: 'Brest',
    tags: ['a', 'b', 'c', 'd'],
  });

  it('variant text : pas de couverture', async () => {
    const html = await render(SeriesCard, { series: SERIES[0], variant: 'text' });
    expect(html).toContain('hf-card--text');
    expect(html).not.toContain('hf-card__cover');
  });

  it('variant overlay : classe de surimpression, couverture présente', async () => {
    const html = await render(SeriesCard, { series: SERIES[0], variant: 'overlay' });
    expect(html).toContain('hf-card--overlay');
    expect(html).toContain('hf-card__cover');
  });

  it('fields : lieu et mots-clés, limités par maxTags', async () => {
    const html = await render(SeriesCard, {
      series: tagged,
      fields: ['location', 'tags'],
      maxTags: 2,
    });
    expect(html).toMatch(/<p class="hf-card__location"[^>]*>Brest<\/p>/);
    expect(html).not.toContain('hf-card__description');
    const items = [...html.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((m) => m[1]);
    expect(items).toEqual(['a', 'b']);
    expect(html).toContain('aria-label="Mots-clés"');
  });

  it('série privée : badge « Série privée » et classe d’état', async () => {
    const html = await render(SeriesCard, { series: series('p', { title: 'P', private: true }) });
    expect(html).toContain('hf-card--locked');
    expect(html).toMatch(/<span class="hf-card__badge"[^>]*>Série privée<\/span>/);
    expect(await render(SeriesCard, { series: SERIES[0], locale: 'en' })).not.toContain('hf-card__badge');
  });

  it('linkAttrs : data-* et aria-* posés sur le lien, rien d’autre', async () => {
    const html = await render(SeriesCard, {
      series: SERIES[0],
      linkAttrs: { 'data-track': 'card-click', onclick: 'alert(1)', href: '/x' },
    });
    expect(html).toContain('data-track="card-click"');
    expect(html).not.toContain('onclick');
  });

  it('eager et decorativeCover : chargement immédiat, alt vide', async () => {
    const html = await render(SeriesCard, {
      series: SERIES[0],
      eager: true,
      decorativeCover: true,
      coverImage: { src: 'https://r2.example/c.jpg', width: 1200, height: 800, alt: 'Phare' },
    });
    expect(html).toContain('loading="eager"');
    // Astro rend une valeur vide sans guillemets : `alt` seul.
    expect(html).toMatch(/<img src="https:\/\/r2\.example\/c\.jpg" alt[ >]/);
    expect(html).not.toContain('Phare');
  });
});

describe('SeriesList — cardProps et maçonnerie (#136, P2)', () => {
  it('cardProps : options par série, appliquées à chaque carte', async () => {
    const html = await render(SeriesList, {
      series: SERIES,
      cardProps: (s: { id: string }) => (s.id === 'alpes' ? { variant: 'text' } : {}),
    });
    expect(html.match(/hf-card--text/g)).toHaveLength(1);
    expect(html.match(/class="hf-card hf-card--default/g)).toHaveLength(1);
  });

  it('masonry : classe de maçonnerie', async () => {
    expect(await render(SeriesList, { series: SERIES, masonry: true })).toContain('hf-series-list--masonry');
  });
});

describe('SeriesPagination (#136, P2)', () => {
  it('rel prev/next, page 2 sous page/, page courante marquée', async () => {
    const html = await render(SeriesPagination, { page: 2, totalPages: 3, baseUrl: '/s/b' });
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(html).toContain('href="/s/b/"');
    expect(html).toContain('href="/s/b/page/3/"');
    expect(html).toContain('aria-current="page"');
  });

  it('plusieurs pages : trous marqués par « … », cachés des lecteurs d’écran', async () => {
    const html = await render(SeriesPagination, { page: 10, totalPages: 20, baseUrl: '/s/b' });
    expect(html).toMatch(/<span class="hf-pagination__gap" aria-hidden="true"[^>]*>…<\/span>/);
    expect(html).toContain('href="/s/b/page/9/"');
  });

  it('une seule page : rien', async () => {
    expect(await render(SeriesPagination, { page: 1, totalPages: 1, baseUrl: '/s/b' })).not.toContain('<nav');
  });

  it('en : libellés anglais', async () => {
    const html = await render(SeriesPagination, { page: 1, totalPages: 2, baseUrl: '/s/b', locale: 'en' });
    expect(html).toContain('aria-label="Next page"');
    expect(html).toContain('aria-label="Gallery pagination"');
  });
});

describe('SeriesLineup (#136, P2)', () => {
  it('titre fr et en, liste des sous-séries', async () => {
    const fr = await render(SeriesLineup, { series: SERIES });
    expect(fr).toContain('Dans cette série');
    expect(fr).toContain('hf-lineup');
    expect(await render(SeriesLineup, { series: SERIES, locale: 'en' })).toContain('In this series');
  });

  it('sans sous-série : rien', async () => {
    expect(await render(SeriesLineup, { series: [] })).not.toContain('hf-lineup');
  });
});

describe('coverFallback — repli de couverture sans lecture du corpus (#136)', () => {
  it("coverFallback: 'none' : pas de lecture du corpus, placeholder", async () => {
    const html = await render(SeriesCard, { series: series('nocover', { title: 'Sans couverture' }), coverFallback: 'none' });
    expect(html).toContain('hf-card__placeholder');
    expect(html).not.toContain('<img');
  });

  it("coverFallback: 'none' transmis par SeriesList", async () => {
    const html = await render(SeriesList, { series: [series('nocover', { title: 'Sans' })], coverFallback: 'none' });
    expect(html).toContain('hf-card__placeholder');
  });
});

describe('SeriesLightbox — charge utile allégée (#158, PERF-004)', () => {
  it('le JSON ne porte que src et alt : ni width ni height, que le script n\'emploie pas', async () => {
    const html = await render(SeriesLightbox, { images: IMAGES });
    const json = html.match(/<script type="application\/json" id="hf-lightbox-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    const list = JSON.parse(json ?? '[]') as Array<Record<string, unknown>>;
    expect(list).toHaveLength(3);
    for (const entry of list) expect(Object.keys(entry).every((key) => key === 'src' || key === 'alt')).toBe(true);
    expect(list[0]).toEqual({ src: '/m/01.jpg', alt: 'Phare' });
  });
});

