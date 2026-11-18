/**
 * Profil Livraison (Annexe G de la spec) : sondage de notation d'une série
 * livrée à un client, et emplacement de sa réponse dans la source (§4.2,
 * `_responses/`).
 *
 * Module **pur** — ni `node:*`, ni astro, ni zod : il sert autant à la route qui
 * reçoit les notes (un Worker) qu'à l'outil qui dépose la réponse dans la source
 * (Node) et au script client du composant `SeriesPoll`.
 *
 * Ce que le plugin ne porte pas : l'authentification du client, le stockage de
 * la réponse et le refus du téléchargement tant qu'elle manque. Ils dépendent du
 * serveur du site ; la spec n'en fixe que la règle.
 */
import { HF_DEFAULT_LOCALE, formatLabel, resolveLabels, type HyperfocaleLabels } from './i18n.js';

/** Échelle du sondage : entiers, bornes comprises. Fixe (spec, profil Livraison). */
export const POLL_MIN_SCORE = 1;
export const POLL_MAX_SCORE = 5;
/** Les notes licites, dans l'ordre : `[1, 2, 3, 4, 5]`. */
export const POLL_SCORES: readonly number[] = Object.freeze(
  Array.from({ length: POLL_MAX_SCORE - POLL_MIN_SCORE + 1 }, (_, i) => POLL_MIN_SCORE + i),
);

/** Dossier réservé aux données de retour, à la racine du corpus (§4.2) — jamais dans un snapshot. */
export const RESPONSES_DIR = '_responses';

export interface PollScore {
  /** Chemin du média relatif au dossier de la série (`media/a.jpg`), comme dans `images.json`. */
  file: string;
  score: number;
}

/** Réponse d'un sondage, version 1. */
export interface PollDocument {
  version: 1;
  /** Chemin de la série dans le corpus. */
  series: string;
  /** Premier envoi (ISO 8601, UTC). */
  submitted_at: string;
  /** Dernier envoi : une réponse se remplace. */
  updated_at: string;
  /** Une note par image, dans l'ordre de la galerie. */
  scores: PollScore[];
}

/** Ce qu'une série déclare dans son bloc `delivery:`. */
export interface Delivery {
  download: boolean;
  poll: boolean;
}

/**
 * Bloc `delivery:` d'un frontmatter. Seul un **booléen** `true` active un champ :
 * une chaîne (`"true"`, `yes`) ne vaut pas `true` — même rigueur que `private`
 * (§1.12). Bloc absent ou mal formé : tout à `false`.
 */
export function readDelivery(frontmatter: unknown): Delivery {
  const block =
    frontmatter && typeof frontmatter === 'object' ? (frontmatter as Record<string, unknown>)['delivery'] : undefined;
  const data = block && typeof block === 'object' && !Array.isArray(block) ? (block as Record<string, unknown>) : {};
  return { download: data['download'] === true, poll: data['poll'] === true };
}

/** `_responses/<série>/poll.json` — où la réponse d'une série se dépose dans la source. */
export function pollResponsePath(series: string): string {
  return `${RESPONSES_DIR}/${series}/poll.json`;
}

/** `_responses/<série>/poll.md` — rendu lisible facultatif, à côté du document. */
export function pollReportPath(series: string): string {
  return `${RESPONSES_DIR}/${series}/poll.md`;
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= POLL_MIN_SCORE && value <= POLL_MAX_SCORE;
}

/**
 * Valide les notes reçues contre les images de la série : une note entière de 1
 * à 5 pour **chaque** image, et rien d'autre. Rend les notes dans l'ordre de
 * `files`, ou `null` si l'envoi est incomplet ou invalide.
 *
 * `input` vient du réseau : seules ses propriétés propres sont lues
 * (`__proto__`, `constructor` ne sont pas des notes).
 */
export function validateScores(files: readonly string[], input: unknown): PollScore[] | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (files.length === 0) return null;
  const given = input as Record<string, unknown>;
  if (Object.keys(given).length !== files.length) return null;
  const scores: PollScore[] = [];
  for (const file of files) {
    const score = Object.prototype.hasOwnProperty.call(given, file) ? given[file] : undefined;
    if (!isScore(score)) return null;
    scores.push({ file, score });
  }
  return scores.length === new Set(files).size ? scores : null;
}

/** Document à enregistrer ; la date du premier envoi (`previous`) est conservée. */
export function buildPollDocument(
  series: string,
  scores: PollScore[],
  previous: PollDocument | null = null,
  now: Date = new Date(),
): PollDocument {
  const iso = now.toISOString();
  return { version: 1, series, submitted_at: previous?.submitted_at ?? iso, updated_at: iso, scores };
}

/** Lit un document enregistré ; `null` s'il n'a pas la forme de la version 1. */
export function parsePollDocument(raw: string): PollDocument | null {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object') return null;
  const d = doc as Record<string, unknown>;
  if (d['version'] !== 1 || typeof d['series'] !== 'string') return null;
  if (typeof d['submitted_at'] !== 'string' || typeof d['updated_at'] !== 'string') return null;
  const scores = d['scores'];
  if (!Array.isArray(scores)) return null;
  for (const s of scores) {
    if (!s || typeof s !== 'object') return null;
    const entry = s as Record<string, unknown>;
    if (typeof entry['file'] !== 'string' || !isScore(entry['score'])) return null;
  }
  return doc as PollDocument;
}

/** Notes d'un document, par fichier — la forme qu'attend le formulaire. */
export function scoresByFile(doc: PollDocument): Record<string, number> {
  return Object.fromEntries(doc.scores.map((s) => [s.file, s.score]));
}

export interface RenderPollOptions {
  /** Titre de la série. Défaut : son chemin. */
  title?: string;
  locale?: string;
  labels?: Partial<HyperfocaleLabels>;
}

/**
 * La réponse en markdown lisible : images classées de la mieux à la moins bien
 * notée (à égalité, par chemin). C'est le `poll.md` qu'un outil PEUT déposer à
 * côté de `poll.json`.
 */
export function renderPoll(doc: PollDocument, options: RenderPollOptions = {}): string {
  const labels = resolveLabels(options.locale ?? HF_DEFAULT_LOCALE, options.labels);
  const ranked = [...doc.scores].sort((a, b) => b.score - a.score || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const date = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;
  const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  return [
    `# ${formatLabel(labels['poll.reportTitle'], { title: options.title ?? doc.series })}`,
    '',
    `- ${labels['poll.reportSeries']} : \`${doc.series}\``,
    `- ${labels['poll.reportSubmitted']} : ${date(doc.submitted_at)}`,
    ...(doc.updated_at !== doc.submitted_at ? [`- ${labels['poll.reportUpdated']} : ${date(doc.updated_at)}`] : []),
    '',
    `| ${labels['poll.reportScore']} | ${labels['poll.reportFile']} |`,
    '| :-: | --- |',
    ...ranked.map((s) => `| ${s.score} / ${POLL_MAX_SCORE} | ${cell(s.file.replace(/^media\//, ''))} |`),
    '',
  ].join('\n');
}
