// Flux rss de la langue par défaut (Annexe E, #155). Les autres langues : feed-rss-lang.ts.
import { HF_DEFAULT_LOCALE } from '../i18n.js';
import { renderFeed } from '../helpers/feeds.js';

export const prerender = true;

export async function GET() {
  return new Response(await renderFeed('rss', HF_DEFAULT_LOCALE), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
