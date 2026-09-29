import { describe, expect, it } from 'vitest';
import { WebDAVError, WebDAVProvider, etagHash } from '../../../src/ingest/webdav.js';

const BASE = 'https://dav.example.com/remote.php/dav/files/mathieu/MDR%20Content/';

interface FakeFile {
  content: string;
  etag: string;
}

/**
 * Faux serveur WebDAV : un arbre de fichiers, des réponses 207 dans le style de
 * Nextcloud (préfixe `d:`, propstat 404 pour les propriétés absentes des
 * collections), hrefs encodés.
 */
function fakeDav(files: Record<string, FakeFile>, options: { failing?: string[]; prefix?: string } = {}) {
  const requests: Array<{ method: string; url: string; headers: Record<string, string>; body?: string }> = [];
  const p = options.prefix ?? 'd';
  const basePath = new URL(BASE).pathname;
  const dirsOf = () => {
    const dirs = new Set<string>(['']);
    for (const path of Object.keys(files)) {
      const segments = path.split('/');
      for (let i = 1; i < segments.length; i++) dirs.add(segments.slice(0, i).join('/'));
    }
    return dirs;
  };
  const encode = (path: string) => path.split('/').map(encodeURIComponent).join('/');
  const response = (path: string, collection: boolean) => {
    const href = basePath + encode(path) + (collection && path !== '' ? '/' : '');
    const file = files[path];
    const ok = collection
      ? `<${p}:resourcetype><${p}:collection/></${p}:resourcetype>`
      : `<${p}:resourcetype/><${p}:getcontentlength>${new TextEncoder().encode(file?.content ?? '').length}</${p}:getcontentlength>` +
        `<${p}:getetag>${file?.etag.replace(/"/g, '&quot;')}</${p}:getetag>` +
        `<${p}:getlastmodified>Mon, 28 Sep 2026 08:00:00 GMT</${p}:getlastmodified>`;
    const missing = collection ? `<${p}:propstat><${p}:prop><${p}:getetag/></${p}:prop><${p}:status>HTTP/1.1 404 Not Found</${p}:status></${p}:propstat>` : '';
    return `<${p}:response><${p}:href>${href.replace(/&/g, '&amp;')}</${p}:href><${p}:propstat><${p}:prop>${ok}</${p}:prop><${p}:status>HTTP/1.1 200 OK</${p}:status></${p}:propstat>${missing}</${p}:response>`;
  };

  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = typeof init?.body === 'string' ? init.body : undefined;
    requests.push({ method, url, headers, ...(body !== undefined ? { body } : {}) });
    const rel = decodeURIComponent(new URL(url).pathname.slice(basePath.length)).replace(/\/$/, '');
    if (options.failing?.includes(rel)) return new Response('boom', { status: 500 });
    const dirs = dirsOf();

    if (method === 'PROPFIND') {
      const items: string[] = [];
      if (dirs.has(rel)) {
        items.push(response(rel, true));
        if (headers.Depth === '1') {
          for (const dir of dirs) if (dir !== '' && dir !== rel && dir.split('/').slice(0, -1).join('/') === rel) items.push(response(dir, true));
          for (const path of Object.keys(files)) if (path.split('/').slice(0, -1).join('/') === rel) items.push(response(path, false));
        }
      } else if (files[rel] !== undefined) {
        items.push(response(rel, false));
      } else {
        return new Response('', { status: 404 });
      }
      return new Response(`<?xml version="1.0"?>\n<${p}:multistatus xmlns:${p}="DAV:" xmlns:oc="http://owncloud.org/ns">${items.join('')}</${p}:multistatus>`, { status: 207 });
    }
    if (method === 'GET') {
      const file = files[rel];
      return file === undefined ? new Response('', { status: 404 }) : new Response(file.content);
    }
    if (method === 'MKCOL') return new Response('', { status: dirs.has(rel) ? 405 : 201 });
    if (method === 'PUT') {
      files[rel] = { content: new TextDecoder().decode(init?.body as Uint8Array), etag: '"new-etag"' };
      return new Response('', { status: 201 });
    }
    return new Response('', { status: 405 });
  };
  return { fetch: fetchFn, requests };
}

describe('etagHash', () => {
  it('hexadécimal des octets de l\'ETag, guillemets et marque faible retirés', () => {
    expect(etagHash('"abc"')).toBe('616263');
    expect(etagHash('W/"abc"')).toBe('616263');
    expect(etagHash('abc')).toBe('616263');
  });
});

describe('WebDAVProvider', () => {
  const tree = () => ({
    'archives/été 2024/index.md': { content: '---\ntitle: T\n---\n', etag: '"e1"' },
    'archives/été 2024/media/01.jpg': { content: 'jpg', etag: 'W/"e2"' },
    'archives/été 2024/media/.DS_Store': { content: 'x', etag: '"e3"' },
    'archives/a&b/index.md': { content: 'amp', etag: '"e4"' },
    '_todo/draft.md': { content: 'x', etag: '"e5"' },
  });

  it('parcourt en PROPFIND Depth 1, décode les hrefs, exclut, rend x-etag, taille et date', async () => {
    const server = fakeDav(tree());
    const provider = new WebDAVProvider({ url: BASE, username: 'mathieu', password: 'pässword', fetch: server.fetch, ignore: ['_todo/'] });
    const listing = await provider.list();
    expect(listing.complete).toBe(true);
    expect(listing.entries).toEqual([
      { path: 'archives/a&b/index.md', kind: 'content', size: 3, hashes: { 'x-etag': etagHash('"e4"') }, modifiedAt: '2026-09-28T08:00:00.000Z' },
      { path: 'archives/été 2024/index.md', kind: 'content', size: 17, hashes: { 'x-etag': etagHash('"e1"') }, modifiedAt: '2026-09-28T08:00:00.000Z' },
      { path: 'archives/été 2024/media/01.jpg', kind: 'media', size: 3, hashes: { 'x-etag': etagHash('"e2"') }, modifiedAt: '2026-09-28T08:00:00.000Z' },
    ]);
    const propfinds = server.requests.filter((r) => r.method === 'PROPFIND');
    expect(propfinds.every((r) => r.headers.Depth === '1')).toBe(true);
    // `_todo/` n'est jamais parcouru.
    expect(propfinds.some((r) => r.url.includes('_todo'))).toBe(false);
    expect(propfinds[0]?.headers.Authorization).toBe(`Basic ${Buffer.from('mathieu:pässword').toString('base64')}`);
    expect(provider.capabilities).toMatchObject({ incrementalChanges: false, stableIdentity: false, remoteRead: true, hashAlgorithms: ['x-etag'] });
  });

  it('accepte un autre préfixe d\'espace de noms', async () => {
    const server = fakeDav({ 'a/index.md': { content: 'x', etag: '"1"' } }, { prefix: 'D' });
    const listing = await new WebDAVProvider({ url: BASE, fetch: server.fetch }).list();
    expect(listing.entries.map((e) => e.path)).toEqual(['a/index.md']);
    expect(server.requests[0]?.headers.Authorization).toBeUndefined();
  });

  it('une collection illisible rend le listing incomplet ; la racine illisible lève', async () => {
    const files = { 'a/index.md': { content: 'x', etag: '"1"' }, 'b/index.md': { content: 'y', etag: '"2"' } };
    const partial = await new WebDAVProvider({ url: BASE, fetch: fakeDav(files, { failing: ['b'] }).fetch }).list();
    expect(partial.complete).toBe(false);
    expect(partial.entries.map((e) => e.path)).toEqual(['a/index.md']);
    await expect(new WebDAVProvider({ url: BASE, fetch: fakeDav(files, { failing: [''] }).fetch }).list()).rejects.toBeInstanceOf(WebDAVError);
  });

  it('read via GET, chemin encodé ; un chemin invalide est refusé', async () => {
    const server = fakeDav(tree());
    const provider = new WebDAVProvider({ url: BASE.replace(/\/$/, ''), fetch: server.fetch });
    expect(new TextDecoder().decode(await provider.read('archives/été 2024/media/01.jpg'))).toBe('jpg');
    expect(server.requests[0]?.url).toBe(`${BASE}archives/%C3%A9t%C3%A9%202024/media/01.jpg`);
    await expect(provider.read('archives/absent.md')).rejects.toMatchObject({ status: 404 });
    await expect(provider.read('../secret')).rejects.toThrow(/refusé/);
  });

  it('write : MKCOL des parents manquants, PUT, puis l\'ETag du serveur', async () => {
    const server = fakeDav({ 'a/index.md': { content: 'x', etag: '"1"' } });
    const provider = new WebDAVProvider({ url: BASE, fetch: server.fetch });
    const entry = await provider.write('a/neu/media/01.jpg', new TextEncoder().encode('pix'));
    expect(entry).toMatchObject({ path: 'a/neu/media/01.jpg', kind: 'media', size: 3, hashes: { 'x-etag': etagHash('"new-etag"') } });
    expect(server.requests.map((r) => `${r.method} ${decodeURIComponent(new URL(r.url).pathname.slice(new URL(BASE).pathname.length))}`)).toEqual([
      'MKCOL a/',
      'MKCOL a/neu/',
      'MKCOL a/neu/media/',
      'PUT a/neu/media/01.jpg',
      'PROPFIND a/neu/media/01.jpg',
    ]);
  });
});
