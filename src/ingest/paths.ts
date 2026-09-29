import type { EntryKind } from './types.js';

/** Résultat de `normalizePath` : le chemin NFC et son verdict (§2.1). */
export interface NormalizedPath {
  /** Chemin normalisé NFC — renvoyé même s'il est invalide, pour le diagnostic. */
  readonly path: string;
  readonly valid: boolean;
  /** Motif de l'invalidité, en clair. */
  readonly reason?: string;
}

// U+0000–U+001F et U+007F (§2.1).
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;

/**
 * Normalise un chemin en NFC et le confronte aux règles du contrat (§2.1).
 *
 * Ne répare rien d'autre que la forme Unicode : un `/` initial, un segment `..`
 * ou un `\` rendent le chemin invalide, ils ne sont pas corrigés. Un provider
 * qui produit un tel chemin a un défaut à corriger chez lui, pas ici.
 */
export function normalizePath(input: string): NormalizedPath {
  const path = input.normalize('NFC');
  const invalid = (reason: string): NormalizedPath => ({ path, valid: false, reason });

  if (path === '') return invalid('chemin vide');
  if (path.includes('\\')) return invalid('contient une barre oblique inverse');
  if (CONTROL_CHAR.test(path)) return invalid('contient un caractère de contrôle');
  if (path.startsWith('/')) return invalid('commence par « / »');
  if (path.endsWith('/')) return invalid('finit par « / »');
  for (const segment of path.split('/')) {
    if (segment === '') return invalid('contient un segment vide');
    if (segment === '.' || segment === '..') return invalid(`contient un segment « ${segment} »`);
  }
  return { path, valid: true };
}

/**
 * Clé de collision (§2.1) : deux chemins de même clé désignent le même fichier
 * pour un provider insensible à la casse (Dropbox, APFS et HFS+ par défaut).
 */
export function collisionKey(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

/**
 * Ordre canonique (§2.1) : séquence d'octets UTF-8, sans collation locale.
 *
 * L'ordre des octets UTF-8 coïncide avec celui des points de code — et diffère
 * de la comparaison native des chaînes JS, qui porte sur les unités UTF-16 : un
 * caractère hors du plan de base (😀, U+1F600) passe *avant* U+FF5E en UTF-16,
 * *après* en UTF-8. D'où la comparaison point de code par point de code.
 */
export function compareCanonical(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = a.codePointAt(i) as number;
    const cb = b.codePointAt(j) as number;
    if (ca !== cb) return ca < cb ? -1 : 1;
    i += ca > 0xffff ? 2 : 1;
    j += cb > 0xffff ? 2 : 1;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return 0;
}

/** Dernier segment d'un chemin. */
export function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

/** Dossier parent d'un chemin — `''` pour une entrée à la racine du corpus. */
export function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** Joint un dossier (éventuellement la racine `''`) et un chemin relatif. */
export function joinPath(dir: string, rest: string): string {
  return dir === '' ? rest : `${dir}/${rest}`;
}

/** `path` est-il `dir` lui-même ou l'un de ses descendants ? */
export function isWithin(path: string, dir: string): boolean {
  return dir === '' || path === dir || path.startsWith(`${dir}/`);
}

/**
 * Règle d'exclusion propre au consumer (§2.2) :
 * - chaîne : un **segment** du chemin égal à la chaîne. Un `/` final
 *   (`"_todo/"`) restreint aux segments de dossier, jamais au nom du fichier ;
 * - RegExp : testée sur le chemin complet ;
 * - fonction : prédicat sur le chemin complet.
 */
export type ExclusionRule = string | RegExp | ((path: string) => boolean);

// Basenames exclus d'office (§2.2). `Icon\r` est l'icône de dossier personnalisée
// de macOS : son nom se termine réellement par un retour chariot.
const EXCLUDED_BASENAMES = new Set(['Thumbs.db', 'desktop.ini', 'Icon\r']);

/**
 * Le chemin est-il exclu de tout snapshot (§2.2) ?
 *
 * Exclu d'office : un segment qui commence par `.` (`.DS_Store`, `.git/`,
 * `._x.jpg`), et les basenames `Thumbs.db`, `desktop.ini`, `Icon\r`. Une
 * exclusion n'est jamais une erreur : le fichier n'existe simplement pas pour
 * le contrat.
 */
export function isExcluded(path: string, rules: readonly ExclusionRule[] = []): boolean {
  const segments = path.split('/');
  if (segments.some((segment) => segment.startsWith('.'))) return true;
  if (EXCLUDED_BASENAMES.has(segments[segments.length - 1] as string)) return true;

  for (const rule of rules) {
    if (typeof rule === 'function') {
      if (rule(path)) return true;
    } else if (rule instanceof RegExp) {
      rule.lastIndex = 0;
      if (rule.test(path)) return true;
    } else if (rule.endsWith('/')) {
      const name = rule.slice(0, -1);
      if (segments.slice(0, -1).includes(name)) return true;
    } else if (segments.includes(rule)) {
      return true;
    }
  }
  return false;
}

const CONTENT_EXTENSION = /\.mdx?$/i;

/**
 * Classe d'un chemin (§2.3), règles appliquées dans l'ordre :
 * 1. basename `images.json` → `derived` (§1.5.1 : donnée dérivée) ;
 * 2. dossier parent immédiat nommé `media` → `media` ;
 * 3. extension `.md` / `.mdx`, insensible à la casse → `content` ;
 * 4. sinon → `other`.
 */
export function classifyPath(path: string): EntryKind {
  if (basename(path) === 'images.json') return 'derived';
  if (basename(dirname(path)) === 'media') return 'media';
  if (CONTENT_EXTENSION.test(path)) return 'content';
  return 'other';
}

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|avif|tiff?)$/i;

/** Le chemin désigne-t-il une image au sens de §1.2 / §1.9 (par extension) ? */
export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSION.test(path);
}

const INDEX_FILE =/^index(?:\.[a-z]{2}(?:-[A-Z]{2})?)?\.md$|^index\.mdx$/;

/**
 * Le basename est-il un fichier index (§2.10) : `index.md`, `index.mdx` ou
 * `index.<lang>.md` (Annexe F, stratégie 2 ; `<lang>` = `[a-z]{2}(-[A-Z]{2})?`) ?
 */
export function isIndexFile(name: string): boolean {
  return INDEX_FILE.test(name);
}

/** Fichier index par défaut — celui qui ne porte pas de langue. */
export function isDefaultIndexFile(name: string): boolean {
  return name === 'index.md' || name === 'index.mdx';
}
