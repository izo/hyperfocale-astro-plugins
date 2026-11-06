/**
 * Date de frontmatter lue telle qu'écrite (spec §1.3, §1.6, §4.10 règle 8).
 *
 * Le jour d'une série est celui que l'auteur lit dans son fichier : les dix
 * premiers caractères, `AAAA-MM-JJ`, sans conversion de fuseau ni d'heure d'été.
 * `2026-06-15T23:30:00-05:00` est le 15 juin, alors que son instant tombe le 16
 * en UTC. Du texte seulement, sans aucun import : le schéma, le loader et la
 * validation d'ingestion jugent une date de la même façon.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/** Minuit UTC du jour calendaire, ou `null` s'il n'existe pas (`2024-02-30`). */
function utcMidnight(year: number, month: number, day: number): Date | null {
  // `Date.UTC` lit une année de 0 à 99 comme 1900 à 1999 ; `setUTCFullYear` non.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/**
 * Jour écrit (`AAAA-MM-JJ`) d'une date ISO 8601 valide au sens de §4.10, règle 8
 * — calendrier et horloge compris —, ou `null` : `AAAA-MM-JJ`, suivie au plus de
 * `THH:MM`, `:SS`, d'une fraction et d'un fuseau `Z` ou `±HH:MM`.
 */
export function writtenDay(text: string): string | null {
  const match = ISO_DATE.exec(text);
  if (match === null) return null;
  if (utcMidnight(Number(match[1]), Number(match[2]), Number(match[3])) === null) return null;
  const [hour, minute, second] = [match[4], match[5], match[6]].map((part) => (part === undefined ? 0 : Number(part)));
  if ((hour as number) > 23 || (minute as number) > 59 || (second as number) > 59) return null;
  return text.slice(0, 10);
}

/**
 * Le jour écrit d'une date ISO 8601, à minuit UTC — la forme que prend déjà un
 * `AAAA-MM-JJ` seul. L'heure et le fuseau sont écartés : §1.3 les ignore, et
 * c'est ce qui garde le jour UTC de la valeur égal au jour écrit. `null` si le
 * texte n'est pas une date valide.
 */
export function writtenDate(text: string): Date | null {
  const day = writtenDay(text);
  return day === null ? null : utcMidnight(Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10)));
}
