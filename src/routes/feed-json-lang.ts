// Flux json des autres langues, sous `/<prefix>/<lang>/feed.json` (Annexe E, #155).
import { HF_DEFAULT_LOCALE } from '../i18n.js';
import { feedLanguages, renderFeed } from '../helpers/feeds.js';

export const prerender = true;

export async function getStaticPaths() {
  const langs = (await feedLanguages()).filter((lang) => lang !== HF_DEFAULT_LOCALE);
  return langs.map((lang) => ({ params: { lang } }));
}

export async function GET({ params }: { params: { lang: string } }) {
  return new Response(await renderFeed('json', params.lang), {
    headers: { 'content-type': 'application/feed+json; charset=utf-8' },
  });
}
