/**
 * Types du contrat d'ingestion (spec, « Couche 4 — Ingestion »).
 *
 * Tout ce qui est ici est de la donnée sérialisable : un snapshot écrit par
 * l'implémentation TypeScript doit se relire à l'identique par l'implémentation
 * Swift du CMS, et inversement. Les deux ne partagent aucun code — seulement ce
 * contrat et les fixtures de la spec.
 */

/** Classe d'une entrée (§2.3). */
export type EntryKind = 'content' | 'media' | 'derived' | 'other';

/** Toutes les classes, dans l'ordre de la règle de classification (§2.3). */
export const ENTRY_KINDS = ['derived', 'media', 'content', 'other'] as const satisfies readonly EntryKind[];

/**
 * État de matérialisation d'une entrée (§2.5).
 *
 * `placeholder` : le fichier existe côté provider mais ses octets ne sont pas
 * disponibles localement (iCloud Drive non téléchargé). Une telle entrée bloque
 * la publication (`entry-not-materialized`).
 */
export type EntryState = 'materialized' | 'placeholder';

/**
 * Empreintes d'une entrée : `{ "<algorithme>": "<hex minuscule>" }` (§2.4).
 *
 * Algorithmes enregistrés : `sha256`, `dropbox`. Tout autre est préfixé `x-`
 * (`x-etag`) et n'est comparable qu'à lui-même.
 */
export type HashMap = Readonly<Record<string, string>>;

/** Une entrée de snapshot — un fichier, jamais un dossier (§2.5). */
export interface SnapshotEntry {
  /** Chemin POSIX relatif à la racine du corpus, NFC (§2.1). */
  readonly path: string;
  readonly kind: EntryKind;
  /** Taille en octets. */
  readonly size: number;
  /** Requis sauf `state: "placeholder"`. */
  readonly hashes?: HashMap;
  /** Identifiant stable du provider, qui survit au renommage. Hors `id`. */
  readonly identity?: string;
  /** Informatif, hors `id`. */
  readonly modifiedAt?: string;
  /** Absent = `materialized`. */
  readonly state?: EntryState;
  /** Extensions : un écrivain n'invente de champ que sous le préfixe `x-`. */
  readonly [extension: `x-${string}`]: unknown;
}

/** Provenance d'un snapshot — opaque, hors `id` (§2.5). */
export interface SnapshotSource {
  readonly provider?: string;
  readonly revision?: string;
  readonly root?: string;
  readonly [extension: `x-${string}`]: unknown;
}

/** ContentSnapshot v1 (§2.5). */
export interface ContentSnapshot {
  readonly format: 'hyperfocale.snapshot';
  readonly version: 1;
  /** `sha256:<hex>` calculé (§2.6). */
  readonly id: string;
  /** ISO 8601 UTC, informatif, hors `id`. */
  readonly createdAt: string;
  /** `true` seulement si le listing a abouti sans erreur ni page manquante. */
  readonly complete: boolean;
  readonly source?: SnapshotSource;
  /** Triées dans l'ordre canonique (§2.1), chemins uniques. */
  readonly entries: readonly SnapshotEntry[];
  readonly [extension: `x-${string}`]: unknown;
}

/** Entrée présente des deux côtés dont le contenu a changé (§2.7). */
export interface ModifiedEntry {
  readonly path: string;
  readonly before: SnapshotEntry;
  readonly after: SnapshotEntry;
}

/** Entrée déplacée, par identité ou par contenu (§2.7). */
export interface MovedEntry {
  readonly from: string;
  readonly to: string;
  readonly before: SnapshotEntry;
  readonly after: SnapshotEntry;
  /** Contenu modifié en plus du déplacement (move par identité seulement). */
  readonly modified: boolean;
}

/** ContentChangeSet v1 (§2.7). */
export interface ContentChangeSet {
  readonly format: 'hyperfocale.changeset';
  readonly version: 1;
  readonly base: string | null;
  readonly target: string;
  readonly added: readonly SnapshotEntry[];
  readonly modified: readonly ModifiedEntry[];
  readonly deleted: readonly SnapshotEntry[];
  readonly moved: readonly MovedEntry[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Sévérité d'un diagnostic (§2.10). */
export type Severity = 'error' | 'warning' | 'info';

/** Codes de diagnostic du contrat (§2.10) et de la garde de publication (§2.11). */
export type DiagnosticCode =
  | 'snapshot-version-unsupported'
  | 'snapshot-incomplete'
  | 'snapshot-empty'
  | 'entry-path-invalid'
  | 'entry-path-collision'
  | 'entry-hash-missing'
  | 'entry-not-materialized'
  | 'slug-invalid'
  | 'media-nested'
  | 'media-orphan'
  | 'index-default-missing'
  | 'nesting-too-deep'
  | 'section-has-media'
  | 'frontmatter-missing'
  | 'frontmatter-invalid'
  | 'title-missing'
  | 'date-missing'
  | 'date-invalid'
  | 'type-invalid'
  | 'cover-not-found'
  | 'cover-not-image'
  | 'images-conflict'
  | 'images-json-invalid'
  | 'attachment-not-found'
  | 'embed-url-missing'
  | 'hash-incomparable'
  | 'move-ambiguous'
  | 'guard-snapshot-incomplete'
  | 'guard-snapshot-empty'
  | 'guard-mass-deletion'
  | 'guard-mass-move'
  | 'guard-private-exposed'
  | 'guard-oversize';

/**
 * Diagnostic (§2.10). Les fixtures comparent `code` + `severity` + `path`,
 * jamais `message` : le texte est libre et peut changer sans rompre le contrat.
 */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  /** Absent pour un diagnostic qui porte sur le snapshot entier. */
  readonly path?: string;
  readonly message: string;
  /** Règle de la spec invoquée (`§1.2`). */
  readonly rule?: string;
}

/**
 * Capacités déclarées d'un provider (§2.8).
 *
 * Le pipeline ne DOIT jamais supposer une capacité absente : pas de webhook →
 * réconciliation périodique ; pas d'incrémental → listing complet.
 */
export interface ProviderCapabilities {
  readonly localRead: boolean;
  readonly localWrite: boolean;
  readonly remoteRead: boolean;
  readonly remoteWrite: boolean;
  readonly incrementalChanges: boolean;
  readonly stableIdentity: boolean;
  readonly serverWebhook: boolean;
  readonly clientChangeObservation: boolean;
  readonly materializationAware: boolean;
  readonly hashAlgorithms: readonly string[];
}

/** Résultat d'un listing complet d'un provider. */
export interface ProviderListing {
  readonly entries: readonly SnapshotEntry[];
  /** `false` dès qu'une erreur ou une page manquante a été rencontrée. */
  readonly complete: boolean;
  /** Point de reprise pour `changes()`, si le provider est incrémental. */
  readonly cursor?: string;
  /** Révision opaque de la source. */
  readonly revision?: string;
}

/**
 * Changements depuis un curseur.
 *
 * `deletions` : un chemin supprimé emporte lui-même **et tous ses descendants**.
 * `reset` : le curseur a expiré — seul un `list()` complet est interprétable,
 * jamais « tout a été supprimé ».
 */
export interface ProviderDelta {
  readonly upserts: readonly SnapshotEntry[];
  readonly deletions: readonly string[];
  readonly cursor: string;
  readonly reset?: boolean;
}

/** Options communes aux appels réseau d'un provider. */
export interface ProviderCallOptions {
  readonly signal?: AbortSignal;
}

/**
 * Contrat d'un provider de contenu (§3.2 de la conception).
 *
 * Le provider alimente un snapshot filesystem : il ne remplace jamais le
 * Content Layer d'Astro, et aucune requête visiteur ne le contacte.
 */
export interface ContentProvider {
  readonly type: string;
  readonly capabilities: ProviderCapabilities;
  /** Listing complet. */
  list(opts?: ProviderCallOptions): Promise<ProviderListing>;
  /** Si `capabilities.incrementalChanges`. */
  changes?(cursor: string, opts?: ProviderCallOptions): Promise<ProviderDelta>;
  latestCursor?(opts?: ProviderCallOptions): Promise<string>;
  read(path: string, opts?: ProviderCallOptions): Promise<Uint8Array>;
  /** Si `capabilities.remoteWrite` ou `localWrite`. */
  write?(path: string, bytes: Uint8Array, opts?: ProviderCallOptions): Promise<SnapshotEntry>;
  remove?(path: string, opts?: ProviderCallOptions): Promise<void>;
  move?(from: string, to: string, opts?: ProviderCallOptions): Promise<void>;
}

/** Vocabulaire des états de publication (§2.9). */
export const PUBLICATION_STATES = [
  'sourceDirty',
  'sourceSynced',
  'snapshotPending',
  'validating',
  'publishing',
  'published',
  'failed',
  'conflict',
] as const;

/** État de publication (§2.9). */
export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** Enregistrement d'état de publication (§2.9). */
export interface PublicationRecord {
  readonly format: 'hyperfocale.publication';
  readonly version: 1;
  readonly state: PublicationState;
  readonly sourceProvider?: string;
  readonly sourceRevision?: string;
  /** `sha256:…` du snapshot concerné. */
  readonly snapshot?: string;
  /** Défini par le consumer (commit git, par exemple). */
  readonly publishedRevision?: string;
  readonly updatedAt: string;
  readonly error?: { readonly code: string; readonly message: string };
}

/** Lecture des octets d'une entrée par son chemin. */
export type ReadFn = (path: string) => Promise<Uint8Array | string>;
