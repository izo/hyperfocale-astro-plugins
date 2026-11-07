/**
 * Formes admises d'un champ d'URL et références de fichiers sûres (spec §1.12,
 * « Schémas d'URL » et « Références de fichiers »).
 *
 * Du texte seulement, sans aucun import : le schéma Zod (que charge
 * l'intégration), le résolveur de médias et la validation d'ingestion jugent une
 * valeur de la même façon. La valeur se lit telle qu'écrite : jamais décodée
 * (`%2e` n'est pas un point) ni normalisée avant le contrôle.
 */

/** U+0000–U+001F et U+007F. */
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HTTP_SCHEME = /^https?:/i;
const ENCODED_SEPARATOR = /%(?:2e|2f|5c)/i;

/**
 * Code de diagnostic qu'une valeur refusée appelle : `url-scheme-forbidden`
 * (§4.10, règle 15) ou `reference-unsafe` (règle 17). Jamais les deux.
 */
export type UrlFieldProblem = 'url-scheme-forbidden' | 'reference-unsafe';

/** Options de `urlFieldProblem` et `referenceProblem`. */
export interface UrlFieldOptions {
  /** `embeds[].url` : un embed désigne un hébergeur, seule la forme `http(s):` est admise. */
  readonly httpOnly?: boolean;
  /**
   * La référence relative, résolue depuis le dossier du fichier qui l'écrit,
   * sort-elle de la racine du corpus ? Fourni par l'appelant qui connaît ce
   * dossier ; sans lui, seul le texte de la valeur est jugé.
   */
  readonly escapesRoot?: (reference: string) => boolean;
}

/**
 * La valeur comme un navigateur la lit avant d'y chercher un schéma : les
 * caractères de contrôle ne comptent pas (`java<tab>script:` est un
 * `javascript:`), pas plus que les espaces de tête et de queue.
 */
function browserView(value: string): string {
  const text = value.replace(CONTROL_CHARS, '');
  // Balayage linéaire : `/^ +| +$/g` reculait en temps quadratique sur une longue
  // suite d'espaces suivie d'un autre caractère (200 000 espaces : 27 s).
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) === 0x20) start++;
  while (end > start && text.charCodeAt(end - 1) === 0x20) end--;
  return text.slice(start, end);
}

/** La valeur porte-t-elle un schéma, ou commence-t-elle par `/` — sous la lecture d'un navigateur ? */
function isNotRelative(value: string): boolean {
  const read = browserView(value);
  return read.startsWith('/') || SCHEME.test(read);
}

/**
 * Une référence relative est-elle non sûre dans son texte (§1.12, *Forme
 * sûre*) ? `\` — un lecteur Windows y lit une remontée —, caractère de
 * contrôle, ou `%2e`, `%2f`, `%5c` (casse ignorée).
 */
export function isUnsafeReferenceText(reference: string): boolean {
  return reference.includes('\\') || CONTROL_CHAR.test(reference) || ENCODED_SEPARATOR.test(reference);
}

/**
 * Verdict §1.12 sur une référence de fichier : `reference-unsafe` si la valeur
 * est relative et non sûre — par son texte, ou parce que `escapesRoot` la dit
 * sortir de la racine —, `null` sinon. Une valeur qui porte un schéma ou
 * commence par `/` n'est pas relative : elle relève de `urlFieldProblem`.
 */
export function referenceProblem(
  value: string,
  escapesRoot?: UrlFieldOptions['escapesRoot'],
): 'reference-unsafe' | null {
  if (value === '' || isNotRelative(value)) return null;
  return isUnsafeReferenceText(value) || escapesRoot?.(value) === true ? 'reference-unsafe' : null;
}

/**
 * Verdict §1.12 sur la valeur d'un champ d'URL du core (`cover`, `images[].url`,
 * `files[].url`, `embeds[].url`, `embeds[].poster`) : `null` si elle a une forme
 * admise, sinon le code qui la refuse. Liste blanche, jamais liste noire.
 *
 * Formes admises : un chemin relatif sûr, un chemin absolu au site (un seul `/`
 * initial, sans `\`), une URL de schéma `http:` ou `https:` (casse ignorée).
 * Refusés : tout autre schéma (`javascript:`, `data:`, `file:`, `mailto:`…),
 * `//hôte`, un chemin absolu qui contient `\`, une valeur qui contient un
 * caractère de contrôle ou commence par une espace.
 *
 * Une valeur relative non sûre rend `reference-unsafe` et non
 * `url-scheme-forbidden`, pour qu'un seul diagnostic la désigne ; une valeur que
 * la lecture d'un navigateur ferait porter un schéma ou commencer par `/`
 * (`<tab>javascript:`, `<tab>//hôte`) est jugée comme telle. Une valeur vide
 * n'est pas concernée.
 */
export function urlFieldProblem(value: string, options: UrlFieldOptions = {}): UrlFieldProblem | null {
  if (value === '') return null;
  if (isNotRelative(value)) {
    if (CONTROL_CHAR.test(value) || value.startsWith(' ')) return 'url-scheme-forbidden';
    if (value.startsWith('/')) {
      return options.httpOnly === true || value.startsWith('//') || value.includes('\\') ? 'url-scheme-forbidden' : null;
    }
    return HTTP_SCHEME.test(value) ? null : 'url-scheme-forbidden';
  }
  if (options.httpOnly === true) return 'url-scheme-forbidden';
  const unsafe = referenceProblem(value, options.escapesRoot);
  if (unsafe !== null) return unsafe;
  return value.startsWith(' ') ? 'url-scheme-forbidden' : null;
}

const EMBED_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Un identifiant d'embed peut-il entrer dans une URL de lecture (§1.12,
 * *Identifiants d'embed*) ? Seuls `A-Z a-z 0-9 _ -`, de 1 à 128 caractères : tout
 * autre texte (séparateur, `%`, espace, saut de ligne, caractère non ASCII)
 * oblige l'adaptateur à se rabattre sur le lien.
 */
export function isEmbedId(id: unknown): id is string {
  return typeof id === 'string' && EMBED_ID.test(id);
}
