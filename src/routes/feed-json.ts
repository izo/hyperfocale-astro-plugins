// Flux json de la langue par défaut (Annexe E, #155). Les autres langues : feed-json-lang.ts.
import { HF_DEFAULT_LOCALE } from '../i18n.js';
import { renderFeed } from '../helpers/feeds.js';

export const prerender = true;

export async function GET() {
  return new Response(await renderFeed('json', HF_DEFAULT_LOCALE), {
    headers: { 'content-type': 'application/feed+json; charset=utf-8' },
  });
}
