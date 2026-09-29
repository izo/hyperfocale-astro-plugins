import { computeSnapshotId } from './hash.js';
import type { ContentProvider } from './types.js';

/** Options de `waitForQuiescence`. */
export interface QuiescenceOptions {
  /** Curseur de départ ; défaut : `provider.latestCursor()`. Ignoré sans incrémental. */
  readonly cursor?: string;
  /** Durée sans changement qui vaut repos. */
  readonly quietMs: number;
  /** Attente maximale ; au-delà, on rend la main sans repos constaté. */
  readonly maxMs: number;
  /** Intervalle entre deux observations. Défaut : `min(quietMs, 5000)`. */
  readonly intervalMs?: number;
  /** Injectables pour les tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
}

/** Issue de `waitForQuiescence`. */
export interface QuiescenceResult {
  /** `true` : aucun changement pendant `quietMs`. `false` : `maxMs` atteint avant. */
  readonly settled: boolean;
  /** Dernier curseur observé (provider incrémental). */
  readonly cursor?: string;
  readonly waitedMs: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Attend que la source se taise : aucun changement pendant `quietMs`, dans la
 * limite de `maxMs`. Sert à ne pas figer un snapshot au milieu d'un dépôt de
 * fichiers encore en cours.
 *
 * Provider incrémental : on suit `changes(cursor)`. Un curseur expiré (`reset`)
 * compte comme un changement et repart d'un curseur frais. Provider sans
 * incrémental : on compare l'empreinte (`computeSnapshotId`) de listings
 * successifs — une capacité absente n'est jamais supposée (§2.8).
 */
export async function waitForQuiescence(
  provider: ContentProvider,
  options: QuiescenceOptions,
): Promise<QuiescenceResult> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const interval = options.intervalMs ?? Math.min(options.quietMs, 5000);
  const call = options.signal !== undefined ? { signal: options.signal } : {};
  const start = now();
  let lastChange = start;

  const incremental = provider.capabilities.incrementalChanges && provider.changes !== undefined;
  let cursor: string | undefined;
  let fingerprint: string | undefined;
  if (incremental) {
    cursor = options.cursor ?? (await provider.latestCursor?.(call));
    if (cursor === undefined) throw new Error('[hyperfocale] waitForQuiescence : aucun curseur de départ.');
  } else {
    fingerprint = await computeSnapshotId((await provider.list(call)).entries);
  }

  for (;;) {
    options.signal?.throwIfAborted();
    await sleep(interval);

    let changed: boolean;
    if (incremental) {
      const delta = await (provider.changes as NonNullable<ContentProvider['changes']>)(cursor as string, call);
      if (delta.reset === true) {
        changed = true;
        cursor = await provider.latestCursor?.(call);
      } else {
        changed = delta.upserts.length > 0 || delta.deletions.length > 0;
        cursor = delta.cursor;
      }
    } else {
      const next = await computeSnapshotId((await provider.list(call)).entries);
      changed = next !== fingerprint;
      fingerprint = next;
    }

    const t = now();
    if (changed) lastChange = t;
    const result = (settled: boolean): QuiescenceResult => ({
      settled,
      ...(cursor !== undefined ? { cursor } : {}),
      waitedMs: t - start,
    });
    if (t - lastChange >= options.quietMs) return result(true);
    if (t - start >= options.maxMs) return result(false);
  }
}
