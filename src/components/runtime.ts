/**
 * Outils internes des composants : options par instance (#136).
 *
 * Compilé par tsup en `dist/components/runtime.js`, que les `.astro` copiés
 * dans `dist/components/` importent par chemin relatif. Hors du champ
 * `exports` : ce n'est pas une API publique.
 */
import type { HeadingLevel } from '../i18n.js';
import type { Attachment } from '../schema.js';
import { isSafeLinkUrl } from '../ingest/paths.js';

/**
 * Valeur d'un `href` : l'URL, ou `undefined` (attribut omis) si son schéma n'est
 * ni `http(s)` ni absent (#152). `allowData` : le `data:` d'un fichier local que
 * Vite a inliné (`SeriesAttachments`).
 */
export function safeHref(url: unknown, allowData = false): string | undefined {
  return isSafeLinkUrl(url, allowData) ? url : undefined;
}

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

/**
 * Attributs posés sur un élément **intérieur** du composant (le lien d'un
 * document joint, #136) : `data-*`, `aria-*` et `class`. Comme pour la racine,
 * tout le reste est écarté — `on*`, `href`, `style`, `download`… — et une
 * valeur `undefined`, `null` ou `false` n'est pas transmise.
 */
export interface ElementAttrs {
  class?: string;
  [attr: `data-${string}`]: unknown;
  [attr: `aria-${string}`]: unknown;
}

/** Attributs du lien d'un document joint (`SeriesAttachments`). */
export type AttachmentLinkAttrs = ElementAttrs;

/** Document joint passé à `SeriesAttachments` : un `Attachment`, plus les attributs de son lien. */
export type SeriesAttachmentItem = Attachment & { attrs?: AttachmentLinkAttrs };

/** Filtre de `ElementAttrs` : `class` (chaîne non vide) en plus de `passthroughAttrs`. */
export function elementAttrs(attrs: unknown): { class?: string } & Record<string, unknown> {
  if (!attrs || typeof attrs !== 'object') return {};
  const record = attrs as Record<string, unknown>;
  const out: { class?: string } & Record<string, unknown> = {};
  for (const [key, value] of Object.entries(passthroughAttrs(record))) {
    if (value !== null) out[key] = value;
  }
  const cls = record['class'];
  if (typeof cls === 'string' && cls.trim() !== '') out.class = cls;
  return out;
}

/**
 * Feuilles émises par les composants (`componentStyles: 'inline'`) : une seule
 * fois par page. La clé est l'objet `Astro.request`, propre à chaque rendu de
 * page — rien ne passe d'une page à l'autre, et la `WeakMap` ne retient rien.
 * Rend `true` au premier appel pour `(request, name)`, `false` ensuite.
 */
const emittedStyles = new WeakMap<object, Set<string>>();
export function claimStyles(request: object, name: string): boolean {
  let names = emittedStyles.get(request);
  if (!names) {
    names = new Set();
    emittedStyles.set(request, names);
  }
  if (names.has(name)) return false;
  names.add(name);
  return true;
}

/**
 * `componentStyles` de l'intégration, lu par les composants qui portent leur
 * feuille (`SeriesAttachments` en 0.24.0). Hors intégration (tests, rendu par
 * l'API container) : `'inline'`.
 */
export function componentStylesMode(): 'inline' | 'none' {
  return import.meta.env.HYPERFOCALE_COMPONENT_STYLES === 'none' ? 'none' : 'inline';
}

/**
 * Feuille compactée pour l'émission inline : commentaires retirés, blancs
 * réduits. Les commentaires de la feuille documentent le fichier publié
 * (`/styles/*.css`) ; ils n'ont rien à faire dans chaque page.
 */
const compacted = new Map<string, string>();
export function compactCss(css: string): string {
  let out = compacted.get(css);
  if (out === undefined) {
    out = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{};])\s*/g, '$1')
      .trim();
    compacted.set(css, out);
  }
  return out;
}

/**
 * Identifiant HTML stable dérivé d'une chaîne (FNV-1a 32 bits, base 36) — pour
 * relier deux éléments d'un même composant (`aria-describedby`) sans compteur
 * global. Deux instances identiques sur une page partagent l'identifiant, et
 * le texte qu'il désigne : la description reste juste.
 */
export function stableId(prefix: string, seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}-${hash.toString(36)}`;
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
