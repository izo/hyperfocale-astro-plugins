import { CORE_SCHEMA, load } from 'js-yaml';

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
 * - `invalid` : UTF-8 invalide, YAML illisible (clé dupliquée comprise), bloc
 *   vide, ou racine qui n'est pas un mapping.
 *
 * Le YAML s'interprète en schéma 1.2 *core* : une date non guillemetée reste
 * une chaîne. La validation juge ainsi le texte écrit, et non ce qu'en ferait
 * le schéma par défaut — qui convertit sans broncher `2024-02-30` en 1er mars.
 */
export function parseFrontmatter(content: Uint8Array | string): FrontmatterResult {
  const text = decodeUtf8(content);
  if (text === null) return { status: 'invalid', reason: 'octets UTF-8 invalides' };

  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { status: 'missing' };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { status: 'missing' };

  let data: unknown;
  try {
    data = load(lines.slice(1, end).join('\n'), { schema: CORE_SCHEMA });
  } catch (err) {
    return { status: 'invalid', reason: (err as Error).message.split('\n')[0] ?? 'YAML illisible' };
  }
  if (data === undefined || data === null) return { status: 'invalid', reason: 'bloc de frontmatter vide' };
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { status: 'invalid', reason: 'la racine du frontmatter n\'est pas un mapping' };
  }
  return { status: 'ok', data: data as Record<string, unknown> };
}
