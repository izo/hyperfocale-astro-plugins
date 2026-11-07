/**
 * Bornes de lecture (§1.12, « Bornes de lecture » ; §4.10, règles 4 et 6) : un
 * fichier de quelques centaines d'octets peut épuiser un lecteur sans contenir
 * de code, le YAML se prêtant à l'expansion exponentielle par alias.
 *
 * Pur : aucun import, aucun module `node:*`. Partagé par la validation, la garde,
 * le résolveur de médias et le loader.
 */

/** Taille maximale d'un fichier index ou d'un `images.json`, en octets (1 Mio). */
export const MAX_READ_BYTES = 1_048_576;
/** Profondeur maximale en collections (mapping ou séquence) ; la racine compte pour 1. */
export const MAX_NESTING_DEPTH = 32;
/** Nombre maximal de nœuds d'un YAML après expansion des alias. */
export const MAX_NODES = 100_000;
/**
 * Poids maximal du texte d'un YAML après expansion des alias, en unités UTF-16 —
 * toutes les chaînes, clés comprises, chaque alias comptant pour la chaîne qu'il
 * désigne. Borne propre au plugin, plus stricte que §1.12 (qui le permet) : un
 * alias vers une chaîne ne compte que pour un nœud, et trente mille alias vers
 * une chaîne de cent mille caractères développent trois milliards de caractères
 * dans le moindre `String()` ou `JSON.stringify`. Un fichier sans alias n'en est
 * jamais touché : son texte ne dépasse pas sa taille.
 */
export const MAX_EXPANDED_TEXT = MAX_READ_BYTES;

/** Borne franchie par une structure. */
export type BoundViolation = 'depth' | 'nodes' | 'circular' | 'weight';

/** Phrase décrivant une borne franchie, pour un message de diagnostic. */
export const BOUND_MESSAGES: Readonly<Record<BoundViolation, string>> = {
  depth: `imbrication de plus de ${MAX_NESTING_DEPTH} collections`,
  nodes: `plus de ${MAX_NODES} nœuds après expansion des alias`,
  circular: 'alias circulaire',
  weight: `plus de ${MAX_EXPANDED_TEXT} caractères de texte après expansion des alias`,
};

/** Le contenu dépasse-t-il `MAX_READ_BYTES` octets UTF-8 ? */
export function exceedsReadBytes(content: Uint8Array | string): boolean {
  if (typeof content !== 'string') return content.byteLength > MAX_READ_BYTES;
  // Une unité UTF-16 pèse de 1 à 3 octets : seuls les cas intermédiaires s'encodent.
  if (content.length > MAX_READ_BYTES) return true;
  if (content.length * 3 <= MAX_READ_BYTES) return false;
  return new TextEncoder().encode(content).length > MAX_READ_BYTES;
}

/**
 * Le texte JSON dépasse-t-il `MAX_NESTING_DEPTH` niveaux d'objets et de tableaux ?
 * Lu avant `JSON.parse`, en un passage, et arrêté au premier niveau de trop.
 */
export function jsonExceedsDepth(text: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    if (inString) {
      if (char === 0x5c) i++;
      else if (char === 0x22) inString = false;
    } else if (char === 0x22) {
      inString = true;
    } else if (char === 0x7b || char === 0x5b) {
      if (++depth > MAX_NESTING_DEPTH) return true;
    } else if (char === 0x7d || char === 0x5d) {
      depth--;
    }
  }
  return false;
}

/** Options de `measureStructure`. */
export interface MeasureOptions {
  /** Plafond de nœuds ; `Infinity` pour ne borner que la profondeur (JSON). */
  readonly maxNodes?: number;
  /** Plafond du poids du texte développé (`MAX_EXPANDED_TEXT` par défaut). */
  readonly maxWeight?: number;
}

interface Measure {
  /** Nœuds de l'arbre développé : chaque scalaire (clé comprise), séquence et mapping compte pour 1. */
  readonly size: number;
  /** Collections imbriquées, lui compris ; 0 pour un scalaire. */
  readonly height: number;
  /** Longueur de toutes les chaînes de l'arbre développé, clés comprises. */
  readonly weight: number;
}

class BoundExceeded extends Error {
  constructor(readonly violation: BoundViolation) {
    super(violation);
  }
}

function isCollection(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Mesure une valeur lue — profondeur, nœuds et poids de texte de l'arbre
 * développé, alias circulaire — et rend la première borne franchie, ou `null`.
 *
 * Un lecteur YAML partage les références : un alias désigne le même objet que
 * son ancre, et la structure reste petite quand l'arbre qu'elle représente ne
 * l'est pas. Le parcours est donc mémoïsé par identité d'objet — chaque objet
 * n'est développé qu'une fois, sa taille, sa hauteur et son poids servent à
 * chaque rencontre — et s'arrête dès qu'une borne est dépassée : il ne développe
 * jamais l'arbre, et sa récursion ne dépasse pas `MAX_NESTING_DEPTH` niveaux.
 * Un objet, une date ou un binaire qui n'est ni un tableau ni un objet simple
 * est un scalaire.
 */
export function measureStructure(value: unknown, options: MeasureOptions = {}): BoundViolation | null {
  const maxNodes = options.maxNodes ?? MAX_NODES;
  const maxWeight = options.maxWeight ?? MAX_EXPANDED_TEXT;
  const measured = new Map<object, Measure>();
  const open = new Set<object>();

  const visit = (node: unknown, depth: number): Measure => {
    if (!isCollection(node)) return { size: 1, height: 0, weight: typeof node === 'string' ? node.length : 0 };
    if (open.has(node)) throw new BoundExceeded('circular');
    const known = measured.get(node);
    if (known !== undefined) {
      if (depth + known.height > MAX_NESTING_DEPTH) throw new BoundExceeded('depth');
      return known;
    }
    if (depth + 1 > MAX_NESTING_DEPTH) throw new BoundExceeded('depth');

    open.add(node);
    let size = 1;
    let height = 1;
    let weight = 0;
    const add = (child: unknown) => {
      const part = visit(child, depth + 1);
      size += part.size;
      if (size > maxNodes) throw new BoundExceeded('nodes');
      weight += part.weight;
      if (weight > maxWeight) throw new BoundExceeded('weight');
      height = Math.max(height, part.height + 1);
    };
    if (Array.isArray(node)) {
      for (const item of node) add(item);
    } else {
      for (const [key, item] of Object.entries(node)) {
        size += 1;
        weight += key.length;
        add(item);
      }
    }
    open.delete(node);

    const result: Measure = { size, height, weight };
    measured.set(node, result);
    return result;
  };

  try {
    visit(value, 0);
    return null;
  } catch (error) {
    if (error instanceof BoundExceeded) return error.violation;
    throw error;
  }
}
