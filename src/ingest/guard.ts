import { MAX_READ_BYTES } from './bounds.js';
import { mapConcurrent } from './concurrency.js';
import { finalizeDiagnostics } from './diff.js';
import { parseFrontmatter } from './frontmatter.js';
import { verifyEntryBytes } from './hash.js';
import { basename, compareCanonical, dirname, isIndexFile, isOriginalEntry } from './paths.js';
import { indexFolders } from './series.js';
import { countKind } from './snapshot.js';
import { ENTRY_KINDS } from './types.js';
import type { ContentChangeSet, ContentSnapshot, Diagnostic, EntryKind, SnapshotEntry } from './types.js';

/**
 * Seuils de la garde de publication (§4.11), tous facultatifs. Le mécanisme
 * est générique, les seuils appartiennent au consumer. Un seuil **absent**
 * prend sa valeur par défaut (`DEFAULT_GUARD_POLICY`) ; le consumer le
 * désactive explicitement en le déclarant `null`.
 */
export interface GuardPolicy {
  /** Au-delà de ce nombre de séries supprimées : `guard-mass-deletion`. Défaut 10. */
  readonly maxDeletedSeries?: number | null;
  /** Au-delà de cette fraction (0–1) des médias de base supprimés : `guard-mass-deletion`. Défaut 0,25. */
  readonly maxDeletedMediaRatio?: number | null;
  /** Au-delà de ce nombre de séries déplacées : `guard-mass-move` (warning). Défaut 10. */
  readonly maxMovedSeries?: number | null;
  /**
   * Taille maximale par classe d'entrée, en octets : `guard-oversize`. Défaut
   * 1 Mio pour `content` et `derived`, aucun plafond pour `media` et `other`.
   * Chaque classe se désactive à part (`{ content: null }`), ou toutes à la
   * fois (`maxFileBytes: null`).
   */
  readonly maxFileBytes?: Partial<Record<EntryKind, number | null>> | null;
}

/** Seuils effectifs de la garde : aucune valeur absente, `null` pour un contrôle inactif. */
export interface ResolvedGuardPolicy {
  readonly maxDeletedSeries: number | null;
  readonly maxDeletedMediaRatio: number | null;
  readonly maxMovedSeries: number | null;
  readonly maxFileBytes: Readonly<Record<EntryKind, number | null>>;
}

/**
 * Seuils appliqués quand la politique n'en dit rien (§4.11, v2.17) : les
 * défauts bornent le cas où personne n'a rien configuré, pour qu'un runner non
 * surveillé ne publie pas sans limite. `content` et `derived` reprennent la
 * borne de lecture (§1.12) ; le poids d'un média dépend de l'usage.
 */
export const DEFAULT_GUARD_POLICY: ResolvedGuardPolicy = Object.freeze({
  maxDeletedSeries: 10,
  maxDeletedMediaRatio: 0.25,
  maxMovedSeries: 10,
  maxFileBytes: Object.freeze({ content: MAX_READ_BYTES, media: null, derived: MAX_READ_BYTES, other: null }),
});

function threshold(name: string, value: unknown, fallback: number | null, max = Infinity): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'number' || !(value >= 0 && value <= max)) {
    const range = max === 1 ? 'un nombre entre 0 et 1' : 'un nombre positif ou nul';
    throw new TypeError(`Politique de garde : ${name} doit être ${range}, ou null pour désactiver (reçu ${String(value)}).`);
  }
  return value;
}

/**
 * Seuils effectifs d'une politique (§4.11) : absent → défaut, `null` →
 * désactivé. Une valeur qui n'est ni l'un ni l'autre (`false`, `NaN`, négatif,
 * chaîne, ratio hors de 0–1) lève une `TypeError` : une faute de frappe ne
 * doit pas désactiver un contrôle en silence, et un runner qui s'arrête ne
 * publie rien.
 */
export function resolveGuardPolicy(policy: GuardPolicy = {}): ResolvedGuardPolicy {
  const { maxFileBytes } = policy;
  if (maxFileBytes !== undefined && maxFileBytes !== null && (typeof maxFileBytes !== 'object' || Array.isArray(maxFileBytes))) {
    throw new TypeError('Politique de garde : maxFileBytes doit être un objet { <classe>: octets }, ou null pour tout désactiver.');
  }
  const limits = Object.fromEntries(
    ENTRY_KINDS.map((kind) => [
      kind,
      maxFileBytes === null
        ? null
        : threshold(
            `maxFileBytes.${kind}`,
            maxFileBytes !== undefined && Object.hasOwn(maxFileBytes, kind) ? maxFileBytes[kind] : undefined,
            DEFAULT_GUARD_POLICY.maxFileBytes[kind],
          ),
    ]),
  ) as Record<EntryKind, number | null>;
  return {
    maxDeletedSeries: threshold('maxDeletedSeries', policy.maxDeletedSeries, DEFAULT_GUARD_POLICY.maxDeletedSeries),
    maxDeletedMediaRatio: threshold('maxDeletedMediaRatio', policy.maxDeletedMediaRatio, DEFAULT_GUARD_POLICY.maxDeletedMediaRatio, 1),
    maxMovedSeries: threshold('maxMovedSeries', policy.maxMovedSeries, DEFAULT_GUARD_POLICY.maxMovedSeries),
    maxFileBytes: limits,
  };
}

/** Côté du changeset dont on lit un fichier. */
export type GuardSide = 'base' | 'target';

/** Options de `guardChangeSet` (§4.11). */
export interface GuardOptions {
  /**
   * Octets du fichier `path` dans `base` ou dans `target`. La garde lit les
   * fichiers index pour connaître la confidentialité des séries.
   */
  readonly read: (side: GuardSide, path: string) => Promise<Uint8Array | string>;
  readonly policy: GuardPolicy;
}

/** Lectures simultanées de la garde. */
const GUARD_CONCURRENCY = 8;

function guard(code: Diagnostic['code'], severity: Diagnostic['severity'], path: string, message: string): Diagnostic {
  return { code, severity, path, message, rule: '§4.11' };
}

/**
 * Garde de publication (§4.11) : rend des diagnostics `guard-*`. Une erreur
 * interdit l'auto-publication — la décision reste au consumer.
 *
 * - `guard-snapshot-incomplete`, `guard-snapshot-empty`, `guard-private-exposed` :
 *   toujours évaluées ;
 * - les gardes à seuil s'évaluent avec le défaut de leur seuil quand la
 *   politique l'omet (`DEFAULT_GUARD_POLICY`), et sont inactives à `null` ;
 * - `guard-mass-deletion` : séries supprimées > `maxDeletedSeries`, ou médias
 *   supprimés > `maxDeletedMediaRatio` × médias de base. Une série supprimée
 *   est un dossier porteur dans base qui ne l'est plus dans target, et dont
 *   aucun fichier index n'est la source d'un `moved` ;
 * - `guard-mass-move` (warning) : séries déplacées — dossiers distincts parmi
 *   les `from` des `moved` qui désignent un fichier index — > `maxMovedSeries` ;
 * - `guard-private-exposed` : une série privée dans base (au moins un fichier
 *   index déclare `private: true`, booléen YAML), présente dans target — au
 *   même chemin, ou à la destination de ses fichiers index déplacés — et qui
 *   n'y est plus privée. `private` se lit en booléen strict, des deux côtés :
 *   `"true"`, `yes`, `1` ou une clé `Private` ne sont pas un marqueur, si bien
 *   qu'une série privée dont le `private` de target prend l'une de ces formes
 *   est exposée. Diagnostic sur son dossier dans target ; supprimer une série
 *   privée n'est pas l'exposer ;
 * - `guard-oversize` : une entrée de `publishable(target)` dépasse
 *   `maxFileBytes[kind]` — un original exclu ne bloque pas la publication ;
 * - `guard-originals-excluded` (info, toujours évaluée) : target porte au moins
 *   un original (§1.9), retiré du snapshot publié ; `count` et `bytes`
 *   rapportent le nombre d'entrées et la somme de leurs tailles.
 *
 * `target` est le snapshot de la source ; `changeSet` est le diff de base vers
 * `publishable(target)` (§4.11).
 *
 * Tous les fichiers index des séries de base sont lus, puis ceux de la série
 * homologue dans target quand la série de base est privée. Un fichier index
 * est **illisible** s'il n'est pas matérialisé (`placeholder`, `conflict`), si
 * ses octets divergent de son empreinte (§4.4) ou si son frontmatter ne se lit
 * pas. La garde est **fail-closed côté base** : un index illisible y rend la
 * série privée par prudence. Côté target, il ne déclare rien — une série
 * privée dont l'homologue est illisible est donc exposée. La garde n'émet pas
 * `entry-hash-mismatch` : ce diagnostic appartient à la validation.
 */
export async function guardChangeSet(
  changeSet: ContentChangeSet,
  base: ContentSnapshot | null,
  target: ContentSnapshot,
  options: GuardOptions,
): Promise<Diagnostic[]> {
  const { read } = options;
  const { maxDeletedSeries, maxDeletedMediaRatio, maxMovedSeries, maxFileBytes } = resolveGuardPolicy(options.policy);
  const diagnostics: Diagnostic[] = [];

  if (!target.complete) {
    diagnostics.push(guard('guard-snapshot-incomplete', 'error', '', 'Snapshot incomplet : publication interdite.'));
  }
  if (countKind(target.entries, 'content') === 0) {
    diagnostics.push(guard('guard-snapshot-empty', 'error', '', 'Snapshot sans contenu : publication interdite.'));
  }

  const baseFolders = indexFolders(base?.entries ?? []);
  const targetFolders = indexFolders(target.entries);
  const movedIndexes = changeSet.moved.filter((move) => isIndexFile(basename(move.from)));
  const movedSeries = new Set(movedIndexes.map((move) => dirname(move.from)));

  // Un seul `guard-mass-deletion` par changeset (au plus un diagnostic par
  // couple code/chemin, §4.10) : ses motifs se cumulent dans le message.
  const massDeletion: string[] = [];
  if (maxDeletedSeries !== null) {
    const deleted = [...baseFolders.keys()].filter((folder) => !targetFolders.has(folder) && !movedSeries.has(folder));
    if (deleted.length > maxDeletedSeries) {
      massDeletion.push(`${deleted.length} séries supprimées (seuil : ${maxDeletedSeries})`);
    }
  }
  if (maxDeletedMediaRatio !== null) {
    const baseMedia = countKind(base?.entries ?? [], 'media');
    const deletedMedia = countKind(changeSet.deleted, 'media');
    if (deletedMedia > maxDeletedMediaRatio * baseMedia) {
      massDeletion.push(`${deletedMedia} médias supprimés sur ${baseMedia} (seuil : ${maxDeletedMediaRatio * 100} %)`);
    }
  }
  if (massDeletion.length > 0) {
    diagnostics.push(guard('guard-mass-deletion', 'error', '', `${massDeletion.join(' ; ')}.`));
  }
  if (maxMovedSeries !== null && movedSeries.size > maxMovedSeries) {
    diagnostics.push(
      guard('guard-mass-move', 'warning', '', `${movedSeries.size} séries déplacées (seuil : ${maxMovedSeries}).`),
    );
  }

  if (base !== null) {
    const entries = { base: new Map(base.entries.map((e) => [e.path, e])), target: new Map(target.entries.map((e) => [e.path, e])) };
    // Une série est privée si l'un de ses fichiers index déclare
    // `private: true` (booléen, pas la chaîne). Un index illisible — non
    // matérialisé, de plus de 1 Mio (jamais lu, §1.12), octets divergents,
    // frontmatter qui ne se lit pas — rend la série privée côté base
    // (fail-closed) et ne déclare rien côté target.
    const isPrivate = async (side: GuardSide, indexPaths: readonly string[]): Promise<boolean> => {
      const unreadable = side === 'base';
      for (const path of indexPaths) {
        const entry = entries[side].get(path) as SnapshotEntry;
        if ((entry.state ?? 'materialized') !== 'materialized' || entry.size > MAX_READ_BYTES) {
          if (unreadable) return true;
          continue;
        }
        const content = await read(side, path);
        const result = (await verifyEntryBytes(entry, content)) ? parseFrontmatter(content) : null;
        if (result === null || result.status !== 'ok') {
          if (unreadable) return true;
          continue;
        }
        if (result.data.private === true) return true;
      }
      return false;
    };

    // Les dossiers de base sont lus en parallèle (PERF-009) : sur un provider
    // distant, une lecture après l'autre se payait en latence réseau, série par série.
    // Les diagnostics restent produits dans l'ordre des dossiers.
    const baseList = [...baseFolders];
    const basePrivate = await mapConcurrent(baseList, GUARD_CONCURRENCY, ([, indexPaths]) =>
      isPrivate('base', indexPaths),
    );

    for (const [position, [folder]] of baseList.entries()) {
      if (!basePrivate[position]) continue;
      // Homologue dans target : même dossier s'il porte encore un fichier
      // index, sinon la destination du premier fichier index déplacé.
      const firstMove = movedIndexes
        .filter((move) => dirname(move.from) === folder)
        .sort((a, b) => compareCanonical(a.from, b.from))[0];
      const homologue = targetFolders.has(folder) ? folder : firstMove !== undefined ? dirname(firstMove.to) : null;
      if (homologue === null) continue;
      if (!(await isPrivate('target', targetFolders.get(homologue) ?? []))) {
        diagnostics.push(
          guard('guard-private-exposed', 'error', homologue, `« ${folder} » était privée et ne l'est plus.`),
        );
      }
    }
  }

  const originals = target.entries.filter((entry) => isOriginalEntry(entry));
  if (originals.length > 0) {
    const bytes = originals.reduce((sum, entry) => sum + entry.size, 0);
    diagnostics.push({
      ...guard('guard-originals-excluded', 'info', '', `${originals.length} originaux exclus du snapshot publié (${bytes} octets).`),
      count: originals.length,
      bytes,
    });
  }

  for (const entry of target.entries) {
    if (isOriginalEntry(entry)) continue;
    const limit = maxFileBytes[entry.kind];
    if (limit !== null && entry.size > limit) {
      diagnostics.push(
        guard('guard-oversize', 'error', entry.path, `${entry.size} octets (seuil ${entry.kind} : ${limit}).`),
      );
    }
  }

  return finalizeDiagnostics(diagnostics);
}
