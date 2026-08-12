/**
 * Contenus embarqués — spec §1.11.
 *
 * Un embed est un média hébergé chez un tiers et joué dans la page. La frontière
 * avec §1.9 est l'emplacement de l'octet, pas la nature du média : un `.mp4` de
 * `media/` reste un document joint.
 *
 * Ce que ces tests ne couvrent pas : la résolution d'un `poster` en chemin
 * relatif, qui passe par le glob de Vite — statique, donc vide hors runtime
 * Astro. Elle est couverte en e2e, comme la résolution des manifestes.
 */

import { describe, it, expect } from 'vitest';
import { baseSeriesSchema } from '../../src/schema.js';
import { getSeriesEmbeds, posterFilenames, resetSeriesCache } from '../../src/helpers/index.js';
import type { Series } from '../../src/helpers/index.js';

function makeSeries(embeds: unknown[]): Series {
  return {
    id: 'demo',
    collection: 'series',
    data: { title: 'Demo', embeds },
    body: '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const schema = baseSeriesSchema({ dateRequired: false });

// ─── Schéma (§1.11) ──────────────────────────────────────────────────────────

describe('schéma embeds', () => {
  it('accepte une entrée complète', () => {
    const parsed = schema.safeParse({
      title: 'Demo',
      embeds: [
        {
          url: 'https://vimeo.com/123831041',
          platform: 'vimeo',
          id: '123831041',
          title: 'O Jardim da Esperança',
          description: 'Documentaire, 74 min',
          poster: './media/poster.jpg',
          width: 1920,
          height: 1080,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("n'exige que `url`", () => {
    const parsed = schema.safeParse({ title: 'Demo', embeds: [{ url: 'https://vimeo.com/1' }] });
    expect(parsed.success).toBe(true);
  });

  it('rejette une entrée sans url', () => {
    const parsed = schema.safeParse({ title: 'Demo', embeds: [{ platform: 'vimeo', id: '1' }] });
    expect(parsed.success).toBe(false);
  });

  it('rejette une url qui n’en est pas une', () => {
    const parsed = schema.safeParse({ title: 'Demo', embeds: [{ url: 'pas-une-url' }] });
    expect(parsed.success).toBe(false);
  });

  it('accepte une plateforme hors du vocabulaire reconnu', () => {
    // §1.11 donne la liste comme ouverte : un `z.enum()` ferait échouer un build
    // sur du contenu que la spec tient pour valide.
    const parsed = schema.safeParse({
      title: 'Demo',
      embeds: [{ url: 'https://peertube.test/w/abc', platform: 'peertube', id: 'abc' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('laisse `embeds` absent — le champ est optionnel', () => {
    expect(schema.safeParse({ title: 'Demo' }).success).toBe(true);
  });
});

// ─── getSeriesEmbeds ─────────────────────────────────────────────────────────

describe('getSeriesEmbeds', () => {
  it('retourne un tableau vide sans embeds', async () => {
    resetSeriesCache();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series = { id: 'demo', collection: 'series', data: { title: 'Demo' }, body: '' } as any;
    expect(await getSeriesEmbeds('demo', series)).toEqual([]);
  });

  it("préserve l'ordre du tableau — aucun tri", async () => {
    resetSeriesCache();
    const series = makeSeries([
      { url: 'https://vimeo.com/2', platform: 'vimeo', id: '2' },
      { url: 'https://vimeo.com/1', platform: 'vimeo', id: '1' },
    ]);
    const embeds = await getSeriesEmbeds('demo', series);
    expect(embeds.map((e) => e.id)).toEqual(['2', '1']);
  });

  it('marque playable une plateforme reconnue avec id', async () => {
    resetSeriesCache();
    const series = makeSeries([{ url: 'https://vimeo.com/1', platform: 'vimeo', id: '1' }]);
    expect((await getSeriesEmbeds('demo', series))[0]?.playable).toBe(true);
  });

  it('normalise la casse de la plateforme', async () => {
    resetSeriesCache();
    const series = makeSeries([{ url: 'https://vimeo.com/1', platform: 'Vimeo', id: '1' }]);
    const embed = (await getSeriesEmbeds('demo', series))[0];
    expect(embed?.platform).toBe('vimeo');
    expect(embed?.playable).toBe(true);
  });

  it("n'est pas playable sans id — un lecteur ne se construit pas", async () => {
    resetSeriesCache();
    const series = makeSeries([{ url: 'https://vimeo.com/1', platform: 'vimeo' }]);
    expect((await getSeriesEmbeds('demo', series))[0]?.playable).toBe(false);
  });

  it("n'est pas playable sur une plateforme inconnue", async () => {
    resetSeriesCache();
    const series = makeSeries([{ url: 'https://peertube.test/w/a', platform: 'peertube', id: 'a' }]);
    const embed = (await getSeriesEmbeds('demo', series))[0];
    // L'entrée survit — elle se rendra en lien. C'est la dégradation de §1.11,
    // et elle vaut aussi pour un hébergeur que le plugin ne connaît pas.
    expect(embed).toBeDefined();
    expect(embed?.playable).toBe(false);
    expect(embed?.platform).toBe('peertube');
  });

  it("n'est pas playable sans platform", async () => {
    resetSeriesCache();
    const series = makeSeries([{ url: 'https://vimeo.com/1', id: '1' }]);
    expect((await getSeriesEmbeds('demo', series))[0]?.playable).toBe(false);
  });

  it('ignore une entrée sans url', async () => {
    resetSeriesCache();
    const series = makeSeries([
      { platform: 'vimeo', id: '1' },
      { url: 'https://vimeo.com/2', platform: 'vimeo', id: '2' },
    ]);
    const embeds = await getSeriesEmbeds('demo', series);
    expect(embeds).toHaveLength(1);
    expect(embeds[0]?.id).toBe('2');
  });

  it('retourne un poster distant tel quel', async () => {
    resetSeriesCache();
    const series = makeSeries([
      { url: 'https://vimeo.com/1', platform: 'vimeo', id: '1', poster: 'https://cdn.test/p.jpg' },
    ]);
    expect((await getSeriesEmbeds('demo', series))[0]?.poster).toBe('https://cdn.test/p.jpg');
  });

  it('omet la clé poster quand un chemin relatif est introuvable', async () => {
    resetSeriesCache();
    const series = makeSeries([
      { url: 'https://vimeo.com/1', platform: 'vimeo', id: '1', poster: './media/absent.jpg' },
    ]);
    const embed = (await getSeriesEmbeds('demo', series))[0];
    // Jamais d'échec de build sur un poster manquant — même robustesse que le
    // manifeste (§1.5.1).
    expect(embed).toBeDefined();
    expect('poster' in (embed as object)).toBe(false);
  });

  it("n'ajoute pas les clés optionnelles absentes", async () => {
    resetSeriesCache();
    const series = makeSeries([{ url: 'https://vimeo.com/1' }]);
    const embed = (await getSeriesEmbeds('demo', series))[0] as object;
    expect('title' in embed).toBe(false);
    expect('description' in embed).toBe(false);
    expect('width' in embed).toBe(false);
  });
});

// ─── Exclusion des posters du scan de galerie (§1.11) ────────────────────────

/**
 * La seule exception au principe « toute image de `media/` alimente la
 * galerie ». Sans elle, une série de trois vidéos afficherait trois vignettes
 * parasites — et une série qui n'est *que* de la vidéo se retrouverait avec une
 * galerie faite de ses propres posters.
 */
describe('posterFilenames — exclusion du scan', () => {
  it('retient un poster en chemin relatif', () => {
    const series = makeSeries([{ url: 'https://vimeo.com/1', poster: './media/poster.jpg' }]);
    expect(posterFilenames(series)).toEqual(new Set(['poster.jpg']));
  });

  it('accepte un chemin relatif sans ./', () => {
    const series = makeSeries([{ url: 'https://vimeo.com/1', poster: 'media/poster.jpg' }]);
    expect(posterFilenames(series)).toEqual(new Set(['poster.jpg']));
  });

  it("ignore une URL absolue — elle ne désigne aucun fichier local", () => {
    const series = makeSeries([{ url: 'https://vimeo.com/1', poster: 'https://cdn.test/p.jpg' }]);
    expect(posterFilenames(series)).toEqual(new Set());
  });

  it('ignore un chemin absolu au site', () => {
    const series = makeSeries([{ url: 'https://vimeo.com/1', poster: '/images/p.jpg' }]);
    expect(posterFilenames(series)).toEqual(new Set());
  });

  it('collecte les posters de plusieurs embeds', () => {
    const series = makeSeries([
      { url: 'https://vimeo.com/1', poster: './media/a.jpg' },
      { url: 'https://vimeo.com/2', poster: './media/b.jpg' },
      { url: 'https://vimeo.com/3' },
    ]);
    expect(posterFilenames(series)).toEqual(new Set(['a.jpg', 'b.jpg']));
  });

  it('retourne un ensemble vide sans embeds', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series = { id: 'demo', collection: 'series', data: { title: 'Demo' }, body: '' } as any;
    expect(posterFilenames(series)).toEqual(new Set());
  });

  it('retourne un ensemble vide sans série', () => {
    expect(posterFilenames(undefined)).toEqual(new Set());
  });
});
