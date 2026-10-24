/**
 * Outils internes des composants : options par instance (#136).
 *
 * Compilé par tsup en `dist/components/runtime.js`, que les `.astro` copiés
 * dans `dist/components/` importent par chemin relatif. Hors du champ
 * `exports` : ce n'est pas une API publique.
 */
import type { HeadingLevel } from '../i18n.js';

export {
  resolveLabels,
  formatLabel,
  pluralLabel,
  formatDate,
  formatFileSize,
  HF_DEFAULT_LOCALE,
} from '../i18n.js';
export type { HyperfocaleLabels, HeadingLevel, HfPluralForms } from '../i18n.js';

/**
 * Attributs `data-*` et `aria-*` reçus en props, à reporter sur la racine du
 * composant. Les autres props (celles du composant, `class`) sont ignorées.
 * Une valeur `undefined` ou `false` n'est pas transmise.
 */
export function passthroughAttrs(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('data-') || key.startsWith('aria-')) out[key] = value;
  }
  return out;
}

/** Balise de titre pour `headingLevel` ; une valeur hors 1–6 retombe sur `fallback`. */
export function headingTag(level: unknown, fallback: HeadingLevel = 2): `h${HeadingLevel}` {
  const n = typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 6 ? level : fallback;
  return `h${n as HeadingLevel}`;
}

/**
 * JSON à injecter dans un `<script type="application/json">` via `set:html`.
 *
 * Dans un `<script>`, Astro n'évalue pas les expressions `{}` du gabarit — il
 * faut `set:html`, qui n'échappe rien. `JSON.stringify` ne touche pas `<` : une
 * valeur contenant `</script>` fermerait la balise. `<` est un échappement
 * JSON valide, que `JSON.parse` restitue en `<` (#138).
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Props communes à tous les composants. */
export interface InstanceProps {
  /** Locale BCP 47 (`fr`, `en`, `ja`…). Défaut : `fr`. */
  locale?: string;
  /** Surcharges de libellés, fusionnées sur le dictionnaire de la locale. */
  labels?: Partial<import('../i18n.js').HyperfocaleLabels>;
  /** Classe(s) ajoutée(s) à la racine du composant. */
  class?: string;
  /** Attributs `data-*` et `aria-*`, reportés sur la racine. */
  [attr: `data-${string}`]: unknown;
  [attr: `aria-${string}`]: unknown;
}
