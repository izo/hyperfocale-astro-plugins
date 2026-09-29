/**
 * `@regrets/hyperfocale/ingest` — contrat d'ingestion (spec, « Couche 4 »).
 *
 * Agnostique du runtime : WebCrypto et `fetch`, aucun module `node:*`. S'importe
 * aussi bien dans un script Node que dans un Worker. N'est jamais chargé par
 * l'intégration Astro : un provider alimente un dossier, et c'est ce dossier
 * que lit le Content Layer.
 */

export type {
  ContentChangeSet,
  ContentProvider,
  ContentSnapshot,
  Diagnostic,
  DiagnosticCode,
  EntryKind,
  EntryState,
  HashMap,
  ModifiedEntry,
  MovedEntry,
  ProviderCallOptions,
  ProviderCapabilities,
  ProviderDelta,
  ProviderListing,
  PublicationRecord,
  PublicationState,
  ReadFn,
  Severity,
  SnapshotEntry,
  SnapshotSource,
} from './types.js';
export { ENTRY_KINDS, PUBLICATION_STATES } from './types.js';
export { isPublicationTransition } from './publication.js';

export {
  classifyPath,
  collisionKey,
  compareCanonical,
  isExcluded,
  isImagePath,
  isIndexFile,
  normalizePath,
} from './paths.js';
export type { ExclusionRule, NormalizedPath } from './paths.js';

export {
  DROPBOX_BLOCK_SIZE,
  commonHashAlgorithm,
  compareEntryContent,
  computeSnapshotId,
  dropboxContentHash,
  sha256Hex,
  toHex,
  verifyEntryBytes,
} from './hash.js';
export type { ContentComparison } from './hash.js';

export { CursorResetError, SnapshotFormatError, applyDelta, createSnapshot, parseSnapshot } from './snapshot.js';
export type { CreateSnapshotOptions, SnapshotFormatErrorCode } from './snapshot.js';

export { diffSnapshots } from './diff.js';
export { validateSnapshot } from './validate.js';
export type { ValidateSnapshotOptions, ValidationRoot } from './validate.js';
export { guardChangeSet } from './guard.js';
export type { GuardOptions, GuardPolicy, GuardSide } from './guard.js';
export { summarizeChangeSet } from './summary.js';
export type { ChangeSetSummary, MovedSeries } from './summary.js';
export { buildImagesManifest } from './manifest.js';
export type { BuildImagesManifestOptions, ImagesManifest } from './manifest.js';
export { waitForQuiescence } from './quiescence.js';
export type { QuiescenceOptions, QuiescenceResult } from './quiescence.js';
export { parseFrontmatter } from './frontmatter.js';
export type { FrontmatterResult } from './frontmatter.js';
