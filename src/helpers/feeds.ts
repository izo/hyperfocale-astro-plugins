/**
 * Collecte des séries pour les flux et le sitemap (Annexe E, #155).
 *
 * Les routes `src/routes/feed-*` et `sitemap.ts` appellent ces fonctions. Elles
 * lisent `import.meta.env.HYPERFOCALE_SITE` (défini par l'intégration quand
 * `feeds: true`) et le préfixe. Les brouillons sont absents de `getSeriesList`
 * en production, donc de tout ce qui suit.
 */
import { absoluteUrl, buildJsonFeed, buildRss, buildSitemap, type FeedChannel, type FeedEntry } from '../feeds.js';
import { HF_DEFAULT_LOCALE, resolveLabels } from '../i18n.js';
import { getSeriesList, type Series } from './index.js';

/** Nombre maximal d'items par flux : les plus récentes. */
export const FEED_LIMIT = 20;

const MIME_BY_FORMAT: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

/** Langue d'une série : son `lang`, à défaut la langue par défaut du plugin. */
export function seriesLang(series: Series): string {
  return series.data.lang ?? HF_DEFAULT_LOCALE;
}

/** Langues présentes, la langue par défaut toujours en tête (un flux existe pour elle). */
export async function feedLanguages(): Promise<string[]> {
  const langs = new Set((await getSeriesList()).map(seriesLang));
  langs.add(HF_DEFAULT_LOCALE);
  return [...langs].sort((a, b) => (a === HF_DEFAULT_LOCALE ? -1 : b === HF_DEFAULT_LOCALE ? 1 : a.localeCompare(b)));
}

function entryOf(series: Series, site: string, prefix: string): FeedEntry {
  const data = series.data as Record<string, unknown>;
  const cover = data.cover as { src?: string; format?: string } | undefined;
  const type = cover?.format ? MIME_BY_FORMAT[cover.format.toLowerCase()] : undefined;
  return {
    url: absoluteUrl(`${prefix}/${series.id}/`, site),
    title: String(series.data.title),
    ...(typeof data.description === 'string' ? { description: data.description } : {}),
    ...(data.date instanceof Date ? { date: data.date } : {}),
    ...(cover?.src && type ? { cover: { url: absoluteUrl(cover.src, site), type } } : {}),
    ...(Array.isArray(data.tags) ? { tags: data.tags as string[] } : {}),
  };
}

/** Plus récentes d'abord ; les séries sans date à la fin. */
function newestFirst(a: FeedEntry, b: FeedEntry): number {
  if (a.date && b.date) return b.date.getTime() - a.date.getTime();
  if (a.date) return -1;
  if (b.date) return 1;
  return 0;
}

/** Corps d'un flux, `rss` ou `json`, pour une langue. */
export async function renderFeed(format: 'rss' | 'json', lang: string): Promise<string> {
  const site = import.meta.env.HYPERFOCALE_SITE as string;
  const prefix = import.meta.env.HYPERFOCALE_PREFIX as string;
  const labels = resolveLabels(lang);
  const entries = (await getSeriesList())
    .filter((series) => seriesLang(series) === lang)
    .map((series) => entryOf(series, site, prefix))
    .sort(newestFirst)
    .slice(0, FEED_LIMIT);
  const suffix = format === 'rss' ? 'xml' : 'json';
  const channel: FeedChannel = {
    title: labels['feed.title'],
    description: labels['feed.description'],
    link: absoluteUrl(`${prefix}/`, site),
    feedUrl: absoluteUrl(lang === HF_DEFAULT_LOCALE ? `${prefix}/feed.${suffix}` : `${prefix}/${lang}/feed.${suffix}`, site),
    language: lang,
  };
  return format === 'rss' ? buildRss(channel, entries) : buildJsonFeed(channel, entries);
}

/** `sitemap.xml` : toutes les séries publiées, toutes langues confondues. */
export async function renderSitemap(): Promise<string> {
  const site = import.meta.env.HYPERFOCALE_SITE as string;
  const prefix = import.meta.env.HYPERFOCALE_PREFIX as string;
  const series = await getSeriesList();
  return buildSitemap(
    series.map((s) => ({
      url: absoluteUrl(`${prefix}/${s.id}/`, site),
      ...(s.data.date instanceof Date ? { date: s.data.date } : {}),
    })),
  );
}
