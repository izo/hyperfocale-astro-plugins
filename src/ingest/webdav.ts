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
  ListingProblem,
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
      // `fromCodePoint` lève `RangeError` au-delà de U+10FFFF ; un substitut isolé
      // n'est pas un caractère. Une référence invalide reste telle quelle (SEC-007).
      const valid = Number.isInteger(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : match;
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

/** URL sans identifiants (`user:pass@`) : un message d'erreur finit dans des journaux. */
function redact(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.href;
  } catch {
    return url.replace(/\/\/[^/@]*@/, '//');
  }
}

/** Erreur HTTP d'un serveur WebDAV. */
export class WebDAVError extends Error {
  readonly status: number;

  constructor(method: string, url: string, status: number) {
    super(`[hyperfocale] WebDAV ${method} ${redact(url)} : ${status}`);
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
  /**
   * Autorise une URL `http:` hors boucle locale. Défaut `false` : l'en-tête
   * `Authorization: Basic` partirait en clair (SEC-007).
   */
  readonly allowInsecureHttp?: boolean;
  /** Délai maximal d'une requête, en millisecondes. Défaut 120 000 ; `0` : aucun. */
  readonly timeoutMs?: number;
  /** Taille maximale d'une réponse PROPFIND, en octets. Défaut 32 Mio. */
  readonly maxListingBytes?: number;
  /** Taille maximale d'un fichier lu (`read`), en octets. Défaut : aucune. */
  readonly maxFileBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_LISTING_BYTES = 32 * 1024 * 1024;

/** Boucle locale : `localhost`, `*.localhost`, `127.0.0.0/8`, `::1`. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host);
}

/** Corps d'une réponse, lu par morceaux ; au-delà de `max` octets, la lecture s'arrête et lève. */
async function readBounded(response: Response, max: number | undefined, what: string): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (max !== undefined && Number.isFinite(declared) && declared > max) {
    await response.body?.cancel();
    throw new Error(`[hyperfocale] WebDAV : ${what} trop volumineux (${declared} octets, maximum ${max}).`);
  }
  if (max === undefined || response.body === null) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error(`[hyperfocale] WebDAV : ${what} trop volumineux (plus de ${max} octets).`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** `decodeURIComponent` sans exception : une séquence malformée reste telle quelle. */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
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
 * listings complets. Empreinte `x-etag` seulement. Une collection illisible,
 * ou un fichier sans `getcontentlength` — dont la taille serait inventée —,
 * n'interrompt pas le parcours mais rend le listing `complete: false`, le motif
 * dans `problems` ; la racine illisible lève. Des identifiants passés dans
 * l'URL deviennent une authentification basic et ne paraissent dans aucun
 * message d'erreur.
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
  private readonly timeoutMs: number;
  private readonly maxListingBytes: number;
  private readonly maxFileBytes: number | undefined;
  /** Collections connues à l'issue du dernier listing ou écrites depuis. */
  private readonly knownCollections = new Set<string>();

  constructor(options: WebDAVProviderOptions) {
    this.base = new URL(options.url.endsWith('/') ? options.url : `${options.url}/`);
    if (this.base.protocol !== 'https:' && !(this.base.protocol === 'http:' && (options.allowInsecureHttp === true || isLoopbackHost(this.base.hostname)))) {
      throw new Error(
        `[hyperfocale] WebDAV : l'URL doit être en https:// (reçu ${this.base.protocol}//${this.base.host}). ` +
          `Un http:// envoie les identifiants en clair ; \`allowInsecureHttp: true\` le permet explicitement.`,
      );
    }
    // Des identifiants dans l'URL (`https://user:pass@…`) passent en
    // authentification basic : `fetch` refuse une telle URL, et elle fuirait
    // dans les messages d'erreur.
    const username = options.username ?? (this.base.username !== '' ? safeDecode(this.base.username) : undefined);
    const password = options.password ?? safeDecode(this.base.password);
    this.base.username = '';
    this.base.password = '';
    this.basePath = decodePath(this.base.pathname);
    this.headers =
      username !== undefined ? { Authorization: `Basic ${base64Utf8(`${username}:${password}`)}` } : {};
    this.fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.ignore = options.ignore ?? [];
    this.concurrency = options.concurrency ?? 4;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxListingBytes = options.maxListingBytes ?? DEFAULT_MAX_LISTING_BYTES;
    this.maxFileBytes = options.maxFileBytes;
  }

  /** Requête avec le délai par défaut, combiné au signal de l'appelant. */
  private request(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const signals = [signal, this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined].filter(
      (s): s is AbortSignal => s !== undefined,
    );
    const merged = signals.length === 0 ? undefined : signals.length === 1 ? signals[0] : AbortSignal.any(signals);
    return this.fetchFn(url, { ...init, ...(merged !== undefined ? { signal: merged } : {}) });
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
    const response = await this.request(
      url,
      {
        method: 'PROPFIND',
        headers: { ...this.headers, Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' },
        body: PROPFIND_BODY,
      },
      signal,
    );
    if (response.status !== 207) {
      await response.body?.cancel();
      throw new WebDAVError('PROPFIND', url, response.status);
    }
    return parseMultiStatus(new TextDecoder().decode(await readBounded(response, this.maxListingBytes, 'listing PROPFIND')));
  }

  /** Chemin relatif (NFC) d'un href de réponse, `''` pour la racine, `null` hors racine. */
  private relativePath(href: string): string | null {
    const decoded = decodePath(new URL(href, this.base).pathname);
    if (!decoded.startsWith(this.basePath) && `${decoded}/` !== this.basePath) return null;
    return decoded.slice(this.basePath.length).replace(/\/+$/, '').normalize('NFC');
  }

  private toEntry(path: string, resource: DavResource, size: number): SnapshotEntry {
    const modified = resource.lastModified !== undefined ? Date.parse(resource.lastModified) : NaN;
    return {
      path,
      kind: classifyPath(path),
      size,
      // Empreinte `x-etag` (§4.4) : l'ETag tel que le serveur le rend, guillemets
      // et marque faible compris — opaque, comparable seulement à lui-même.
      ...(resource.etag !== undefined ? { hashes: { 'x-etag': resource.etag } } : {}),
      ...(Number.isNaN(modified) ? {} : { modifiedAt: new Date(modified).toISOString() }),
    };
  }

  async list(opts: ProviderCallOptions = {}): Promise<ProviderListing> {
    const problems: ListingProblem[] = [];
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
          problems.push({ path: dir, reason: `collection illisible (${(err as Error).message})` });
          return;
        }
        this.knownCollections.add(dir);
        for (const resource of resources) {
          const path = this.relativePath(resource.href);
          if (path === null || path === '' || path === dir) continue;
          if (isExcluded(resource.collection ? `${path}/` : path, this.ignore)) continue;
          if (resource.collection) next.push(path);
          // Sans taille, pas d'entrée fidèle : écartée, et le listing est incomplet.
          else if (resource.size === undefined || !Number.isInteger(resource.size) || resource.size < 0) {
            problems.push({ path, reason: '`getcontentlength` absent ou invalide' });
          } else entries.push(this.toEntry(path, resource, resource.size));
        }
      });
      level = next;
    }

    entries.sort((a, b) => compareCanonical(a.path, b.path));
    problems.sort((a, b) => compareCanonical(a.path, b.path));
    return { entries, complete: problems.length === 0, ...(problems.length > 0 ? { problems } : {}) };
  }

  async read(path: string, opts: ProviderCallOptions = {}): Promise<Uint8Array> {
    const url = this.urlFor(this.checked(path));
    const response = await this.request(url, { method: 'GET', headers: this.headers }, opts.signal);
    if (!response.ok) {
      await response.body?.cancel();
      throw new WebDAVError('GET', url, response.status);
    }
    return readBounded(response, this.maxFileBytes, `fichier « ${path} »`);
  }

  /**
   * Écrit un fichier : collections parentes créées au besoin (`MKCOL`, 405 =
   * déjà là), `PUT`, puis `PROPFIND Depth: 0` pour rendre l'ETag du serveur.
   */
  async write(path: string, bytes: Uint8Array, opts: ProviderCallOptions = {}): Promise<SnapshotEntry> {
    const target = this.checked(path);
    const segments = target.split('/');
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join('/');
      if (this.knownCollections.has(dir)) continue;
      const url = this.urlFor(dir, true);
      const response = await this.request(url, { method: 'MKCOL', headers: this.headers }, opts.signal);
      await response.body?.cancel();
      if (response.status !== 201 && response.status !== 405) throw new WebDAVError('MKCOL', url, response.status);
      this.knownCollections.add(dir);
    }

    const url = this.urlFor(target);
    const put = await this.request(
      url,
      {
        method: 'PUT',
        headers: { ...this.headers, 'Content-Type': 'application/octet-stream' },
        body: bytes as Uint8Array<ArrayBuffer>,
      },
      opts.signal,
    );
    await put.body?.cancel();
    if (!put.ok) throw new WebDAVError('PUT', url, put.status);

    const [resource] = await this.propfind(url, '0', opts.signal);
    if (resource === undefined) throw new WebDAVError('PROPFIND', url, 207);
    return this.toEntry(target, resource, resource.size ?? bytes.length);
  }
}
