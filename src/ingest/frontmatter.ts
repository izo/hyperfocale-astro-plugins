import { CORE_SCHEMA, load } from 'js-yaml';

const decoder = new TextDecoder('utf-8');

/** Texte d'un fichier lu en octets ou déjà décodé. */
export function decodeText(content: Uint8Array | string): string {
  return typeof content === 'string' ? content : decoder.decode(content);
}

/** Résultat de la lecture d'un frontmatter. */
export type FrontmatterResult =
  | { readonly status: 'ok'; readonly data: Record<string, unknown> }
  | { readonly status: 'missing' }
  | { readonly status: 'invalid'; readonly reason: string };

/**
 * Extrait et parse le bloc YAML initial d'un fichier markdown.
 *
 * - `missing` : pas de ligne `---` en tête (BOM toléré), ou bloc jamais refermé
 *   — c'est ainsi que le Content Layer d'Astro le lit aussi : sans frontmatter.
 * - `invalid` : YAML illisible, ou qui ne produit pas un mapping.
 * - Un bloc vide vaut `{}` : les champs manquants sont diagnostiqués un à un.
 *
 * Le parseur est `js-yaml` en schéma `core` : une date nue (`2024-06-15`)
 * reste une chaîne. La validation juge ainsi le texte écrit, et non ce qu'en
 * ferait le schéma par défaut — qui convertit sans broncher `2024-02-30` en
 * 1er mars.
 */
export function parseFrontmatter(text: string): FrontmatterResult {
  const lines = (text.startsWith('\uFEFF') ? text.slice(1) : text).split(/\r?\n/);
  if (lines[0]?.trimEnd() !== '---') return { status: 'missing' };

  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
  if (end === -1) return { status: 'missing' };

  let data: unknown;
  try {
    data = load(lines.slice(1, end).join('\n'), { schema: CORE_SCHEMA });
  } catch (err) {
    return { status: 'invalid', reason: (err as Error).message.split('\n')[0] ?? 'YAML illisible' };
  }
  if (data === undefined || data === null) return { status: 'ok', data: {} };
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { status: 'invalid', reason: 'le frontmatter n\'est pas un mapping' };
  }
  return { status: 'ok', data: data as Record<string, unknown> };
}
