/** #152 — les composants n'émettent aucun `href` dangereux. */
import { describe, it, expect, beforeAll } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import SeriesEmbeds from '../../src/components/SeriesEmbeds.astro';
import SeriesAttachments from '../../src/components/SeriesAttachments.astro';

describe('composants — aucun href dangereux', () => {
  let container: AstroContainer;
  beforeAll(async () => {
    container = await AstroContainer.create();
  });

  it('SeriesEmbeds : pas de href javascript: ni data:', async () => {
    const html = await container.renderToString(SeriesEmbeds, {
      props: {
        embeds: [
          { url: 'javascript:alert(1)', playable: false },
          { url: 'data:text/html,x', playable: true, platform: 'vimeo', id: '1' },
          { url: 'https://vimeo.com/3', playable: false },
        ],
      },
    });
    expect(html).not.toMatch(/href="\s*(javascript|data):/i);
    expect(html).toContain('href="https://vimeo.com/3"');
  });

  it('SeriesAttachments : pas de href javascript:, un data: inliné par Vite reste admis', async () => {
    const html = await container.renderToString(SeriesAttachments, {
      props: {
        attachments: [
          { src: 'javascript:alert(1)', kind: 'file', title: 'Piège' },
          { src: 'data:application/zip;base64,AAAA', kind: 'file', title: 'local.zip' },
          { src: '/a/ok.pdf', kind: 'document', title: 'ok' },
        ],
      },
    });
    expect(html).not.toMatch(/href="\s*javascript:/i);
    expect(html).toContain('href="data:application/zip;base64,AAAA"');
    expect(html).toContain('href="/a/ok.pdf"');
  });
});
