/** Constructeurs des flux et du sitemap — Annexe E (#155). */
import { describe, expect, it } from 'vitest';
import { absoluteUrl, buildJsonFeed, buildRss, buildSitemap, xmlEscape } from '../../src/feeds.js';

const channel = {
  title: 'Séries',
  description: 'Les séries publiées',
  link: 'https://photos.example/series/',
  feedUrl: 'https://photos.example/series/feed.xml',
  language: 'fr',
};
const entry = {
  url: 'https://photos.example/series/bretagne/',
  title: 'Bretagne <2024> & "co"',
  description: 'Côtes & phares',
  date: new Date('2024-03-01T00:00:00Z'),
  cover: { url: 'https://photos.example/_astro/01.jpg', type: 'image/jpeg' },
  tags: ['mer'],
};

describe('xmlEscape', () => {
  it('échappe les cinq caractères réservés', () => {
    expect(xmlEscape(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
  });
});

describe('buildRss (RSS 2.0)', () => {
  it('canal, item, enclosure en couverture, texte échappé', () => {
    const xml = buildRss(channel, [entry]);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<language>fr</language>');
    expect(xml).toContain('<title>Bretagne &lt;2024&gt; &amp; &quot;co&quot;</title>');
    expect(xml).toContain('<guid isPermaLink="true">https://photos.example/series/bretagne/</guid>');
    expect(xml).toContain('<pubDate>Fri, 01 Mar 2024 00:00:00 GMT</pubDate>');
    expect(xml).toContain('<enclosure url="https://photos.example/_astro/01.jpg" length="0" type="image/jpeg"/>');
    expect(xml).toContain('<category>mer</category>');
    expect(xml).not.toContain('<2024>');
  });

  it('une série sans date ni couverture : pas de pubDate ni enclosure', () => {
    const xml = buildRss(channel, [{ url: 'https://photos.example/series/x/', title: 'X' }]);
    expect(xml).not.toContain('<pubDate>');
    expect(xml).not.toContain('<enclosure');
  });
});

describe('buildJsonFeed (JSON Feed 1.1)', () => {
  it('version, items, date ISO, image', () => {
    const feed = JSON.parse(buildJsonFeed(channel, [entry]));
    expect(feed.version).toBe('https://jsonfeed.org/version/1.1');
    expect(feed.feed_url).toBe('https://photos.example/series/feed.xml');
    expect(feed.items[0]).toMatchObject({
      id: 'https://photos.example/series/bretagne/',
      title: 'Bretagne <2024> & "co"',
      summary: 'Côtes & phares',
      date_published: '2024-03-01T00:00:00.000Z',
      image: 'https://photos.example/_astro/01.jpg',
      tags: ['mer'],
    });
  });
});

describe('buildSitemap', () => {
  it('URLs absolues et lastmod au format date', () => {
    const xml = buildSitemap([
      { url: 'https://photos.example/series/bretagne/', date: new Date('2024-03-01T00:00:00Z') },
      { url: 'https://photos.example/series/nue/' },
    ]);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<lastmod>2024-03-01</lastmod>');
    expect(xml.match(/<loc>/g)).toHaveLength(2);
  });
});

describe('absoluteUrl', () => {
  it('résout un chemin relatif contre site, avec ou sans slash final', () => {
    expect(absoluteUrl('/media/a.jpg', 'https://photos.example')).toBe('https://photos.example/media/a.jpg');
    expect(absoluteUrl('/media/a.jpg', 'https://photos.example/')).toBe('https://photos.example/media/a.jpg');
    expect(absoluteUrl('https://cdn.example/a.jpg', 'https://photos.example')).toBe('https://cdn.example/a.jpg');
  });
});
