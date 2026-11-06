/**
 * Jour écrit d'une date de frontmatter (§1.3, §1.6, §4.10 règle 8) : le jour est
 * celui que l'auteur lit dans son fichier, sans conversion de fuseau.
 *
 * Fil conducteur : `2024-06-01T23:30:00-05:00` est le 1er juin ; converti en UTC
 * il tomberait le 2.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseSeriesSchema } from '../../src/schema.js';
import { calendarDay, compareSeriesOrder } from '../../src/order.js';
import { writtenDate, writtenDay } from '../../src/written-date.js';

type Entry = { id: string; collection: string; data: Record<string, unknown>; body: string };

let corpus: Entry[] = [];

vi.mock('astro:content', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCollection: async () => corpus,
}));

const { getSeriesList, resetSeriesCache } = await import('../../src/helpers/index.js');
const { renderFeed, renderSitemap } = await import('../../src/helpers/feeds.js');

const schema = baseSeriesSchema({ dateRequired: true });

/** Une entrée dont `date` passe par le schéma du plugin, comme sous Astro. */
function entry(id: string, title: string, date: unknown): Entry {
  return { id, collection: 'series', body: '', data: schema.parse({ title, date }) as Record<string, unknown> };
}

describe('writtenDay', () => {
  it.each([
    ['2024-06-01', '2024-06-01'],
    ['2024-06-01T23:30:00-05:00', '2024-06-01'],
    ['2024-06-01T00:30:00+02:00', '2024-06-01'],
    ['2024-06-01T23:59:59.999Z', '2024-06-01'],
    ['2024-06-01T23:30', '2024-06-01'],
    ['2024-06-01T12:00Z', '2024-06-01'],
    ['2024-02-29', '2024-02-29'],
    ['0050-01-01', '0050-01-01'],
  ])('%s est le jour %s', (text, day) => {
    expect(writtenDay(text)).toBe(day);
  });

  it.each([
    ['jour inexistant', '2024-02-30'],
    ['29 février d\'une année non bissextile', '2023-02-29'],
    ['mois 13', '2024-13-01'],
    ['jour 00', '2024-06-00'],
    ['heure 24', '2024-06-01T24:00:00Z'],
    ['minute 60', '2024-06-01T12:60:00Z'],
    ['seconde 60', '2024-06-01T12:00:60Z'],
    ['espace de tête', ' 2024-06-01'],
    ['espace de queue', '2024-06-01 '],
    ['saut de ligne final', '2024-06-01\n'],
    ['séparateur espace', '2024-06-01 23:30:00 -05:00'],
    ['fuseau sans heure', '2024-06-01Z'],
    ['année sur deux chiffres', '24-06-01'],
    ['barres obliques', '2024/06/01'],
    ['chiffres arabes-indiens', '٢٠٢٤-٠٦-٠١'],
    ['texte', 'juin 2024'],
    ['vide', ''],
  ])('%s est refusé', (_, text) => {
    expect(writtenDay(text)).toBeNull();
  });
});

describe('writtenDate', () => {
  it("rend minuit UTC du jour écrit, quels que soient l'heure et le fuseau", () => {
    for (const text of ['2024-06-01', '2024-06-01T23:30:00-05:00', '2024-06-01T00:30:00+14:00', '2024-06-01T23:59:59Z']) {
      expect(writtenDate(text)?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    }
  });

  it("n'a pas le piège des années de 0 à 99", () => {
    expect(writtenDate('0050-03-04')?.toISOString()).toBe('0050-03-04T00:00:00.000Z');
  });

  it('rend null pour un texte qui n\'est pas une date valide', () => {
    expect(writtenDate('2024-02-30')).toBeNull();
    expect(writtenDate('hier')).toBeNull();
  });
});

describe('baseSeriesSchema — `date` au jour écrit', () => {
  const parse = (date: unknown) => schema.parse({ title: 'T', date }).date as Date;

  it('2024-06-01T23:30:00-05:00 est le 1er juin, pas le 2', () => {
    expect(calendarDay(parse('2024-06-01T23:30:00-05:00'))).toBe('2024-06-01');
  });

  it('un fuseau en avance sur UTC ne ramène pas la date à la veille', () => {
    expect(calendarDay(parse('2024-06-01T00:30:00+02:00'))).toBe('2024-06-01');
  });

  it('une date sans heure est inchangée', () => {
    expect(parse('2024-06-01')).toEqual(new Date('2024-06-01'));
  });

  it('une date sans fuseau ne dépend pas du fuseau de la machine', () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(calendarDay(parse('2024-06-01T23:30:00'))).toBe('2024-06-01');
      process.env.TZ = 'Pacific/Kiritimati';
      expect(calendarDay(parse('2024-06-01T00:30:00'))).toBe('2024-06-01');
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it('un texte libre qui n\'a pas la forme ISO garde la lecture de Date', () => {
    expect(parse('June 1, 2024 12:00:00 UTC')).toEqual(new Date('2024-06-01T12:00:00Z'));
    expect(schema.safeParse({ title: 'T', date: 'pas-une-date' }).success).toBe(false);
  });

  // Constat F3 : le schéma et `date-invalid` (§4.10, règle 8) ne lisaient pas une date de la même façon.
  it.each([
    ['un jour absent du calendrier', '2024-02-30'],
    ['un 31 février avec heure', '2024-02-31T10:00:00Z'],
    ['une heure hors horloge', '2024-02-15T25:00:00Z'],
    ['un nombre', 20240101],
    ['un booléen', true],
  ])('refuse %s au lieu de le lire comme un autre jour', (_label, date) => {
    expect(schema.safeParse({ title: 'T', date }).success).toBe(false);
  });

  it('`date: null` vaut absente (règle 7) : requise → refusée, optionnelle → absente', () => {
    expect(schema.safeParse({ title: 'T', date: null }).success).toBe(false);
    const optional = baseSeriesSchema({ dateRequired: false }).safeParse({ title: 'T', date: null });
    expect(optional.success).toBe(true);
    if (optional.success) expect(optional.data.date).toBeUndefined();
  });

  it('une clé `null` vaut absente pour les autres champs du core (règle 7)', () => {
    const result = baseSeriesSchema({ dateRequired: false }).safeParse({
      title: 'T',
      type: null,
      draft: null,
      private: null,
      tags: null,
      images: null,
      description: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ type: 'series', draft: false, private: false, tags: [] });
      expect(result.data.images).toBeUndefined();
      expect(result.data.description).toBeUndefined();
    }
  });

  it('`title: null` reste refusé : le titre est requis', () => {
    expect(baseSeriesSchema({ dateRequired: false }).safeParse({ title: null }).success).toBe(false);
  });

  it('un Date déjà construit est pris tel quel', () => {
    const instant = new Date('2024-06-01T23:30:00Z');
    expect(parse(instant)).toEqual(instant);
  });

  it('`date` reste requise, ou optionnelle selon la collection', () => {
    expect(schema.safeParse({ title: 'T' }).success).toBe(false);
    expect(baseSeriesSchema({ dateRequired: false }).safeParse({ title: 'T' }).success).toBe(true);
  });
});

describe('tri et flux au jour écrit', () => {
  beforeEach(() => {
    resetSeriesCache();
    vi.stubEnv('HYPERFOCALE_SITE', 'https://site.test');
    vi.stubEnv('HYPERFOCALE_PREFIX', '/series');
  });

  // `a` : 1er juin à 23:30 (UTC-5), soit le 2 en UTC. `b` : 2 juin à 00:30 (UTC+2), soit le 1er en UTC.
  // Au jour écrit, `b` (2 juin) est plus récente ; converties en UTC, elles s'inverseraient.
  const WRITTEN = () => [entry('a', 'A', '2024-06-01T23:30:00-05:00'), entry('b', 'B', '2024-06-02T00:30:00+02:00')];

  it('compareSeriesOrder range la 2 juin écrit avant la 1er juin écrit', () => {
    const [a, b] = WRITTEN() as [Entry, Entry];
    expect([a, b].sort(compareSeriesOrder).map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('getSeriesList suit le jour écrit', async () => {
    corpus = WRITTEN();
    expect((await getSeriesList()).map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('même jour écrit, heures et fuseaux différents : titre, puis chemin', async () => {
    corpus = [
      entry('z', 'Zèbre', '2024-06-01T00:10:00+10:00'),
      entry('y', 'Alpaga', '2024-06-01T23:50:00-10:00'),
      entry('x', 'Marmotte', '2024-06-01'),
    ];
    expect((await getSeriesList()).map((s) => s.id)).toEqual(['y', 'x', 'z']);
  });

  it('le flux ne départage pas deux séries du même jour écrit par leur heure', async () => {
    corpus = [
      entry('a', 'Alpaga', '2024-06-01T23:50:00-10:00'),
      entry('b', 'Bison', '2024-06-01T00:10:00+10:00'),
      entry('c', 'Chamois', '2024-06-01'),
    ];
    const feed = JSON.parse(await renderFeed('json', 'fr')) as { items: Array<{ id: string }> };
    expect(feed.items.map((i) => i.id)).toEqual([
      'https://site.test/series/a/',
      'https://site.test/series/b/',
      'https://site.test/series/c/',
    ]);
  });

  it('le flux suit le jour écrit, et les séries sans date viennent en dernier', async () => {
    corpus = [{ ...entry('s', 'Sans', '2024-01-01'), data: { title: 'Sans', draft: false, published: true } }, ...WRITTEN()];
    const feed = JSON.parse(await renderFeed('json', 'fr')) as { items: Array<{ id: string; date_published?: string }> };
    expect(feed.items.map((i) => i.id)).toEqual(['https://site.test/series/b/', 'https://site.test/series/a/', 'https://site.test/series/s/']);
    expect(feed.items.map((i) => i.date_published?.slice(0, 10))).toEqual(['2024-06-02', '2024-06-01', undefined]);
  });

  it('le sitemap date chaque série de son jour écrit', async () => {
    corpus = WRITTEN();
    const sitemap = await renderSitemap();
    expect(sitemap).toContain('<loc>https://site.test/series/a/</loc>\n    <lastmod>2024-06-01</lastmod>');
    expect(sitemap).toContain('<loc>https://site.test/series/b/</loc>\n    <lastmod>2024-06-02</lastmod>');
  });
});

describe('baseSeriesSchema — images[].src.src (§1.12)', () => {
  const schema = baseSeriesSchema({ dateRequired: false });

  it.each(['javascript:alert(1)', 'data:text/html,<script>', '//evil.example/x.jpg', '/\\evil.example/x.jpg'])(
    'refuse src.src %j comme tout champ d\'URL',
    (src) => {
      expect(schema.safeParse({ title: 'T', images: [{ src: { src } }] }).success).toBe(false);
    },
  );

  it('admet un chemin servi par le site et une URL https', () => {
    for (const src of ['/_astro/01.abc123.jpg', 'https://cdn.example.com/01.jpg']) {
      expect(schema.safeParse({ title: 'T', images: [{ src: { src, width: 10, height: 10, format: 'jpg' } }] }).success, src).toBe(true);
    }
  });
});
