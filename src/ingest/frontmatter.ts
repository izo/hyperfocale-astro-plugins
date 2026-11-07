import { CORE_SCHEMA, load } from 'js-yaml';
import { BOUND_MESSAGES, exceedsReadBytes, MAX_NESTING_DEPTH, MAX_READ_BYTES, measureStructure } from './bounds.js';

/**
 * Taille maximale du bloc de frontmatter lu, en octets (SEC-010). Plus stricte
 * que la borne de la spec sur le fichier entier (`MAX_READ_BYTES`, §1.12).
 */
export const MAX_FRONTMATTER_BYTES = 256 * 1024;

// Garde-fou de pile du parseur, volontairement plus large que la borne de §1.12 :
// son décompte de profondeur varie d'un style à l'autre (bloc, flux), et un
// fichier de 32 collections licite ne doit pas être refusé. La borne exacte est
// jugée par `measureStructure`.
const PARSER_MAX_DEPTH = 2 * MAX_NESTING_DEPTH;

// `fatal` : des octets qui ne forment pas de l'UTF-8 valide rendent le fichier
// illisible (§4.10, règle 3) au lieu d'être remplacés par U+FFFD en silence.
// Le BOM initial est retiré par le décodeur.
const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Texte UTF-8 d'un fichier lu en octets ou déjà décodé, BOM initial retiré ;
 * `null` si les octets ne sont pas de l'UTF-8 valide.
 */
export function decodeUtf8(content: Uint8Array | string): string | null {
  if (typeof content === 'string') return content.startsWith('\uFEFF') ? content.slice(1) : content;
  try {
    return decoder.decode(content);
  } catch {
    return null;
  }
}

const MERGE_KEY_REASON =
  'clé de fusion YAML 1.1 (`<<`) non supportée : le build la développerait, ce lecteur non — deux lecteurs divergeraient';

/**
 * Une clé `<<` figure-t-elle dans la valeur lue, à une profondeur quelconque ?
 * Un parcours itératif qui ne visite chaque objet qu'une fois : les alias
 * partagent leurs références, l'arbre n'est jamais développé.
 */
function hasMergeKey(root: unknown): boolean {
  const seen = new Set<object>();
  const pending: unknown[] = [root];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (typeof node !== 'object' || node === null || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) pending.push(item);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(node, '<<')) return true;
    for (const item of Object.values(node)) pending.push(item);
  }
  return false;
}

/** Résultat de la lecture d'un frontmatter. */
export type FrontmatterResult =
  | { readonly status: 'ok'; readonly data: Record<string, unknown> }
  | { readonly status: 'missing' }
  | { readonly status: 'invalid'; readonly reason: string };

/**
 * Extrait et parse le bloc YAML initial d'un fichier markdown (§4.10, règles 3
 * à 5).
 *
 * - `missing` : la première ligne ne vaut pas exactement `---`, ou aucune ligne
 *   suivante ne vaut exactement `---` pour refermer le bloc ;
 * - `invalid` : UTF-8 invalide, YAML illisible (clé dupliquée comprise), bornes
 *   de lecture franchies (§1.12 : fichier de plus de 1 Mio, 32 collections
 *   imbriquées, 100 000 nœuds après expansion des alias, alias circulaire,
 *   poids du texte développé), clé de fusion `<<`, bloc vide, ou racine qui
 *   n'est pas un mapping.
 *
 * Le YAML s'interprète en schéma 1.2 *core* : une date non guillemetée reste
 * une chaîne. La validation juge ainsi le texte écrit, et non ce qu'en ferait
 * le schéma par défaut — qui convertit sans broncher `2024-02-30` en 1er mars.
 *
 * La clé de fusion `<<` (YAML 1.1) est refusée à toute profondeur, entre
 * guillemets comprise : le parseur d'Astro, qui lit le build, la remplace par les
 * clés de l'ancre, que ce lecteur laisserait sous `<<`. Une clé de `private`, de
 * `cover` ou de `iptc.gps` introduite ainsi échapperait à la validation et à la
 * garde, et partirait en production. Deux lecteurs divergeraient, d'où le refus
 * plutôt que l'interprétation (§1.12).
 *
 * Les bornes de lecture s'appliquent avant toute exploitation du résultat : la
 * taille avant le décodage, puis la profondeur, les nœuds, le poids du texte et
 * les alias circulaires par une mesure qui ne développe pas les alias
 * (`measureStructure`) — le parseur partage les références d'un alias.
 *
 * Le nombre d'alias n'est pas borné : la spec ne le borne pas, et un plafond
 * global refuserait des fichiers licites. Le parseur d'Astro, lui, refuse une
 * ancre aliasée plus de 100 fois (`maxAliasCount`) : un frontmatter lu ici peut
 * donc être refusé au build. Ce lecteur dit ce que la spec accepte, pas ce que
 * le build construit.
 */
export function parseFrontmatter(content: Uint8Array | string): FrontmatterResult {
  if (exceedsReadBytes(content)) return { status: 'invalid', reason: `fichier de plus de ${MAX_READ_BYTES} octets` };
  const text = decodeUtf8(content);
  if (text === null) return { status: 'invalid', reason: 'octets UTF-8 invalides' };

  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { status: 'missing' };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { status: 'missing' };

  const block = lines.slice(1, end).join('\n');
  if (new TextEncoder().encode(block).length > MAX_FRONTMATTER_BYTES) {
    return { status: 'invalid', reason: `frontmatter de plus de ${MAX_FRONTMATTER_BYTES / 1024} Kio` };
  }

  let data: unknown;
  try {
    data = load(block, { schema: CORE_SCHEMA, maxDepth: PARSER_MAX_DEPTH });
  } catch (err) {
    return { status: 'invalid', reason: (err as Error).message.split('\n')[0] ?? 'YAML illisible' };
  }
  const violation = measureStructure(data);
  if (violation !== null) return { status: 'invalid', reason: BOUND_MESSAGES[violation] };
  if (hasMergeKey(data)) return { status: 'invalid', reason: MERGE_KEY_REASON };
  if (data === undefined || data === null) return { status: 'invalid', reason: 'bloc de frontmatter vide' };
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { status: 'invalid', reason: 'la racine du frontmatter n\'est pas un mapping' };
  }
  return { status: 'ok', data: data as Record<string, unknown> };
}
