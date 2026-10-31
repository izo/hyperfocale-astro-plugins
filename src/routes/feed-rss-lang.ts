// Flux rss des autres langues, sous `/<prefix>/<lang>/feed.xml` (Annexe E, #155).
import { HF_DEFAULT_LOCALE } from '../i18n.js';
import { feedLanguages, renderFeed } from '../helpers/feeds.js';

export const prerender = true;

export async function getStaticPaths() {
  const langs = (await feedLanguages()).filter((lang) => lang !== HF_DEFAULT_LOCALE);
  return langs.map((lang) => ({ params: { lang } }));
}

export async function GET({ params }: { params: { lang: string } }) {
  return new Response(await renderFeed('rss', params.lang), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
