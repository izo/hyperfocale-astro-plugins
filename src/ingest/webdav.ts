/**
 * `@regrets/hyperfocale/ingest/webdav` — provider WebDAV.
 *
 * `fetch` seulement, sans dépendance : le parseur XML ci-dessous ne lit que ce
 * qu'une réponse PROPFIND contient.
 */

import { mapConcurrent } from './concurrency.js';
import { utf8 } from './hash.js';
import { classifyPath, compareCanonical, isExcluded, normalizePath } from './paths.js';
import type { ExclusionRule } from './paths.js';
import type {
  ContentProvider,
  ProviderCallOptions,
  ProviderCapabilities,
  ProviderListing,
  SnapshotEntry,
} from './types.js';

/** Nœud XML réduit : nom local (préfixe d'espace de noms retiré), enfants, texte. */
interface XmlNode {
  readonly name: string;
  readonly children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[ref.toLowerCase()] ?? match;
  });
}

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([^\s/>]+)[^>]*?(\/?)>|([^<]+)/g;

/**
 * Parseur XML minimal : suffisant pour une réponse `207 Multi-Status`. Les
 * espaces de noms sont ignorés — `D:href`, `d:href` et `href` se lisent pareil,
 * ce qui absorbe les préfixes variables des serveurs (Apache, Nextcloud, nginx).
 */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#document', children: [], text: '' };
  const stack: XmlNode[] = [root];
  for (const match of xml.matchAll(TOKEN)) {
    const [, cdata, closing, qname, selfClosing, text] = match;
    const current = stack[stack.length - 1] as XmlNode;
    if (cdata !== undefined) {
      current.text += cdata;
    } else if (text !== undefined) {
      current.text += decodeEntities(text);
    } else if (qname !== undefined) {
      const name = qname.slice(qname.indexOf(':') + 1);
      if (closing === '/') {
        const at = stack.map((n) => n.name).lastIndexOf(name);
        if (at > 0) stack.length = at;
      } else {
        const node: XmlNode = { name, children: [], text: '' };
        current.children.push(node);
        if (selfClosing !== '/') stack.push(node);
      }
    }
  }
  return root;
}

function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => child.name === name);
}

function descendantsNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.flatMap((child) => (child.name === name ? [child] : descendantsNamed(child, name)));
}

/** Ressource d'une réponse PROPFIND. */
interface DavResource {
  readonly href: string;
  readonly collection: boolean;
  readonly size?: number;
  readonly etag?: string;
  readonly lastModified?: string;
}

/** Ressources d'un `207 Multi-Status`, propriétés des seuls `propstat` en 200. */
function parseMultiStatus(xml: string): DavResource[] {
  return descendantsNamed(parseXml(xml), 'response').flatMap((response) => {
    const href = childrenNamed(response, 'href')[0]?.text.trim();
    if (href === undefined || href === '') return [];
    const props = childrenNamed(response, 'propstat')
      .filter((propstat) => / 2\d\d /.test(` ${childrenNamed(propstat, 'status')[0]?.text.trim() ?? ''} `))
      .flatMap((propstat) => childrenNamed(propstat, 'prop'))
      .flatMap((prop) => prop.children);
    const value = (name: string) => props.find((p) => p.name === name)?.text.trim();
    const size = value('getcontentlength');
    const etag = value('getetag');
    const lastModified = value('getlastmodified');
    return [
      {
        href,
        collection: props.some((p) => p.name === 'resourcetype' && p.children.some((c) => c.name === 'collection')),
        ...(size !== undefined && size !== '' ? { size: Number(size) } : {}),
        ...(etag !== undefined && etag !== '' ? { etag } : {}),
        ...(lastModified !== undefined && lastModified !== '' ? { lastModified } : {}),
      },
    ];
  });
}

const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<d:propfind xmlns:d="DAV:"><d:prop>' +
  '<d:resourcetype/><d:getcontentlength/><d:getetag/><d:getlastmodified/>' +
  '</d:prop></d:propfind>';

/** Erreur HTTP d'un serveur WebDAV. */
export class WebDAVError extends Error {
  readonly status: number;

  constructor(method: string, url: string, status: number) {
    super(`[hyperfocale] WebDAV ${method} ${url} : ${status}`);
    this.name = 'WebDAVError';
    this.status = status;
  }
}

/** Options du `WebDAVProvider`. */
export interface WebDAVProviderOptions {
  /** URL de la collection racine du corpus. */
  readonly url: string;
  readonly username?: string;
  readonly password?: string;
  /** Défaut : `globalThis.fetch`. */
  readonly fetch?: typeof fetch;
  /** Exclusions du consumer, en plus de celles du contrat (§4.2). */
  readonly ignore?: readonly ExclusionRule[];
  /** Requêtes PROPFIND simultanées. Défaut 4. */
  readonly concurrency?: number;
}

/** Base64 d'une chaîne UTF-8 — `btoa` n'accepte que du Latin-1. */
function base64Utf8(text: string): string {
  return btoa(Array.from(utf8(text), (byte) => String.fromCharCode(byte)).join(''));
}

/** Décode un chemin d'URL segment par segment ; un segment malformé reste tel quel. */
function decodePath(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}

/**
 * Provider WebDAV : PROPFIND `Depth: 1` de collection en collection — un
 * `Depth: infinity` est désactivé sur la plupart des serveurs.
 *
 * Pas d'incrémental ni d'identité stable : la réconciliation passe par des
 * listings complets. Empreinte `x-etag` seulement. Une collection illisible
 * n'interrompt pas le parcours et rend le listing `complete: false` ; la
 * racine illisible lève.
 */
export class WebDAVProvider implements ContentProvider {
  readonly type = 'webdav';
  readonly capabilities: ProviderCapabilities = {
    localRead: false,
    localWrite: false,
    remoteRead: true,
    remoteWrite: true,
    incrementalChanges: false,
    stableIdentity: false,
    serverWebhook: false,
    clientChangeObservation: false,
    materializationAware: false,
    hashAlgorithms: ['x-etag'],
  };
  private readonly base: URL;
  private readonly basePath: string;
  private readonly headers: Record<string, string>;
  private readonly fetchFn: typeof fetch;
  private readonly ignore: readonly ExclusionRule[];
  private readonly concurrency: number;
  /** Collections connues à l'issue du dernier listing ou écrites depuis. */
  private readonly knownCollections = new Set<string>();

  constructor(options: WebDAVProviderOptions) {
    this.base = new URL(options.url.endsWith('/') ? options.url : `${options.url}/`);
    this.basePath = decodePath(this.base.pathname);
    this.headers =
      options.username !== undefined
        ? { Authorization: `Basic ${base64Utf8(`${options.username}:${options.password ?? ''}`)}` }
        : {};
    this.fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.ignore = options.ignore ?? [];
    this.concurrency = options.concurrency ?? 4;
  }

  /** URL d'un chemin relatif du corpus ; `collection` ajoute le `/` final. */
  private urlFor(path: string, collection = false): string {
    const encoded = path === '' ? '' : path.split('/').map(encodeURIComponent).join('/');
    return new URL(`${encoded}${collection && path !== '' ? '/' : ''}`, this.base).href;
  }

  private checked(path: string): string {
    const normalized = normalizePath(path);
    if (!normalized.valid) throw new Error(`[hyperfocale] chemin refusé « ${path} » : ${normalized.reason}.`);
    return normalized.path;
  }

  private async propfind(url: string, depth: '0' | '1', signal?: AbortSignal): Promise<DavResource[]> {
    const response = await this.fetchFn(url, {
      method: 'PROPFIND',
      headers: { ...this.headers, Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' },
      body: PROPFIND_BODY,
      ...(signal !== undefined ? { signal } : {}),
    });
    if (response.status !== 207) {
      await response.body?.cancel();
      throw new WebDAVError('PROPFIND', url, response.status);
    }
    return parseMultiStatus(await response.text());
  }

  /** Chemin relatif (NFC) d'un href de réponse, `''` pour la racine, `null` hors racine. */
  private relativePath(href: string): string | null {
    const decoded = decodePath(new URL(href, this.base).pathname);
    if (!decoded.startsWith(this.basePath) && `${decoded}/` !== this.basePath) return null;
    return decoded.slice(this.basePath.length).replace(/\/+$/, '').normalize('NFC');
  }

  private toEntry(path: string, resource: DavResource): SnapshotEntry {
    const modified = resource.lastModified !== undefined ? Date.parse(resource.lastModified) : NaN;
    return {
      path,
      kind: classifyPath(path),
      size: resource.size ?? 0,
      // Empreinte `x-etag` (§4.4) : l'ETag tel que le serveur le rend, guillemets
      // et marque faible compris — opaque, comparable seulement à lui-même.
      ...(resource.etag !== undefined ? { hashes: { 'x-etag': resource.etag } } : {}),
      ...(Number.isNaN(modified) ? {} : { modifiedAt: new Date(modified).toISOString() }),
    };
  }

  async list(opts: ProviderCallOptions = {}): Promise<ProviderListing> {
    let complete = true;
    const entries: SnapshotEntry[] = [];
    this.knownCollections.clear();

    let level = [''];
    while (level.length > 0) {
      const next: string[] = [];
      await mapConcurrent(level, this.concurrency, async (dir) => {
        opts.signal?.throwIfAborted();
        let resources: DavResource[];
        try {
          resources = await this.propfind(this.urlFor(dir, true), '1', opts.signal);
        } catch (err) {
          if (dir === '') throw err;
          complete = false;
          return;
        }
        this.knownCollections.add(dir);
        for (const resource of resources) {
          const path = this.relativePath(resource.href);
          if (path === null || path === '' || path === dir) continue;
          if (isExcluded(resource.collection ? `${path}/` : path, this.ignore)) continue;
          if (resource.collection) next.push(path);
          else entries.push(this.toEntry(path, resource));
        }
      });
      level = next;
    }

    entries.sort((a, b) => compareCanonical(a.path, b.path));
    return { entries, complete };
  }

  async read(path: string, opts: ProviderCallOptions = {}): Promise<Uint8Array> {
    const url = this.urlFor(this.checked(path));
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: this.headers,
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new WebDAVError('GET', url, response.status);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Écrit un fichier : collections parentes créées au besoin (`MKCOL`, 405 =
   * déjà là), `PUT`, puis `PROPFIND Depth: 0` pour rendre l'ETag du serveur.
   */
  async write(path: string, bytes: Uint8Array, opts: ProviderCallOptions = {}): Promise<SnapshotEntry> {
    const target = this.checked(path);
    const init = opts.signal !== undefined ? { signal: opts.signal } : {};
    const segments = target.split('/');
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join('/');
      if (this.knownCollections.has(dir)) continue;
      const url = this.urlFor(dir, true);
      const response = await this.fetchFn(url, { method: 'MKCOL', headers: this.headers, ...init });
      await response.body?.cancel();
      if (response.status !== 201 && response.status !== 405) throw new WebDAVError('MKCOL', url, response.status);
      this.knownCollections.add(dir);
    }

    const url = this.urlFor(target);
    const put = await this.fetchFn(url, {
      method: 'PUT',
      headers: { ...this.headers, 'Content-Type': 'application/octet-stream' },
      body: bytes as Uint8Array<ArrayBuffer>,
      ...init,
    });
    await put.body?.cancel();
    if (!put.ok) throw new WebDAVError('PUT', url, put.status);

    const [resource] = await this.propfind(url, '0', opts.signal);
    if (resource === undefined) throw new WebDAVError('PROPFIND', url, 207);
    return this.toEntry(target, { ...resource, size: resource.size ?? bytes.length });
  }
}
