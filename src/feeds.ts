/**
 * Constructeurs purs des flux de syndication et du sitemap (Annexe E, #155).
 *
 * Aucun import d'Astro ni de `node:*` : les routes injectées (`src/routes/feed-*`,
 * `sitemap.ts`) collectent les séries, ce module ne fait que produire le texte.
 * Tout texte venu d'une série passe par `xmlEscape` ou `JSON.stringify`.
 */

/** Une série prête pour un flux, URLs déjà absolues. */
export interface FeedEntry {
  /** Identifiant stable : l'URL absolue de la série. */
  readonly url: string;
  readonly title: string;
  readonly description?: string;
  /** Date de publication, `undefined` quand la série n'est pas datée. */
  readonly date?: Date;
  /** Couverture, URL absolue, avec son type MIME quand il est connu. */
  readonly cover?: { readonly url: string; readonly type: string };
  readonly tags?: readonly string[];
}

/** Métadonnées du flux. */
export interface FeedChannel {
  readonly title: string;
  readonly description: string;
  /** Page d'accueil du flux, URL absolue. */
  readonly link: string;
  /** URL du flux lui-même, absolue. */
  readonly feedUrl: string;
  /** Langue BCP 47 de la série ou du flux. */
  readonly language: string;
}

/** Échappe les caractères réservés d'un contenu XML (texte et attribut). */
export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Date RFC 822, la forme exigée par `pubDate` de RSS 2.0. */
export function rfc822(date: Date): string {
  return date.toUTCString();
}

/**
 * Flux RSS 2.0. Chaque série est un `<item>` ; sa couverture part en
 * `<enclosure>`. La taille de la couverture n'est pas connue du plugin : l'attribut
 * `length` vaut `0`, ce que les lecteurs acceptent.
 */
export function buildRss(channel: FeedChannel, entries: readonly FeedEntry[]): string {
  const items = entries.map((entry) => {
    const parts = [
      `    <title>${xmlEscape(entry.title)}</title>`,
      `    <link>${xmlEscape(entry.url)}</link>`,
      `    <guid isPermaLink="true">${xmlEscape(entry.url)}</guid>`,
    ];
    if (entry.description) parts.push(`    <description>${xmlEscape(entry.description)}</description>`);
    if (entry.date) parts.push(`    <pubDate>${rfc822(entry.date)}</pubDate>`);
    if (entry.cover) {
      parts.push(`    <enclosure url="${xmlEscape(entry.cover.url)}" length="0" type="${xmlEscape(entry.cover.type)}"/>`);
    }
    for (const tag of entry.tags ?? []) parts.push(`    <category>${xmlEscape(tag)}</category>`);
    return `  <item>\n${parts.join('\n')}\n  </item>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xmlEscape(channel.title)}</title>`,
    `    <link>${xmlEscape(channel.link)}</link>`,
    `    <description>${xmlEscape(channel.description)}</description>`,
    `    <language>${xmlEscape(channel.language)}</language>`,
    `    <atom:link href="${xmlEscape(channel.feedUrl)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

/**
 * Flux JSON Feed 1.1 (https://jsonfeed.org/version/1.1). Le texte passe par
 * `JSON.stringify` : rien à échapper à la main.
 */
export function buildJsonFeed(channel: FeedChannel, entries: readonly FeedEntry[]): string {
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: channel.title,
    description: channel.description,
    home_page_url: channel.link,
    feed_url: channel.feedUrl,
    language: channel.language,
    items: entries.map((entry) => ({
      id: entry.url,
      url: entry.url,
      title: entry.title,
      ...(entry.description ? { summary: entry.description } : {}),
      ...(entry.date ? { date_published: entry.date.toISOString() } : {}),
      ...(entry.cover ? { image: entry.cover.url } : {}),
      ...(entry.tags && entry.tags.length > 0 ? { tags: [...entry.tags] } : {}),
    })),
  };
  return `${JSON.stringify(feed, null, 2)}\n`;
}

/** Une URL du sitemap, avec sa date de dernière modification (`YYYY-MM-DD`) si connue. */
export interface SitemapEntry {
  readonly url: string;
  readonly date?: Date;
}

/** `sitemap.xml` (protocole sitemaps.org 0.9). Les URLs sont absolues. */
export function buildSitemap(entries: readonly SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const lastmod = entry.date ? `\n    <lastmod>${entry.date.toISOString().slice(0, 10)}</lastmod>` : '';
    return `  <url>\n    <loc>${xmlEscape(entry.url)}</loc>${lastmod}\n  </url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** URL absolue à partir d'un chemin relatif au site ou d'une URL déjà absolue. */
export function absoluteUrl(path: string, site: string): string {
  return new URL(path, site.endsWith('/') ? site : `${site}/`).toString();
}
