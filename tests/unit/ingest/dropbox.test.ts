import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { CursorResetError, applyDelta } from '../../../src/ingest/index.js';
import {
  DropboxApiError,
  DropboxClient,
  DropboxProvider,
  DropboxRateLimitError,
  dropboxChallenge,
  verifyDropboxSignature,
} from '../../../src/ingest/dropbox.js';
import type { DropboxMetadata } from '../../../src/ingest/dropbox.js';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: string;
  bytes: Uint8Array;
}

type Handler = (call: Call) => Response | Promise<Response>;

/**
 * Faux serveur Dropbox : une réponse (rejouable) ou un gestionnaire par
 * endpoint, ou une file de gestionnaires consommés dans l'ordre. Les appels
 * sont enregistrés.
 */
function fakeDropbox(routes: Record<string, Response | Handler | Handler[]>) {
  const calls: Call[] = [];
  const asHandler = (v: Response | Handler): Handler => (v instanceof Response ? () => v.clone() : v);
  const queues = new Map(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : asHandler(v)] as const),
  );
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const raw = init?.body;
    const bytes = raw instanceof Uint8Array ? raw : new TextEncoder().encode(typeof raw === 'string' ? raw : '');
    const call = {
      url,
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: new TextDecoder().decode(bytes),
      bytes,
    };
    calls.push(call);
    const route = queues.get(path);
    if (route === undefined) throw new Error(`route inattendue : ${path}`);
    const handler = Array.isArray(route) ? route.shift() : route;
    if (handler === undefined) throw new Error(`plus de réponse pour ${path}`);
    return handler(call);
  };
  return { fetch: fetchFn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const noSleep = { sleep: async () => {} };

function file(pathDisplay: string, extra: Partial<Record<string, unknown>> = {}): DropboxMetadata {
  const name = pathDisplay.split('/').pop() as string;
  return {
    '.tag': 'file',
    name,
    id: `id:${pathDisplay.toLowerCase()}`,
    path_lower: pathDisplay.toLowerCase(),
    path_display: pathDisplay,
    size: 3,
    content_hash: `hash-${name}`,
    server_modified: '2026-09-28T08:00:00Z',
    client_modified: '2026-09-28T08:00:00Z',
    rev: '015f',
    is_downloadable: true,
    ...extra,
  } as DropboxMetadata;
}

function folder(pathDisplay: string): DropboxMetadata {
  return {
    '.tag': 'folder',
    name: pathDisplay.split('/').pop() as string,
    id: `id:${pathDisplay.toLowerCase()}`,
    path_lower: pathDisplay.toLowerCase(),
    path_display: pathDisplay,
  };
}

describe('DropboxClient — authentification', () => {
  it('rafraîchit avec le secret de l\'app, puis réutilise le jeton', async () => {
    const server = fakeDropbox({
      '/oauth2/token': json({ access_token: 'tok-1', token_type: 'bearer', expires_in: 14400 }),
      '/2/files/list_folder/get_latest_cursor': [() => json({ cursor: 'c1' }), () => json({ cursor: 'c2' })],
    });
    const client = new DropboxClient({ refreshToken: 'rt', appKey: 'key', appSecret: 'secret', fetch: server.fetch });
    expect(await client.getLatestCursor('/root')).toBe('c1');
    expect(await client.getLatestCursor('/root')).toBe('c2');
    expect(server.calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/oauth2/token',
      '/2/files/list_folder/get_latest_cursor',
      '/2/files/list_folder/get_latest_cursor',
    ]);
    expect(Object.fromEntries(new URLSearchParams(server.calls[0]?.body))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rt',
      client_id: 'key',
      client_secret: 'secret',
    });
    expect(server.calls[1]?.headers.Authorization).toBe('Bearer tok-1');
  });

  it('PKCE : rafraîchit sans secret', async () => {
    const server = fakeDropbox({
      '/oauth2/token': json({ access_token: 'tok', expires_in: 14400 }),
      '/2/files/list_folder/get_latest_cursor': json({ cursor: 'c' }),
    });
    await new DropboxClient({ refreshToken: 'rt', appKey: 'key', fetch: server.fetch }).getLatestCursor('');
    expect(new URLSearchParams(server.calls[0]?.body).has('client_secret')).toBe(false);
  });

  it('rafraîchit avant expiration, et une fois sur un 401', async () => {
    let t = 0;
    let n = 0;
    const server = fakeDropbox({
      '/oauth2/token': () => json({ access_token: `tok-${++n}`, expires_in: 3600 }),
      '/2/files/list_folder/get_latest_cursor': [
        () => json({ cursor: 'a' }),
        () => json({ cursor: 'b' }),
        () => json({ error_summary: 'expired_access_token/', error: { '.tag': 'expired_access_token' } }, 401),
        () => json({ cursor: 'c' }),
      ],
    });
    const client = new DropboxClient({ refreshToken: 'rt', appKey: 'k', fetch: server.fetch, now: () => t });
    await client.getLatestCursor('');
    t = 3600_000 - 30_000; // dans la dernière minute de validité
    await client.getLatestCursor('');
    expect(await client.getLatestCursor('')).toBe('c');
    const auth = server.calls.filter((c) => c.url.includes('/2/')).map((c) => c.headers.Authorization);
    expect(auth).toEqual(['Bearer tok-1', 'Bearer tok-2', 'Bearer tok-2', 'Bearer tok-3']);
  });

  it('un rafraîchissement refusé lève', async () => {
    const server = fakeDropbox({ '/oauth2/token': json({ error: 'invalid_grant' }, 400) });
    const client = new DropboxClient({ refreshToken: 'rt', appKey: 'k', fetch: server.fetch });
    await expect(client.getLatestCursor('')).rejects.toBeInstanceOf(DropboxApiError);
  });

  it('sans jeton ni moyen d\'en obtenir un : erreur explicite', async () => {
    await expect(new DropboxClient({ fetch: fakeDropbox({}).fetch }).getLatestCursor('')).rejects.toThrow(/aucun jeton/);
  });
});

describe('DropboxClient — résilience', () => {
  it('respecte Retry-After sur 429, backoff exponentiel sur 5xx', async () => {
    const waits: number[] = [];
    const server = fakeDropbox({
      '/2/files/list_folder/get_latest_cursor': [
        () => json({ error_summary: 'too_many_requests/', error: { reason: { '.tag': 'too_many_requests' }, retry_after: 2 } }, 429, { 'Retry-After': '2' }),
        () => new Response('upstream', { status: 503 }),
        () => new Response('upstream', { status: 500 }),
        () => json({ cursor: 'ok' }),
      ],
    });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch, sleep: async (ms) => void waits.push(ms) });
    expect(await client.getLatestCursor('')).toBe('ok');
    expect(waits).toEqual([2000, 2000, 4000]);
  });

  it('Retry-After au-delà du plafond : DropboxRateLimitError, sans attendre', async () => {
    const waits: number[] = [];
    const busy = () => new Response('slow down', { status: 429, headers: { 'Retry-After': '120' } });
    const server = fakeDropbox({ '/2/files/list_folder/get_latest_cursor': busy });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch, sleep: async (ms) => void waits.push(ms) });
    await expect(client.getLatestCursor('')).rejects.toMatchObject({ name: 'DropboxRateLimitError', status: 429, retryAfterMs: 120_000 });
    await expect(client.getLatestCursor('')).rejects.toBeInstanceOf(DropboxRateLimitError);
    expect(waits).toEqual([]);
  });

  it('plafond configurable ; le backoff exponentiel s\'y arrête aussi', async () => {
    const waits: number[] = [];
    const server = fakeDropbox({
      '/2/files/list_folder/get_latest_cursor': [
        () => new Response('slow down', { status: 429, headers: { 'Retry-After': '120' } }),
        () => new Response('', { status: 500 }),
        () => new Response('', { status: 500 }),
        () => new Response('', { status: 500 }),
        () => json({ cursor: 'ok' }),
      ],
    });
    const sleep = async (ms: number) => void waits.push(ms);
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch, sleep, maxRetryWait: 150_000 });
    expect(await client.getLatestCursor('')).toBe('ok');
    expect(waits).toEqual([120_000, 2000, 4000, 8000]);
    const capped = fakeDropbox({
      '/2/files/list_folder/get_latest_cursor': [...Array(4)].map(() => () => new Response('', { status: 503 })).concat([() => json({ cursor: 'ok' })]),
    });
    waits.length = 0;
    await new DropboxClient({ accessToken: 't', fetch: capped.fetch, sleep, maxRetryWait: 3000 }).getLatestCursor('');
    expect(waits).toEqual([1000, 2000, 3000, 3000]);
  });

  it('l\'attente entre deux tentatives s\'interrompt sur le signal', async () => {
    const server = fakeDropbox({
      '/2/files/list_folder/get_latest_cursor': () => new Response('', { status: 503, headers: { 'Retry-After': '30' } }),
    });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch });
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(new Error('annulé')), 20);
    await expect(client.getLatestCursor('', { signal: controller.signal })).rejects.toThrow('annulé');
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('abandonne après maxRetries avec l\'erreur de Dropbox', async () => {
    const server = fakeDropbox({ '/2/files/list_folder/get_latest_cursor': () => new Response('busy', { status: 503 }) });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch, maxRetries: 2, ...noSleep });
    await expect(client.getLatestCursor('')).rejects.toMatchObject({ status: 503 });
    expect(server.calls).toHaveLength(3);
  });

  it('une erreur ne recopie jamais le corps brut : ni jeton, ni champ annexe', async () => {
    const secret = 'sl.refresh_token=rt-SECRET-123';
    const server = fakeDropbox({
      '/2/files/list_folder/get_latest_cursor': [
        () => new Response(`<html>proxy dump ${secret}</html>`, { status: 400 }),
        () => json({ error_summary: 'path/malformed/', error: { '.tag': 'path' }, debug: secret }, 409),
        () => json({ error_summary: `${'x'.repeat(600)}${secret}`, error: { '.tag': 'other' } }, 409),
      ],
      '/oauth2/token': json({ error: 'invalid_grant', error_description: secret }, 400),
    });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch, maxRetries: 0 });
    const errors: DropboxApiError[] = [];
    for (let i = 0; i < 3; i++) errors.push(await client.getLatestCursor('').catch((e: DropboxApiError) => e));
    errors.push(
      await new DropboxClient({ refreshToken: 'rt', appKey: 'k', fetch: server.fetch }).refreshAccessToken().catch((e: DropboxApiError) => e),
    );
    expect(errors.map((e) => e.summary.length <= 500 && e.summary)).toEqual(['HTTP 400', 'path/malformed/', 'x'.repeat(500), 'invalid_grant']);
    for (const error of errors) {
      expect(error).toBeInstanceOf(DropboxApiError);
      expect(`${error.message} ${error.summary} ${JSON.stringify(error)}`).not.toContain('SECRET');
    }
  });

  it('409 structuré → DropboxApiError avec tag ; reset du curseur → CursorResetError', async () => {
    const server = fakeDropbox({
      '/2/files/list_folder': json({ error_summary: 'path/not_found/..', error: { '.tag': 'path', path: { '.tag': 'not_found' } } }, 409),
      '/2/files/list_folder/continue': json({ error_summary: 'reset/...', error: { '.tag': 'reset' } }, 409),
    });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch });
    await expect(client.listFolder('/absent')).rejects.toMatchObject({ status: 409, tag: 'path', summary: 'path/not_found/..' });
    await expect(client.listFolderContinue('old')).rejects.toBeInstanceOf(CursorResetError);
  });
});

describe('DropboxClient — listing, téléchargement, upload', () => {
  it('suit les pages de list_folder', async () => {
    const server = fakeDropbox({
      '/2/files/list_folder': json({ entries: [folder('/R')], cursor: 'p1', has_more: true }),
      '/2/files/list_folder/continue': json({ entries: [file('/R/a.md')], cursor: 'p2', has_more: false }),
    });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch });
    const result = await client.listFolder('/R', { recursive: true });
    expect(result.cursor).toBe('p2');
    expect(result.entries.map((e) => e.name)).toEqual(['R', 'a.md']);
    expect(JSON.parse(server.calls[0]?.body ?? '')).toMatchObject({ path: '/R', recursive: true, include_deleted: false });
    expect(JSON.parse(server.calls[1]?.body ?? '')).toEqual({ cursor: 'p1' });
  });

  it('download : Dropbox-API-Arg échappé en ASCII, octets et métadonnées', async () => {
    const server = fakeDropbox({
      '/2/files/download': () =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'Dropbox-API-Result': JSON.stringify(file('/R/été.jpg')) } }),
    });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch });
    const { bytes, metadata } = await client.download('/R/été.jpg');
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(metadata?.name).toBe('été.jpg');
    const arg = server.calls[0]?.headers['Dropbox-API-Arg'] ?? '';
    expect(arg).toBe('{"path":"/R/\\u00e9t\\u00e9.jpg"}');
    expect(/^[\x20-\x7e]*$/.test(arg)).toBe(true);
    expect(JSON.parse(arg)).toEqual({ path: '/R/été.jpg' });
  });

  it('upload simple sous le seuil', async () => {
    const server = fakeDropbox({ '/2/files/upload': json(file('/R/a.jpg')) });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch });
    await client.upload('/R/a.jpg', new Uint8Array([9, 9, 9]));
    expect(JSON.parse(server.calls[0]?.headers['Dropbox-API-Arg'] ?? '')).toEqual({
      path: '/R/a.jpg',
      mode: 'overwrite',
      autorename: false,
      mute: true,
    });
    expect([...(server.calls[0]?.bytes ?? [])]).toEqual([9, 9, 9]);
  });

  it('upload par session au-delà du seuil : start, append_v2, finish', async () => {
    const server = fakeDropbox({
      '/2/files/upload_session/start': json({ session_id: 'S' }),
      '/2/files/upload_session/append_v2': () => new Response('null', { headers: { 'Content-Type': 'application/json' } }),
      '/2/files/upload_session/finish': json(file('/R/big.bin', { size: 10 })),
    });
    const client = new DropboxClient({ accessToken: 't', fetch: server.fetch, uploadSessionThreshold: 5, uploadChunkSize: 4 });
    const meta = await client.upload('/R/big.bin', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(meta.size).toBe(10);
    const steps = server.calls.map((c) => [new URL(c.url).pathname.split('/').pop(), JSON.parse(c.headers['Dropbox-API-Arg'] ?? ''), [...c.bytes]]);
    expect(steps).toEqual([
      ['start', { close: false }, [0, 1, 2, 3]],
      ['append_v2', { cursor: { session_id: 'S', offset: 4 }, close: false }, [4, 5, 6, 7]],
      [
        'finish',
        { cursor: { session_id: 'S', offset: 8 }, commit: { path: '/R/big.bin', mode: 'overwrite', autorename: false, mute: true } },
        [8, 9],
      ],
    ]);
  });
});

describe('DropboxProvider', () => {
  const listing = [
    folder('/MDR Content'),
    folder('/MDR Content/Archives'),
    folder('/MDR Content/Archives/Été-2024'),
    folder('/MDR Content/Archives/Été-2024/media'),
    // path_display dont la casse des parents est fausse : seul le dernier segment est fiable.
    file('/mdr content/archives/été-2024/index.md'),
    file('/MDR Content/Archives/Été-2024/media/01.jpg'),
    file('/MDR Content/Archives/Été-2024/media/.DS_Store'),
    file('/MDR Content/Archives/Été-2024/media/doc.gdoc', { is_downloadable: false }),
    file('/MDR Content/_todo/x.md'),
    file('/Autre/hors-racine.md'),
  ];

  it('liste relativement à la racine, casse reconstruite, exclusions appliquées', async () => {
    const server = fakeDropbox({ '/2/files/list_folder': json({ entries: listing, cursor: 'cur-1', has_more: false }) });
    const provider = new DropboxProvider({
      client: new DropboxClient({ accessToken: 't', fetch: server.fetch }),
      root: '/MDR Content/',
      ignore: ['_todo/'],
    });
    const result = await provider.list();
    expect(result).toMatchObject({ complete: true, cursor: 'cur-1', revision: 'cur-1' });
    expect(result.entries).toEqual([
      {
        path: 'Archives/Été-2024/index.md',
        kind: 'content',
        size: 3,
        hashes: { dropbox: 'hash-index.md' },
        identity: 'id:/mdr content/archives/été-2024/index.md',
        modifiedAt: '2026-09-28T08:00:00Z',
      },
      expect.objectContaining({ path: 'Archives/Été-2024/media/01.jpg', kind: 'media' }),
    ]);
    expect(JSON.parse(server.calls[0]?.body ?? '')).toMatchObject({ path: '/MDR Content', recursive: true });
    expect(provider.capabilities).toMatchObject({ incrementalChanges: true, stableIdentity: true, serverWebhook: true, hashAlgorithms: ['dropbox'] });
  });

  it('changes : delta replié, casse des dossiers connue réutilisée, reset signalé', async () => {
    const server = fakeDropbox({
      '/2/files/list_folder': json({ entries: listing, cursor: 'cur-1', has_more: false }),
      '/2/files/list_folder/continue': [
        () =>
          json({
            entries: [
              file('/mdr content/archives/été-2024/media/02.jpg'),
              folder('/MDR Content/Archives/Neu'),
              file('/mdr content/archives/neu/index.md'),
              file('/MDR Content/Archives/Été-2024/media/tmp.jpg'),
              { '.tag': 'deleted', name: 'tmp.jpg', path_lower: '/mdr content/archives/été-2024/media/tmp.jpg', path_display: '/MDR Content/Archives/Été-2024/media/tmp.jpg' },
              { '.tag': 'deleted', name: '01.jpg', path_lower: '/mdr content/archives/été-2024/media/01.jpg', path_display: '/mdr content/archives/été-2024/media/01.jpg' },
            ],
            cursor: 'cur-2',
            has_more: false,
          }),
        () => json({ error_summary: 'reset/..', error: { '.tag': 'reset' } }, 409),
      ],
    });
    const provider = new DropboxProvider({
      client: new DropboxClient({ accessToken: 't', fetch: server.fetch }),
      root: '/MDR Content',
      ignore: ['_todo/'],
    });
    const base = await provider.list();
    const delta = await provider.changes('cur-1');
    expect(delta.cursor).toBe('cur-2');
    expect(delta.upserts.map((e) => e.path)).toEqual(['Archives/Été-2024/media/02.jpg', 'Archives/Neu/index.md']);
    expect(delta.deletions).toEqual(['Archives/Été-2024/media/tmp.jpg', 'Archives/Été-2024/media/01.jpg']);

    const next = applyDelta(base, delta);
    expect(next.entries.map((e) => e.path)).toEqual([
      'Archives/Neu/index.md',
      'Archives/Été-2024/index.md',
      'Archives/Été-2024/media/02.jpg',
    ]);

    expect(await provider.changes('cur-2')).toEqual({ upserts: [], deletions: [], cursor: 'cur-2', reset: true });
  });

  it('read, write et latestCursor adressent le chemin absolu', async () => {
    const server = fakeDropbox({
      '/2/files/download': () => new Response('abc'),
      '/2/files/upload': json(file('/MDR Content/a/media/01.jpg', { content_hash: 'h1', id: 'id:new' })),
      '/2/files/list_folder/get_latest_cursor': json({ cursor: 'latest' }),
    });
    const provider = new DropboxProvider({ client: new DropboxClient({ accessToken: 't', fetch: server.fetch }), root: 'MDR Content' });
    expect(new TextDecoder().decode(await provider.read('a/index.md'))).toBe('abc');
    expect(await provider.write('a/media/01.jpg', new Uint8Array([1, 2, 3]))).toMatchObject({
      path: 'a/media/01.jpg',
      kind: 'media',
      hashes: { dropbox: 'h1' },
      identity: 'id:new',
    });
    expect(await provider.latestCursor()).toBe('latest');
    expect(JSON.parse(server.calls[0]?.headers['Dropbox-API-Arg'] ?? '')).toEqual({ path: '/MDR Content/a/index.md' });
    expect(JSON.parse(server.calls[1]?.headers['Dropbox-API-Arg'] ?? '').path).toBe('/MDR Content/a/media/01.jpg');
    expect(JSON.parse(server.calls[2]?.body ?? '')).toMatchObject({ path: '/MDR Content', recursive: true });
  });

  it('racine = tout le Dropbox', async () => {
    const server = fakeDropbox({
      '/2/files/list_folder': json({ entries: [folder('/A'), file('/a/x.md')], cursor: 'c', has_more: false }),
    });
    const provider = new DropboxProvider({ client: new DropboxClient({ accessToken: 't', fetch: server.fetch }), root: '' });
    expect((await provider.list()).entries.map((e) => e.path)).toEqual(['A/x.md']);
    expect(JSON.parse(server.calls[0]?.body ?? '').path).toBe('');
  });
});

describe('webhook Dropbox', () => {
  const secret = 'app-secret';
  const body = '{"list_folder":{"accounts":["dbid:AAH4f99T0taONIb-OurWxbNQ6ywGRopQngc"]},"delta":{"users":[12345]}}';
  const signature = createHmac('sha256', secret).update(body).digest('hex');

  it('accepte une signature valide, en chaîne comme en octets, casse de l\'en-tête indifférente', async () => {
    expect(await verifyDropboxSignature(body, signature, secret)).toBe(true);
    expect(await verifyDropboxSignature(new TextEncoder().encode(body), signature.toUpperCase(), secret)).toBe(true);
  });

  it('refuse un corps altéré, une signature tronquée, un en-tête absent, un mauvais secret', async () => {
    expect(await verifyDropboxSignature(`${body} `, signature, secret)).toBe(false);
    expect(await verifyDropboxSignature(body, signature.slice(0, -1), secret)).toBe(false);
    expect(await verifyDropboxSignature(body, null, secret)).toBe(false);
    expect(await verifyDropboxSignature(body, '', secret)).toBe(false);
    expect(await verifyDropboxSignature(body, signature, 'autre')).toBe(false);
    expect(await verifyDropboxSignature(body, signature, '')).toBe(false);
  });

  it('challenge : renvoyé tel quel en texte nosniff, 400 sans paramètre', async () => {
    const ok = dropboxChallenge('https://example.com/api/hooks/dropbox?challenge=abc123');
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('abc123');
    expect(ok.headers.get('Content-Type')).toMatch(/^text\/plain/);
    expect(ok.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(dropboxChallenge(new URL('https://example.com/hook')).status).toBe(400);
  });
});
