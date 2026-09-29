import { commonHashAlgorithm, compareEntryContent } from './hash.js';
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
  return compareCanonical(a.path ?? '', b.path ?? '') || compareCanonical(a.code, b.code);
}

function incomparable(path: string): Diagnostic {
  return {
    code: 'hash-incomparable',
    severity: 'warning',
    path,
    message: 'Aucun algorithme d\'empreinte commun : le fichier est tenu pour modifié par prudence.',
    rule: '§2.7',
  };
}

/** Deux entrées sont-elles candidates à un move par contenu (règle 4 de §2.7) ? */
function sameContent(a: SnapshotEntry, b: SnapshotEntry): boolean {
  if (a.size !== b.size) return false;
  const alg = commonHashAlgorithm(a.hashes, b.hashes);
  return alg !== null && a.hashes?.[alg] === b.hashes?.[alg];
}

/**
 * Calcule le changeset qui mène de `base` à `target` (§2.7), de façon
 * déterministe :
 *
 * 1. chemins présents des deux côtés : `modified` si `kind` ou `size` diffère,
 *    ou si le premier hash commun diffère ; aucun hash commun → `modified` +
 *    `hash-incomparable` (warning) ;
 * 2. restent `A` (seulement dans target) et `D` (seulement dans base) ;
 * 3. moves par identité : même `identity` non vide, appariée 1:1 ;
 * 4. moves par contenu : même `size` + même premier hash commun, appariement
 *    1:1 unique — sinon `move-ambiguous` (info) sur chaque chemin concerné ;
 * 5. le reste : `added` / `deleted` ;
 * 6. tri : `added`, `modified`, `deleted` par `path`, `moved` par `to`.
 *
 * `base` à `null` : premier snapshot, tout est ajouté. Deux snapshots de même
 * identifiant donnent un changeset vide sans diagnostic (règle 7), y compris
 * quand certaines entrées n'ont aucune empreinte.
 */
export function diffSnapshots(base: ContentSnapshot | null, target: ContentSnapshot): ContentChangeSet {
  const changeSet = (parts: Omit<ContentChangeSet, 'format' | 'version' | 'base' | 'target'>): ContentChangeSet => ({
    format: 'hyperfocale.changeset',
    version: 1,
    base: base?.id ?? null,
    target: target.id,
    ...parts,
  });

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

  // Règle 3 : identité, appariement 1:1 (une identité dupliquée d'un côté n'apparie rien).
  const byIdentity = (entries: Map<string, SnapshotEntry>) => {
    const index = new Map<string, SnapshotEntry[]>();
    for (const entry of entries.values()) {
      if (entry.identity === undefined || entry.identity === '') continue;
      const list = index.get(entry.identity) ?? [];
      list.push(entry);
      index.set(entry.identity, list);
    }
    return index;
  };
  const addedByIdentity = byIdentity(added);
  for (const [identity, befores] of byIdentity(deleted)) {
    const afters = addedByIdentity.get(identity);
    if (befores.length !== 1 || afters?.length !== 1) continue;
    const before = befores[0] as SnapshotEntry;
    const after = afters[0] as SnapshotEntry;
    const verdict = compareEntryContent(before, after);
    moved.push({ from: before.path, to: after.path, before, after, modified: verdict !== 'same' });
    if (verdict === 'incomparable') diagnostics.push(incomparable(after.path));
    deleted.delete(before.path);
    added.delete(after.path);
  }

  // Règle 4 : contenu. Regroupement par taille d'abord — la comparaison des
  // empreintes dépend de la paire (premier algorithme commun), mais deux fichiers
  // de tailles différentes ne sont jamais candidats.
  const addedBySize = new Map<number, SnapshotEntry[]>();
  for (const entry of added.values()) {
    const list = addedBySize.get(entry.size) ?? [];
    list.push(entry);
    addedBySize.set(entry.size, list);
  }
  const candidatesOf = new Map<string, SnapshotEntry[]>();
  const candidatesTo = new Map<string, SnapshotEntry[]>();
  for (const before of deleted.values()) {
    for (const after of addedBySize.get(before.size) ?? []) {
      if (!sameContent(before, after)) continue;
      candidatesOf.set(before.path, [...(candidatesOf.get(before.path) ?? []), after]);
      candidatesTo.set(after.path, [...(candidatesTo.get(after.path) ?? []), before]);
    }
  }
  const ambiguous = new Set<string>();
  for (const [from, afters] of candidatesOf) {
    const after = afters[0] as SnapshotEntry;
    if (afters.length === 1 && candidatesTo.get(after.path)?.length === 1) {
      const before = deleted.get(from) as SnapshotEntry;
      moved.push({ from, to: after.path, before, after, modified: false });
      continue;
    }
    ambiguous.add(from);
    for (const candidate of afters) ambiguous.add(candidate.path);
  }
  for (const [to, befores] of candidatesTo) {
    if (befores.length > 1) {
      ambiguous.add(to);
      for (const candidate of befores) ambiguous.add(candidate.path);
    }
  }
  for (const move of moved) {
    deleted.delete(move.from);
    added.delete(move.to);
  }
  for (const path of ambiguous) {
    diagnostics.push({
      code: 'move-ambiguous',
      severity: 'info',
      path,
      message: 'Plusieurs fichiers de contenu identique : aucun déplacement n\'est inféré.',
      rule: '§2.7',
    });
  }

  // Règles 5 et 6.
  const byPath = (a: { path: string }, b: { path: string }) => compareCanonical(a.path, b.path);
  return changeSet({
    added: [...added.values()].sort(byPath),
    modified: modified.sort(byPath),
    deleted: [...deleted.values()].sort(byPath),
    moved: moved.sort((a, b) => compareCanonical(a.to, b.to)),
    diagnostics: diagnostics.sort(compareDiagnostics),
  });
}
