import { compareEntryContent, compareSizeAndHashes } from './hash.js';
import { compareCanonical } from './paths.js';
import type {
  ContentChangeSet,
  ContentSnapshot,
  Diagnostic,
  ModifiedEntry,
  MovedEntry,
  SnapshotEntry,
} from './types.js';

/** Tri des diagnostics : chemin, puis code (ordre canonique). */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return compareCanonical(a.path, b.path) || compareCanonical(a.code, b.code);
}

/**
 * Trie une liste de diagnostics et n'en garde qu'un par couple `(code, path)`
 * (§4.10) — le premier rencontré.
 */
export function finalizeDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return [...diagnostics].sort(compareDiagnostics).filter((d) => {
    const key = `${d.code}\u0000${d.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function incomparable(path: string): Diagnostic {
  return {
    code: 'hash-incomparable',
    severity: 'warning',
    path,
    message: 'Aucun algorithme d\'empreinte commun : le fichier est tenu pour modifié par prudence.',
    rule: '§4.7',
  };
}

/**
 * Calcule le changeset qui mène de `base` à `target` (§4.7), de façon
 * déterministe :
 *
 * 0. même `id` des deux côtés → changeset vide, sans diagnostic — y compris
 *    pour des entrées `placeholder` sans empreinte ;
 * 1. chemins présents des deux côtés : `modified` si `kind` ou `size` diffère,
 *    ou si le premier hash commun diffère ; aucun hash commun → `modified` +
 *    `hash-incomparable` (warning) ;
 * 2. restent `A` (seulement dans target) et `D` (seulement dans base) ;
 * 3. moves par identité : une `identity` portée par exactement une entrée de
 *    chaque côté. `kind` n'entre pas dans `modified` — il dérive du chemin —
 *    mais `hash-incomparable` exige, comme en 1, `kind` et `size` égaux ;
 * 4. moves par contenu : même `size` + même premier hash commun, appariement
 *    1:1 unique ; toute entrée qui a une candidate sans appariement unique
 *    reçoit `move-ambiguous` (info) ;
 * 5. le reste : `added` / `deleted` ;
 * 6. tri : `added`, `modified`, `deleted` par `path`, `moved` par `to`.
 *
 * `base` à `null` : première publication, tout est ajouté.
 */
export function diffSnapshots(base: ContentSnapshot | null, target: ContentSnapshot): ContentChangeSet {
  const changeSet = (parts: Omit<ContentChangeSet, 'format' | 'version' | 'base' | 'target'>): ContentChangeSet => ({
    format: 'hyperfocale.changeset',
    version: 1,
    base: base?.id ?? null,
    target: target.id,
    ...parts,
  });

  // Règle 0.
  if (base !== null && base.id === target.id) {
    return changeSet({ added: [], modified: [], deleted: [], moved: [], diagnostics: [] });
  }

  const diagnostics: Diagnostic[] = [];
  const modified: ModifiedEntry[] = [];
  const moved: MovedEntry[] = [];

  const baseByPath = new Map((base?.entries ?? []).map((entry) => [entry.path, entry]));
  const targetByPath = new Map(target.entries.map((entry) => [entry.path, entry]));

  // Règle 1.
  for (const [path, after] of targetByPath) {
    const before = baseByPath.get(path);
    if (before === undefined) continue;
    const verdict = compareEntryContent(before, after);
    if (verdict === 'same') continue;
    modified.push({ path, before, after });
    if (verdict === 'incomparable') diagnostics.push(incomparable(path));
  }

  // Règle 2.
  const added = new Map([...targetByPath].filter(([path]) => !baseByPath.has(path)));
  const deleted = new Map([...baseByPath].filter(([path]) => !targetByPath.has(path)));

  // Règle 3.
  const byIdentity = (entries: Map<string, SnapshotEntry>) => {
    const index = new Map<string, SnapshotEntry[]>();
    for (const entry of entries.values()) {
      if (entry.identity === undefined || entry.identity === '') continue;
      index.set(entry.identity, [...(index.get(entry.identity) ?? []), entry]);
    }
    return index;
  };
  const addedByIdentity = byIdentity(added);
  for (const [identity, befores] of byIdentity(deleted)) {
    const afters = addedByIdentity.get(identity);
    if (befores.length !== 1 || afters?.length !== 1) continue;
    const before = befores[0] as SnapshotEntry;
    const after = afters[0] as SnapshotEntry;
    const verdict = compareSizeAndHashes(before, after);
    moved.push({ from: before.path, to: after.path, before, after, modified: verdict !== 'same' });
    // Comme à la règle 1 : le diagnostic exige `kind` et `size` égaux.
    if (verdict === 'incomparable' && before.kind === after.kind) diagnostics.push(incomparable(after.path));
    deleted.delete(before.path);
    added.delete(after.path);
  }

  // Règle 4. Regroupement par taille d'abord : deux tailles différentes ne sont
  // jamais candidates, et le premier algorithme commun dépend de la paire.
  const addedBySize = new Map<number, SnapshotEntry[]>();
  for (const entry of added.values()) addedBySize.set(entry.size, [...(addedBySize.get(entry.size) ?? []), entry]);
  const candidates = new Map<string, string[]>();
  const link = (from: string, to: string) => candidates.set(from, [...(candidates.get(from) ?? []), to]);
  for (const before of deleted.values()) {
    for (const after of addedBySize.get(before.size) ?? []) {
      if (compareSizeAndHashes(before, after) !== 'same') continue;
      link(`D:${before.path}`, after.path);
      link(`A:${after.path}`, before.path);
    }
  }
  for (const [key, [to, ...others]] of candidates) {
    if (!key.startsWith('D:') || others.length > 0 || to === undefined) continue;
    const from = key.slice(2);
    if (candidates.get(`A:${to}`)?.length !== 1) continue;
    moved.push({ from, to, before: deleted.get(from) as SnapshotEntry, after: added.get(to) as SnapshotEntry, modified: false });
  }
  const pairedFrom = new Set(moved.map((m) => m.from));
  const pairedTo = new Set(moved.map((m) => m.to));
  for (const key of candidates.keys()) {
    const path = key.slice(2);
    if (key.startsWith('D:') ? pairedFrom.has(path) : pairedTo.has(path)) continue;
    diagnostics.push({
      code: 'move-ambiguous',
      severity: 'info',
      path,
      message: 'Plusieurs fichiers de contenu identique : aucun déplacement n\'est inféré.',
      rule: '§4.7',
    });
  }
  for (const move of moved) {
    deleted.delete(move.from);
    added.delete(move.to);
  }

  // Règles 5 et 6.
  const byPath = (a: { path: string }, b: { path: string }) => compareCanonical(a.path, b.path);
  return changeSet({
    added: [...added.values()].sort(byPath),
    modified: modified.sort(byPath),
    deleted: [...deleted.values()].sort(byPath),
    moved: moved.sort((a, b) => compareCanonical(a.to, b.to)),
    diagnostics: finalizeDiagnostics(diagnostics),
  });
}
