/**
 * Aperçu d'une valeur lue, pour un message de diagnostic.
 *
 * Une valeur de frontmatter arrive telle que l'a écrite un contributeur : une
 * chaîne de cent mille caractères, une liste qu'un alias a gonflée. Un message
 * qui la recopie en entier grossit avec elle, et `String()` d'une liste
 * développée par alias dépasse la longueur maximale d'une chaîne. Du texte
 * seulement, sans aucun import.
 */

/** Longueur maximale, en unités UTF-16, d'une valeur recopiée dans un message. */
export const PREVIEW_LENGTH = 80;

/** `text`, coupé à `PREVIEW_LENGTH` caractères et suivi de « … » s'il est plus long. */
export function truncate(text: string): string {
  if (text.length <= PREVIEW_LENGTH) return text;
  let cut = text.slice(0, PREVIEW_LENGTH);
  // Une paire de substitution coupée en deux n'est pas un texte.
  if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * Ce que l'on peut dire d'une valeur lue sans la recopier : une chaîne tronquée,
 * un scalaire tel quel, et seulement la nature d'une liste ou d'un mapping.
 */
export function preview(value: unknown): string {
  if (typeof value === 'string') return truncate(value);
  if (Array.isArray(value)) return value.length === 1 ? 'une liste d\'un élément' : `une liste de ${value.length} éléments`;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'une date invalide' : value.toISOString();
  if (typeof value === 'object' && value !== null) return 'un mapping';
  return truncate(String(value));
}
