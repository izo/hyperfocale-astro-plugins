/**
 * Ordres de la spec Hyperfocale — fonctions pures, sans `astro:content`.
 *
 * - §1.6 (2.13) : « alphabétique » veut dire l'ordre canonique de §4.1 — points
 *   de code du texte en NFC, casse comprise —, jamais une collation locale.
 * - §1.6 (2.15) : les séries se trient par date calendaire décroissante ; à date
 *   égale, par titre croissant puis par chemin ; les séries sans date viennent
 *   après les datées.
 */

import { compareCanonical } from './ingest/paths.js';

/** Compare deux textes sur leurs points de code en NFC (spec §4.1). */
export function compareNFC(a: string, b: string): number {
  return compareCanonical(a.normalize('NFC'), b.normalize('NFC'));
}

/**
 * Jour calendaire (`AAAA-MM-JJ`) d'une date de frontmatter, ou `null` si elle
 * est absente ou invalide.
 *
 * Le schéma coerce `date` en `Date` : un `AAAA-MM-JJ` devient minuit UTC, dont le
 * jour UTC est exactement le jour écrit. Pour une date écrite **avec** heure et
 * fuseau, le jour UTC peut différer du jour écrit (23:30-05:00 donne le lendemain) :
 * la valeur brute n'est plus disponible ici. Limite connue, sans effet sur les
 * dates sans heure.
 */
export function calendarDay(value: unknown): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

/** Ce que l'ordre des séries lit : un identifiant (le chemin), un titre, une date. */
export interface OrderableSeries {
  id: string;
  data: { title?: unknown; date?: unknown };
}

/**
 * Ordre d'un listing de séries (spec §1.6) : date calendaire décroissante ; à
 * date égale titre croissant, puis chemin ; sans date après les datées.
 */
export function compareSeriesOrder(a: OrderableSeries, b: OrderableSeries): number {
  const dayA = calendarDay(a.data.date);
  const dayB = calendarDay(b.data.date);
  if (dayA !== dayB) {
    if (dayA === null) return 1;
    if (dayB === null) return -1;
    return dayA < dayB ? 1 : -1;
  }
  return compareNFC(String(a.data.title ?? ''), String(b.data.title ?? '')) || compareNFC(a.id, b.id);
}
