/**
 * #152 — `embeds[].url` et `files[].url` finissent dans un `href` : seuls
 * `http(s)` (et, hors schéma, un chemin sans schéma) sont admis.
 */
import { describe, it, expect } from 'vitest';
import { baseSeriesSchema } from '../../src/schema.js';
import { getSeriesAttachments, getSeriesEmbeds } from '../../src/helpers/index.js';
import { isSafeLinkUrl } from '../../src/ingest/paths.js';
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
    for (const url of ['https://a.example/x', 'http://a.example', '/media/x.zip', './x.pdf', '../x.pdf', 'media/x.pdf', '//cdn.example/x']) {
      expect(isSafeLinkUrl(url), url).toBe(true);
    }
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
