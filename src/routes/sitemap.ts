// `sitemap.xml` de toutes les séries publiées (Annexe E, #155).
import { renderSitemap } from '../helpers/feeds.js';

export const prerender = true;

export async function GET() {
  return new Response(await renderSitemap(), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}
