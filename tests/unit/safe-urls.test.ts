/**
 * #152 — `embeds[].url` et `files[].url` finissent dans un `href` : seuls
 * `http(s)` (et, hors schéma, un chemin sans schéma) sont admis.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { baseSeriesSchema } from '../../src/schema.js';
import { getSeriesAttachments, getSeriesEmbeds } from '../../src/helpers/index.js';
import { isNetworkPathReference, isSafeLinkUrl } from '../../src/ingest/paths.js';
import type { Series } from '../../src/helpers/index.js';

const HOSTILE = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  ' javascript:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'ftp://example.com/x',
];

const makeSeries = (data: Record<string, unknown>): Series =>
  ({ id: 'demo', collection: 'series', data, body: '' }) as unknown as Series;

describe('isSafeLinkUrl', () => {
  it('admet http(s), les chemins absolus et relatifs', () => {
    for (const url of ['https://a.example/x', 'http://a.example', '/media/x.zip', './x.pdf', '../x.pdf', 'media/x.pdf']) {
      expect(isSafeLinkUrl(url), url).toBe(true);
    }
  });

  it('refuse `//hôte` et ses lectures par un navigateur (§1.12, spec 2.17)', () => {
    for (const url of ['//cdn.example/x', '//evil.example/x.pdf', '/\\evil.example/x.pdf', '\\\\evil.example/x.pdf', '/\t/evil.example/x', '\t//evil.example/x', '  //evil.example/x']) {
      expect(isSafeLinkUrl(url), JSON.stringify(url)).toBe(false);
    }
    // Un seul `/` initial reste un chemin du site.
    expect(isSafeLinkUrl('/media/x.pdf')).toBe(true);
    expect(isNetworkPathReference('/media//x.pdf')).toBe(false);
  });

  it('refuse javascript:, data:, vbscript:, ftp: et leurs variantes', () => {
    for (const url of HOSTILE) expect(isSafeLinkUrl(url), url).toBe(false);
  });

  it('refuse le vide et les non-chaînes', () => {
    expect(isSafeLinkUrl('')).toBe(false);
    expect(isSafeLinkUrl(undefined)).toBe(false);
    expect(isSafeLinkUrl(42)).toBe(false);
  });

  it('admet data: seulement sur demande', () => {
    expect(isSafeLinkUrl('data:application/zip;base64,AAAA')).toBe(false);
    expect(isSafeLinkUrl('data:application/zip;base64,AAAA', true)).toBe(true);
    expect(isSafeLinkUrl('javascript:alert(1)', true)).toBe(false);
  });
});

describe('schéma — URL de embeds et files', () => {
  const schema = baseSeriesSchema({ dateRequired: false });

  for (const url of HOSTILE) {
    it(`refuse embeds[].url = ${JSON.stringify(url)}`, () => {
      expect(schema.safeParse({ title: 'T', embeds: [{ url }] }).success).toBe(false);
    });
    it(`refuse files[].url = ${JSON.stringify(url)}`, () => {
      expect(schema.safeParse({ title: 'T', files: [{ url }] }).success).toBe(false);
    });
  }

  it('accepte http et https', () => {
    expect(schema.safeParse({ title: 'T', embeds: [{ url: 'http://a.example/v' }, { url: 'https://a.example/v' }] }).success).toBe(true);
    expect(schema.safeParse({ title: 'T', files: [{ url: 'https://a.example/x.pdf' }] }).success).toBe(true);
  });
});

describe('schéma — champs d\'URL du core, formes admises (§1.12)', () => {
  const schema = baseSeriesSchema({ dateRequired: false });
  const BYPASS = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    '\tjavascript:alert(1)',
    'java\tscript:alert(1)',
    'java\u0000script:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'blob:https://a.example/uuid',
    'mailto:a@b.example',
    '//evil.example/x.jpg',
    '\t//evil.example/x.jpg',
    '/\\evil.example/x.jpg',
    '/content/a\\b.jpg',
    '..\\..\\x.jpg',
    './media/%2e%2e/%2e%2e/x.jpg',
    './media/..%2fx.jpg',
    './media/..%5cx.jpg',
    './media/a\u0000b.jpg',
  ];
  const ok = (data: Record<string, unknown>) => schema.safeParse({ title: 'T', ...data }).success;

  for (const url of BYPASS) {
    const shown = JSON.stringify(url);
    it(`refuse images[] = ${shown}, en forme courte et longue`, () => {
      expect(ok({ images: [url] }), 'chaîne').toBe(false);
      expect(ok({ images: [{ url }] }), 'objet').toBe(false);
    });
    it(`refuse embeds[].poster = ${shown}`, () => {
      expect(ok({ embeds: [{ url: 'https://vimeo.com/1', poster: url }] })).toBe(false);
    });
  }

  it.each(['javascript:alert(1)', ' https://a.example/v', '\thttps://a.example/v', 'https://a.example/\u0000v', 'https://a.example/v\n', '//a.example/v', '/embed/1', './v.mp4'])(
    'refuse embeds[].url = %j',
    (url) => {
      expect(ok({ embeds: [{ url }] })).toBe(false);
    },
  );

  it.each(['file:///etc/passwd', ' https://a.example/x.pdf', 'https://a.example/x\t.pdf', '//a.example/x.pdf'])('refuse files[].url = %j', (url) => {
    expect(ok({ files: [{ url }] })).toBe(false);
  });

  it.each(['..\\..\\x.pdf', './media/%2e%2e/x.pdf', './media/..%2Fx.pdf', './media/a\u0000.pdf'])('refuse attachments[].file = %j', (file) => {
    expect(ok({ attachments: [{ file }] })).toBe(false);
  });

  it.each(['..\\x.jpg', '%2e%2e%2fx.jpg', 'a\u0000.jpg'])('refuse images[].file = %j', (file) => {
    expect(ok({ images: [{ file }] })).toBe(false);
  });

  it('accepte les formes admises : relatif, absolu au site, http(s) quelle que soit la casse du schéma', () => {
    expect(
      ok({
        images: ['./media/01.jpg', '/content/x/media/02.jpg', 'https://a.example/3.jpg', 'HTTPS://a.example/4.jpg', { url: 'media/5.jpg', alt: 'x' }, { file: '06.jpg' }],
        embeds: [{ url: 'HTTP://a.example/v', poster: './media/p.jpg' }, { url: 'https://a.example/w', poster: 'https://a.example/p.jpg' }],
        files: [{ url: 'https://a.example/x.pdf' }],
        attachments: [{ file: './media/doc.pdf', title: 'Doc' }, { file: 'media/Mon doc.pdf' }],
      }),
    ).toBe(true);
  });

  it('un objet qui cache sa `url` hostile derrière une autre forme n\'en garde pas la valeur', () => {
    const result = schema.safeParse({ title: 'T', images: [{ url: 'javascript:alert(1)', file: '01.jpg' }] });
    expect(JSON.stringify(result.success ? result.data : result.error.issues)).not.toContain('javascript:alert(1)\"');
    if (result.success) expect(result.data.images?.[0]).toEqual({ file: '01.jpg' });
  });

  it('la valeur se lit telle qu\'écrite : `javascript%3A` et `&colon;` ne sont ni décodés ni refusés', () => {
    expect(ok({ images: ['javascript%3Aalert(1)', 'javascript&colon;alert(1)'] })).toBe(true);
  });

  it('garde `.extend()` disponible avec `cover` : le site y met `image()`', () => {
    const extended = baseSeriesSchema({ dateRequired: true }).extend({ cover: z.string().optional() });
    expect(extended.safeParse({ title: 'T', date: '2024-01-01', cover: './media/01.jpg' }).success).toBe(true);
  });
});

describe('helpers — données non validées par Zod', () => {
  it('getSeriesAttachments écarte une entrée files[] au schéma hostile', async () => {
    const series = makeSeries({
      files: [{ url: 'javascript:alert(1)' }, { url: 'data:text/html,x' }, { url: 'https://cdn.example/ok.pdf' }],
    });
    const result = await getSeriesAttachments('demo', series);
    expect(result.map((a) => a.src)).toEqual(['https://cdn.example/ok.pdf']);
  });

  it('getSeriesEmbeds écarte une entrée au schéma hostile', async () => {
    const series = makeSeries({
      embeds: [{ url: 'javascript:alert(1)', platform: 'vimeo', id: '1' }, { url: 'https://vimeo.com/2' }],
    });
    const result = await getSeriesEmbeds('demo', series);
    expect(result.map((e) => e.url)).toEqual(['https://vimeo.com/2']);
  });
});
