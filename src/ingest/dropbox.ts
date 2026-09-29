/**
 * `@regrets/hyperfocale/ingest/dropbox` — client et provider Dropbox (API v2).
 *
 * `fetch` et WebCrypto seulement : importable dans un Worker, pour le webhook
 * (`verifyDropboxSignature`, `dropboxChallenge`). Le Worker ne lit jamais
 * Dropbox pour servir un visiteur — il déclenche l'ingestion, rien de plus.
 */

import { abortableSleep } from './concurrency.js';
import { toHex, utf8 } from './hash.js';
import { classifyPath, collisionKey, compareCanonical, isExcluded } from './paths.js';
import type { ExclusionRule } from './paths.js';
import { CursorResetError } from './snapshot.js';
import type {
  ContentProvider,
  ProviderCallOptions,
  ProviderCapabilities,
  ProviderDelta,
  ProviderListing,
  SnapshotEntry,
} from './types.js';

const API = 'https://api.dropboxapi.com';
const CONTENT = 'https://content.dropboxapi.com';

/** Au-delà, `files/upload` est refusé par Dropbox : upload par session. */
export const DROPBOX_SIMPLE_UPLOAD_LIMIT = 150 * 1024 * 1024;

/** Métadonnées de fichier (`FileMetadata`). */
export interface DropboxFileMetadata {
  readonly '.tag': 'file';
  readonly name: string;
  readonly id: string;
  readonly path_lower?: string;
  readonly path_display?: string;
  readonly size: number;
  readonly content_hash?: string;
  readonly server_modified?: string;
  readonly client_modified?: string;
  readonly rev?: string;
  readonly is_downloadable?: boolean;
}

/** Métadonnées de dossier (`FolderMetadata`). */
export interface DropboxFolderMetadata {
  readonly '.tag': 'folder';
  readonly name: string;
  readonly id: string;
  readonly path_lower?: string;
  readonly path_display?: string;
}

/** Entrée supprimée (`DeletedMetadata`) — n'apparaît que dans un delta. */
export interface DropboxDeletedMetadata {
  readonly '.tag': 'deleted';
  readonly name: string;
  readonly path_lower?: string;
  readonly path_display?: string;
}

export type DropboxMetadata = DropboxFileMetadata | DropboxFolderMetadata | DropboxDeletedMetadata;

/** Page ou listing complet de `files/list_folder`. */
export interface DropboxListResult {
  readonly entries: DropboxMetadata[];
  readonly cursor: string;
}

/** Une page de `list_folder` ou de `list_folder/continue`. */
interface ListPage {
  readonly entries: DropboxMetadata[];
  readonly cursor: string;
  readonly has_more: boolean;
}

/**
 * Erreur renvoyée par l'API Dropbox. Ne porte jamais le corps brut de la
 * réponse — il peut contenir un jeton renvoyé par un intermédiaire, et une
 * erreur finit dans des journaux de CI.
 */
export class DropboxApiError extends Error {
  readonly status: number;
  /**
   * `error_summary` de Dropbox (`path/not_found/..`), ou `error` d'une erreur
   * OAuth (`invalid_grant`), tronqué à 500 caractères ; `HTTP <status>` à défaut.
   */
  readonly summary: string;
  /** `error['.tag']`, quand l'erreur est structurée. */
  readonly tag?: string;

  constructor(endpoint: string, status: number, summary: string, tag?: string) {
    super(`[hyperfocale] Dropbox ${endpoint} : ${status} ${summary}`);
    this.name = 'DropboxApiError';
    this.status = status;
    this.summary = summary;
    if (tag !== undefined) this.tag = tag;
  }
}

/**
 * Dropbox demande d'attendre plus longtemps que `maxRetryWait` : on rend la main
 * plutôt que de bloquer un pipeline des heures durant.
 */
export class DropboxRateLimitError extends Error {
  readonly status: number;
  /** Attente demandée par `Retry-After`, en millisecondes. */
  readonly retryAfterMs: number;

  constructor(status: number, retryAfterMs: number, maxWaitMs: number) {
    super(`[hyperfocale] Dropbox : ${status}, Retry-After de ${Math.ceil(retryAfterMs / 1000)} s au-delà du plafond de ${Math.ceil(maxWaitMs / 1000)} s.`);
    this.name = 'DropboxRateLimitError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Options du `DropboxClient`. */
export interface DropboxClientOptions {
  /** Jeton d'accès courant ; facultatif si un refresh token est fourni. */
  readonly accessToken?: string;
  readonly refreshToken?: string;
  /** Clé de l'app (`client_id`), requise pour rafraîchir. */
  readonly appKey?: string;
  /** Secret de l'app. Absent : rafraîchissement PKCE, sans secret. */
  readonly appSecret?: string;
  /** Défaut : `globalThis.fetch`. */
  readonly fetch?: typeof fetch;
  /** Tentatives supplémentaires sur 429 / 5xx. Défaut 5. */
  readonly maxRetries?: number;
  /**
   * Attente maximale avant une nouvelle tentative, en millisecondes. Un
   * `Retry-After` plus long lève `DropboxRateLimitError`. Défaut 60 000.
   */
  readonly maxRetryWait?: number;
  /** Attente entre deux tentatives ; doit s'interrompre sur `signal`. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly now?: () => number;
  /** Seuil de bascule vers l'upload par session. Défaut 150 Mio. */
  readonly uploadSessionThreshold?: number;
  /** Taille des morceaux d'une session d'upload. Défaut 8 Mio. */
  readonly uploadChunkSize?: number;
}

/** Arguments d'un listing (`list_folder`, `get_latest_cursor`). */
export interface DropboxListOptions extends ProviderCallOptions {
  readonly recursive?: boolean;
}

/** Mode d'écriture d'un upload. */
export type DropboxWriteMode = 'add' | 'overwrite';

/**
 * Sérialise l'argument d'en-tête `Dropbox-API-Arg` : un en-tête HTTP est ASCII,
 * Dropbox exige donc l'échappement `\uXXXX` de tout caractère ≥ U+007F — un
 * chemin accentué casserait la requête sinon.
 */
function headerArg(arg: unknown): string {
  return JSON.stringify(arg).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Délai d'un en-tête `Retry-After` (secondes ou date HTTP), en millisecondes. */
function retryAfterMs(response: Response, now: number): number | null {
  const value = response.headers.get('Retry-After');
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * Client minimal de l'API Dropbox v2 : ce dont l'ingestion a besoin, rien de
 * plus.
 *
 * - Rafraîchissement OAuth avant expiration, avec ou sans secret (PKCE), et une
 *   fois sur un 401 ; un échec de rafraîchissement lève — jamais d'appel
 *   silencieux avec un jeton périmé.
 * - Nouvelle tentative sur 429 et 5xx, en respectant `Retry-After` jusqu'à
 *   `maxRetryWait` (une minute par défaut, au-delà `DropboxRateLimitError`),
 *   sinon backoff exponentiel plafonné au même seuil. L'attente s'interrompt
 *   dès que le `signal` de l'appel est levé.
 * - Curseur expiré sur `list_folder/continue` : `CursorResetError`.
 */
export class DropboxClient {
  private accessToken: string | undefined;
  private expiresAt = 0;
  private readonly refreshToken: string | undefined;
  private readonly appKey: string | undefined;
  private readonly appSecret: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly maxRetryWait: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly now: () => number;
  private readonly sessionThreshold: number;
  private readonly chunkSize: number;

  constructor(options: DropboxClientOptions) {
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.appKey = options.appKey;
    this.appSecret = options.appSecret;
    this.fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.maxRetries = options.maxRetries ?? 5;
    this.maxRetryWait = options.maxRetryWait ?? 60_000;
    this.sleep = options.sleep ?? abortableSleep;
    this.now = options.now ?? Date.now;
    this.sessionThreshold = options.uploadSessionThreshold ?? DROPBOX_SIMPLE_UPLOAD_LIMIT;
    this.chunkSize = options.uploadChunkSize ?? 8 * 1024 * 1024;
  }

  private get canRefresh(): boolean {
    return this.refreshToken !== undefined && this.appKey !== undefined;
  }

  /** Obtient un nouveau jeton d'accès depuis le refresh token. */
  async refreshAccessToken(signal?: AbortSignal): Promise<string> {
    if (!this.canRefresh) throw new Error('[hyperfocale] Dropbox : refresh token et clé d\'app requis pour rafraîchir.');
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken as string,
      client_id: this.appKey as string,
    });
    if (this.appSecret !== undefined) form.set('client_secret', this.appSecret);
    const response = await this.withRetry(
      () =>
        this.fetchFn(`${API}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
          ...(signal !== undefined ? { signal } : {}),
        }),
      signal,
    );
    if (!response.ok) throw await this.apiError('oauth2/token', response);
    const data = (await response.json()) as { access_token: string; expires_in?: number };
    this.accessToken = data.access_token;
    this.expiresAt = data.expires_in !== undefined ? this.now() + data.expires_in * 1000 : 0;
    return data.access_token;
  }

  private async token(signal?: AbortSignal): Promise<string> {
    const expiring = this.expiresAt !== 0 && this.now() > this.expiresAt - 60_000;
    if (this.canRefresh && (this.accessToken === undefined || expiring)) return this.refreshAccessToken(signal);
    if (this.accessToken === undefined) throw new Error('[hyperfocale] Dropbox : aucun jeton d\'accès.');
    return this.accessToken;
  }

  /** Répète une requête sur 429 / 5xx. */
  private async withRetry(send: () => Promise<Response>, signal?: AbortSignal): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const response = await send();
      if ((response.status !== 429 && response.status < 500) || attempt >= this.maxRetries) return response;
      const requested = retryAfterMs(response, this.now());
      await response.body?.cancel();
      if (requested !== null && requested > this.maxRetryWait) {
        throw new DropboxRateLimitError(response.status, requested, this.maxRetryWait);
      }
      signal?.throwIfAborted();
      await this.sleep(requested ?? Math.min(1000 * 2 ** attempt, this.maxRetryWait), signal);
    }
  }

  /** Requête authentifiée : retry 429/5xx, un rafraîchissement sur 401. */
  private async send(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const attempt = async () => {
      const token = await this.token(signal);
      return this.withRetry(
        () =>
          this.fetchFn(url, {
            ...init,
            headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
            ...(signal !== undefined ? { signal } : {}),
          }),
        signal,
      );
    };
    const response = await attempt();
    if (response.status !== 401 || !this.canRefresh) return response;
    await response.body?.cancel();
    await this.refreshAccessToken(signal);
    return attempt();
  }

  private async apiError(endpoint: string, response: Response): Promise<DropboxApiError> {
    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch {
      body = null;
    }
    const record = (value: unknown): Record<string, unknown> | null =>
      typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    const fields = record(body);
    const error = fields?.error;
    const summary =
      typeof fields?.error_summary === 'string' ? fields.error_summary : typeof error === 'string' ? error : null;
    const tag = record(error)?.['.tag'];
    return new DropboxApiError(
      endpoint,
      response.status,
      summary === null ? `HTTP ${response.status}` : summary.slice(0, 500),
      typeof tag === 'string' ? tag.slice(0, 100) : undefined,
    );
  }

  /** Appel RPC JSON sur `api.dropboxapi.com/2/<endpoint>`. */
  async rpc<T>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.send(
      `${API}/2/${endpoint}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      signal,
    );
    if (!response.ok) {
      const error = await this.apiError(endpoint, response);
      if (endpoint === 'files/list_folder/continue' && response.status === 409 && error.tag === 'reset') {
        throw new CursorResetError(`curseur Dropbox expiré (${error.summary}) — un listing complet est requis.`);
      }
      throw error;
    }
    return (await response.json()) as T;
  }

  private listArgs(path: string, options: DropboxListOptions) {
    return {
      path,
      recursive: options.recursive ?? false,
      include_deleted: false,
      include_non_downloadable_files: false,
      include_mounted_folders: true,
      limit: 2000,
    };
  }

  /** Suit les pages de `list_folder/continue` à partir d'une première page. */
  private async paginate(first: ListPage, signal?: AbortSignal): Promise<DropboxListResult> {
    const entries = [...first.entries];
    let page = first;
    while (page.has_more) {
      page = await this.rpc<ListPage>('files/list_folder/continue', { cursor: page.cursor }, signal);
      entries.push(...page.entries);
    }
    return { entries, cursor: page.cursor };
  }

  /** Listing complet d'un dossier, toutes pages suivies. */
  async listFolder(path: string, options: DropboxListOptions = {}): Promise<DropboxListResult> {
    const first = await this.rpc<ListPage>('files/list_folder', this.listArgs(path, options), options.signal);
    return this.paginate(first, options.signal);
  }

  /**
   * Changements depuis un curseur, toutes pages suivies.
   * @throws {CursorResetError} curseur expiré
   */
  async listFolderContinue(cursor: string, options: ProviderCallOptions = {}): Promise<DropboxListResult> {
    return this.paginate({ entries: [], cursor, has_more: true }, options.signal);
  }

  /** Curseur de l'état courant, sans lister (mêmes arguments que `listFolder`). */
  async getLatestCursor(path: string, options: DropboxListOptions = {}): Promise<string> {
    const result = await this.rpc<{ cursor: string }>(
      'files/list_folder/get_latest_cursor',
      this.listArgs(path, options),
      options.signal,
    );
    return result.cursor;
  }

  /** Télécharge un fichier. */
  async download(path: string, options: ProviderCallOptions = {}): Promise<{ bytes: Uint8Array; metadata?: DropboxFileMetadata }> {
    const response = await this.send(
      `${CONTENT}/2/files/download`,
      { method: 'POST', headers: { 'Dropbox-API-Arg': headerArg({ path }) } },
      options.signal,
    );
    if (!response.ok) throw await this.apiError('files/download', response);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const result = response.headers.get('Dropbox-API-Result');
    return result === null ? { bytes } : { bytes, metadata: JSON.parse(result) as DropboxFileMetadata };
  }

  private async content<T>(endpoint: string, arg: unknown, body: Uint8Array, signal?: AbortSignal): Promise<T> {
    const response = await this.send(
      `${CONTENT}/2/${endpoint}`,
      {
        method: 'POST',
        headers: { 'Dropbox-API-Arg': headerArg(arg), 'Content-Type': 'application/octet-stream' },
        body: body as Uint8Array<ArrayBuffer>,
      },
      signal,
    );
    if (!response.ok) throw await this.apiError(endpoint, response);
    const text = await response.text();
    return (text === '' ? null : JSON.parse(text)) as T;
  }

  /**
   * Téléverse un fichier : `files/upload` jusqu'à 150 Mio, session d'upload
   * au-delà (`start` → `append_v2` → `finish`).
   */
  async upload(
    path: string,
    bytes: Uint8Array,
    options: ProviderCallOptions & { mode?: DropboxWriteMode } = {},
  ): Promise<DropboxFileMetadata> {
    const commit = { path, mode: options.mode ?? 'overwrite', autorename: false, mute: true };
    const { signal } = options;
    if (bytes.length <= this.sessionThreshold) {
      return this.content<DropboxFileMetadata>('files/upload', commit, bytes, signal);
    }
    let offset = Math.min(this.chunkSize, bytes.length);
    const { session_id } = await this.content<{ session_id: string }>(
      'files/upload_session/start',
      { close: false },
      bytes.subarray(0, offset),
      signal,
    );
    while (bytes.length - offset > this.chunkSize) {
      const end = offset + this.chunkSize;
      await this.content('files/upload_session/append_v2', { cursor: { session_id, offset }, close: false }, bytes.subarray(offset, end), signal);
      offset = end;
    }
    return this.content<DropboxFileMetadata>(
      'files/upload_session/finish',
      { cursor: { session_id, offset }, commit },
      bytes.subarray(offset),
      signal,
    );
  }
}

/** Options du `DropboxProvider`. */
export interface DropboxProviderOptions {
  readonly client: DropboxClient;
  /** Dossier Dropbox racine du corpus (`/MDR Content`) ; `''` = tout le Dropbox. */
  readonly root: string;
  /** Exclusions du consumer, en plus de celles du contrat (§4.2). */
  readonly ignore?: readonly ExclusionRule[];
}

/** Racine normalisée : `/A/B`, ou `''` pour la racine du Dropbox. */
function normalizeRoot(root: string): string {
  const trimmed = root.replace(/\/+$/, '');
  if (trimmed === '') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Provider Dropbox.
 *
 * Chemins relatifs à `root`, NFC. La casse des dossiers est reconstruite depuis
 * les entrées dossier du listing : Dropbox ne garantit la casse de
 * `path_display` que sur le dernier segment, et `name` est fiable pour chaque
 * dossier. `identity` = `id` Dropbox (survit au renommage), empreinte
 * `dropbox` = `content_hash`.
 *
 * Un listing qui échoue lève : Dropbox ne rend pas de listing partiel, et une
 * erreur n'est jamais lue comme une absence de fichiers.
 */
export class DropboxProvider implements ContentProvider {
  readonly type = 'dropbox';
  readonly capabilities: ProviderCapabilities = {
    localRead: false,
    localWrite: false,
    remoteRead: true,
    remoteWrite: true,
    incrementalChanges: true,
    stableIdentity: true,
    serverWebhook: true,
    clientChangeObservation: false,
    materializationAware: false,
    hashAlgorithms: ['dropbox'],
  };
  private readonly client: DropboxClient;
  private readonly root: string;
  private readonly rootDepth: number;
  private readonly ignore: readonly ExclusionRule[];
  /** Nom réel de chaque dossier connu, par chemin relatif en minuscules. */
  private readonly folderNames = new Map<string, string>();

  constructor(options: DropboxProviderOptions) {
    this.client = options.client;
    this.root = normalizeRoot(options.root);
    this.rootDepth = this.root === '' ? 0 : this.root.split('/').length - 1;
    this.ignore = options.ignore ?? [];
  }

  /** Chemin Dropbox absolu d'un chemin relatif du corpus. */
  private absolute(path: string): string {
    return `${this.root}/${path}`;
  }

  /** Chemin relatif en minuscules, ou `null` hors racine / racine elle-même. */
  private relativeLower(meta: DropboxMetadata): string | null {
    const lower = (meta.path_lower ?? '').normalize('NFC');
    const rootLower = this.root.normalize('NFC').toLowerCase();
    if (!lower.startsWith(`${rootLower}/`)) return null;
    return lower.slice(rootLower.length + 1);
  }

  /** Chemin relatif avec la casse reconstruite. */
  private relativePath(meta: DropboxMetadata, relLower: string): string {
    const lowerSegments = relLower.split('/');
    const displaySegments = (meta.path_display ?? '').split('/').slice(1 + this.rootDepth);
    const segments = lowerSegments.map((_, i) => {
      if (i === lowerSegments.length - 1) return meta.name;
      return this.folderNames.get(lowerSegments.slice(0, i + 1).join('/')) ?? displaySegments[i] ?? lowerSegments[i];
    });
    return segments.join('/').normalize('NFC');
  }

  private toEntry(meta: DropboxFileMetadata, path: string): SnapshotEntry {
    return {
      path,
      kind: classifyPath(path),
      size: meta.size,
      ...(meta.content_hash !== undefined ? { hashes: { dropbox: meta.content_hash } } : {}),
      identity: meta.id,
      ...(meta.server_modified !== undefined ? { modifiedAt: meta.server_modified } : {}),
    };
  }

  private rememberFolders(entries: readonly DropboxMetadata[]): void {
    for (const meta of entries) {
      if (meta['.tag'] !== 'folder') continue;
      const relLower = this.relativeLower(meta);
      if (relLower !== null) this.folderNames.set(relLower, meta.name.normalize('NFC'));
    }
  }

  async list(opts: ProviderCallOptions = {}): Promise<ProviderListing> {
    const result = await this.client.listFolder(this.root, { recursive: true, ...opts });
    this.folderNames.clear();
    this.rememberFolders(result.entries);

    const entries: SnapshotEntry[] = [];
    for (const meta of result.entries) {
      if (meta['.tag'] !== 'file' || meta.is_downloadable === false) continue;
      const relLower = this.relativeLower(meta);
      if (relLower === null) continue;
      const path = this.relativePath(meta, relLower);
      if (!isExcluded(path, this.ignore)) entries.push(this.toEntry(meta, path));
    }
    entries.sort((a, b) => compareCanonical(a.path, b.path));
    return { entries, complete: true, cursor: result.cursor, revision: result.cursor };
  }

  /**
   * Changements depuis `cursor`, repliés dans l'ordre de Dropbox : une
   * suppression efface les upserts antérieurs qu'elle couvre, si bien que
   * « suppressions puis upserts » (`applyDelta`) reproduit la séquence réelle.
   * Curseur expiré : delta `reset`, que `applyDelta` refuse d'interpréter.
   */
  async changes(cursor: string, opts: ProviderCallOptions = {}): Promise<ProviderDelta> {
    let result: DropboxListResult;
    try {
      result = await this.client.listFolderContinue(cursor, opts);
    } catch (err) {
      if (err instanceof CursorResetError) return { upserts: [], deletions: [], cursor, reset: true };
      throw err;
    }
    this.rememberFolders(result.entries);

    const upserts = new Map<string, SnapshotEntry>();
    const deletions = new Map<string, string>();
    for (const meta of result.entries) {
      const relLower = this.relativeLower(meta);
      if (relLower === null) continue;
      const path = this.relativePath(meta, relLower);
      if (isExcluded(path, this.ignore)) continue;
      const key = collisionKey(path);
      if (meta['.tag'] === 'deleted') {
        for (const existing of [...upserts.keys()]) {
          if (existing === key || existing.startsWith(`${key}/`)) upserts.delete(existing);
        }
        deletions.set(key, path);
        this.folderNames.delete(relLower);
      } else if (meta['.tag'] === 'file' && meta.is_downloadable !== false) {
        upserts.set(key, this.toEntry(meta, path));
      }
    }
    return { upserts: [...upserts.values()], deletions: [...deletions.values()], cursor: result.cursor };
  }

  async latestCursor(opts: ProviderCallOptions = {}): Promise<string> {
    return this.client.getLatestCursor(this.root, { recursive: true, ...opts });
  }

  async read(path: string, opts: ProviderCallOptions = {}): Promise<Uint8Array> {
    return (await this.client.download(this.absolute(path), opts)).bytes;
  }

  async write(path: string, bytes: Uint8Array, opts: ProviderCallOptions = {}): Promise<SnapshotEntry> {
    const meta = await this.client.upload(this.absolute(path), bytes, opts);
    return this.toEntry(meta, path);
  }
}

/** Comparaison à temps constant de deux chaînes de même alphabet. */
function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Vérifie la signature d'une notification webhook Dropbox : l'en-tête
 * `X-Dropbox-Signature` porte le HMAC-SHA256 hexadécimal du corps brut, clé =
 * secret de l'app. Comparaison à temps constant. Passer le corps **brut** —
 * un JSON reparsé puis resérialisé ne signe plus pareil.
 */
export async function verifyDropboxSignature(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  appSecret: string,
): Promise<boolean> {
  if (signatureHeader === null || signatureHeader === undefined || signatureHeader === '' || appSecret === '') {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', utf8(appSecret) as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = typeof rawBody === 'string' ? utf8(rawBody) : rawBody;
  const expected = toHex(await crypto.subtle.sign('HMAC', key, body as Uint8Array<ArrayBuffer>));
  return timingSafeEqual(expected, signatureHeader.trim().toLowerCase());
}

/**
 * Réponse à la vérification d'un webhook Dropbox (`GET ?challenge=…`) : le
 * challenge renvoyé tel quel, en texte brut et `nosniff` — Dropbox le
 * recommande pour qu'un challenge forgé ne s'exécute pas dans un navigateur.
 * 400 sans challenge.
 */
export function dropboxChallenge(url: string | URL): Response {
  const challenge = new URL(url).searchParams.get('challenge');
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
  if (challenge === null || challenge === '') return new Response('challenge manquant', { status: 400, headers });
  return new Response(challenge, { status: 200, headers });
}
