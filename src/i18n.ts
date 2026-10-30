/**
 * Libellés et formats des composants (#136, lot P0).
 *
 * Module pur — ni `node:*`, ni astro, ni zod — chargeable partout : dans un
 * composant, dans un script client, dans un test. Les composants le lisent par
 * leurs props `locale` et `labels` ; un site peut aussi s'en servir pour ses
 * propres gabarits.
 *
 * Résolution d'un libellé : `labels` de l'instance → dictionnaire de la langue
 * (`en-GB` → `en`) → `en` → `fr`. Le plugin livre `fr` et `en`, complets ; une
 * autre langue (es, ja, ko…) retombe sur l'anglais pour les libellés, mais ses
 * dates, nombres et pluriels suivent bien la locale demandée (`Intl`).
 *
 * Les clés sont **stables** : renommer ou retirer une clé est un changement
 * cassant. Les valeurs sont des gabarits à paramètres `{nom}`, ou des formes
 * plurielles indexées par catégorie CLDR (`Intl.PluralRules`) — sérialisables
 * telles quelles vers le client.
 */

/** Formes plurielles d'un libellé, par catégorie CLDR. `other` est obligatoire. */
export type HfPluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

/** Niveau de titre HTML accepté par `headingLevel`. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Dictionnaire complet des libellés. Paramètres entre accolades.
 */
export interface HyperfocaleLabels {
  // ─── SeriesCard ───────────────────────────────────────────────────────
  /** `aria-label` du lien de la carte. `{title}` */
  'card.link': string;
  /** `alt` de la couverture quand l'image n'en porte pas. `{title}` */
  'card.coverAlt': string;
  /** Badge d'une série privée (`private: true`). */
  'card.locked': string;
  /** Libellé de la liste de mots-clés d'une carte. */
  'card.tags': string;

  // ─── SeriesList ───────────────────────────────────────────────────────
  /** Liste vide. */
  'list.empty': string;

  // ─── Routes injectées (series-detail, series-page) ─────────────────────
  /** Lien de retour vers la liste des séries. */
  'route.backToList': string;
  /** Numéro de page d'une série paginée. `{n}` */
  'route.page': string;
  /** Titre du bloc des sous-séries (line-up, §1.8). */
  'lineup.heading': string;
  /** Titre et description des flux de syndication (Annexe E). */
  'feed.title': string;
  'feed.description': string;

  // ─── Images (SeriesGallery, SeriesMasonry) ─────────────────────────────
  /** `alt` de repli d'une image sans texte alternatif. `{n}` (1-indexé) */
  'image.alt': string;

  // ─── SeriesGallery ────────────────────────────────────────────────────
  /** `aria-label` de la galerie. */
  'gallery.label': string;
  /** `aria-label` du bouton qui ouvre une image. `{n}` */
  'gallery.open': string;
  /** `aria-label` de la navigation de pagination. */
  'pagination.label': string;
  'pagination.prev': string;
  'pagination.next': string;
  /** `aria-label` d'un lien de page. `{n}` */
  'pagination.page': string;
  /** Trou dans la pagination (pages masquées). */
  'pagination.ellipsis': string;

  // ─── SeriesLightbox ───────────────────────────────────────────────────
  'lightbox.label': string;
  'lightbox.close': string;
  'lightbox.prev': string;
  'lightbox.next': string;
  /** `alt` de repli dans la visionneuse. `{n}`, `{total}` */
  'lightbox.imageAlt': string;
  /** Compteur visible. `{n}`, `{total}` */
  'lightbox.counter': string;

  // ─── SeriesAttachments ────────────────────────────────────────────────
  /** Titre de la section (surchargeable aussi par la prop `heading`). */
  'attachments.heading': string;
  /**
   * Nom accessible d'un lien de téléchargement (`aria-label`), quand le format
   * ou la taille sont connus. `{title}`, `{details}` (voir `attachments.linkDetails`)
   */
  'attachments.linkLabel': string;
  /** Format et taille réunis dans `{details}`, quand les deux sont connus. `{format}`, `{size}` */
  'attachments.linkDetails': string;
  /** Tailles de fichier. `{n}` est déjà formaté selon la locale. */
  'size.byte': string;
  'size.kilobyte': string;
  'size.megabyte': string;
  'size.gigabyte': string;

  // ─── SeriesEmbeds ─────────────────────────────────────────────────────
  /** Titre de la section (surchargeable aussi par la prop `heading`). */
  'embeds.heading': string;
  /** Libellé lecteur d'écran de la façade. `{label}` */
  'embeds.play': string;

  // ─── SeriesFilter ─────────────────────────────────────────────────────
  'filter.tags': string;
  /** `aria-label` des étiquettes d'une série. `{tags}` */
  'filter.tagList': string;
  'filter.year': string;
  'filter.allYears': string;
  'filter.location': string;
  'filter.locationPlaceholder': string;
  'filter.reset': string;
  /** Recherche plein texte (titre, description, lieu, mots-clés). */
  'filter.search': string;
  'filter.searchPlaceholder': string;
  'filter.collection': string;
  'filter.allCollections': string;
  'filter.visibility': string;
  'filter.visibilityAll': string;
  'filter.visibilityPublic': string;
  'filter.visibilityPrivate': string;
  /** Compteur, pluriel sur `{shown}`. `{shown}`, `{total}` */
  'filter.count': HfPluralForms;

  // ─── SeriesMap ────────────────────────────────────────────────────────
  'map.label': string;
  'map.empty': string;
  /** Résumé de la carte, pluriel sur `{count}`. */
  'map.count': HfPluralForms;
}

/** Clé de libellé. */
export type HyperfocaleLabelKey = keyof HyperfocaleLabels;

const fr: HyperfocaleLabels = {
  'card.link': 'Voir la série : {title}',
  'card.coverAlt': 'Couverture de la série {title}',
  'card.locked': 'Série privée',
  'card.tags': 'Mots-clés',
  'list.empty': 'Aucune série disponible pour le moment.',
  'route.backToList': 'Toutes les séries',
  'lineup.heading': 'Dans cette série',
  'feed.title': 'Séries',
  'feed.description': 'Les séries publiées',
  'route.page': 'Page {n}',
  'image.alt': 'Photo {n}',
  'gallery.label': 'Galerie photos',
  'gallery.open': "Ouvrir l'image {n}",
  'pagination.label': 'Pagination de la galerie',
  'pagination.prev': 'Page précédente',
  'pagination.next': 'Page suivante',
  'pagination.page': 'Page {n}',
  'pagination.ellipsis': '…',
  'lightbox.label': "Visionneuse d'images",
  'lightbox.close': 'Fermer la visionneuse',
  'lightbox.prev': 'Image précédente',
  'lightbox.next': 'Image suivante',
  'lightbox.imageAlt': 'Image {n} sur {total}',
  'lightbox.counter': '{n} / {total}',
  'attachments.heading': 'Documents',
  'attachments.linkLabel': '{title} — {details}',
  'attachments.linkDetails': '{format}, {size}',
  'size.byte': '{n} o',
  'size.kilobyte': '{n} Ko',
  'size.megabyte': '{n} Mo',
  'size.gigabyte': '{n} Go',
  'embeds.heading': 'Vidéos',
  'embeds.play': 'Lire {label}',
  'filter.tags': 'Tags',
  'filter.tagList': 'Tags : {tags}',
  'filter.year': 'Année',
  'filter.allYears': 'Toutes',
  'filter.location': 'Lieu',
  'filter.locationPlaceholder': 'Filtrer par lieu…',
  'filter.reset': 'Réinitialiser',
  'filter.search': 'Rechercher',
  'filter.searchPlaceholder': 'Titre, texte, lieu, mot-clé…',
  'filter.collection': 'Collection',
  'filter.allCollections': 'Toutes',
  'filter.visibility': 'Visibilité',
  'filter.visibilityAll': 'Toutes',
  'filter.visibilityPublic': 'Publiques',
  'filter.visibilityPrivate': 'Privées',
  'filter.count': {
    one: '{shown} série affichée sur {total}',
    other: '{shown} séries affichées sur {total}',
  },
  'map.label': 'Carte géographique des séries',
  'map.empty': 'Aucune série avec coordonnées GPS.',
  'map.count': {
    one: '{count} série géolocalisée',
    other: '{count} séries géolocalisées',
  },
};

const en: HyperfocaleLabels = {
  'card.link': 'View series: {title}',
  'card.coverAlt': 'Cover of the series {title}',
  'card.locked': 'Private series',
  'card.tags': 'Keywords',
  'list.empty': 'No series available yet.',
  'route.backToList': 'All series',
  'lineup.heading': 'In this series',
  'feed.title': 'Series',
  'feed.description': 'Published series',
  'route.page': 'Page {n}',
  'image.alt': 'Photo {n}',
  'gallery.label': 'Photo gallery',
  'gallery.open': 'Open image {n}',
  'pagination.label': 'Gallery pagination',
  'pagination.prev': 'Previous page',
  'pagination.next': 'Next page',
  'pagination.page': 'Page {n}',
  'pagination.ellipsis': '…',
  'lightbox.label': 'Image viewer',
  'lightbox.close': 'Close the viewer',
  'lightbox.prev': 'Previous image',
  'lightbox.next': 'Next image',
  'lightbox.imageAlt': 'Image {n} of {total}',
  'lightbox.counter': '{n} / {total}',
  'attachments.heading': 'Documents',
  'attachments.linkLabel': '{title} — {details}',
  'attachments.linkDetails': '{format}, {size}',
  'size.byte': '{n} B',
  'size.kilobyte': '{n} KB',
  'size.megabyte': '{n} MB',
  'size.gigabyte': '{n} GB',
  'embeds.heading': 'Videos',
  'embeds.play': 'Play {label}',
  'filter.tags': 'Tags',
  'filter.tagList': 'Tags: {tags}',
  'filter.year': 'Year',
  'filter.allYears': 'All',
  'filter.location': 'Location',
  'filter.locationPlaceholder': 'Filter by location…',
  'filter.reset': 'Reset',
  'filter.search': 'Search',
  'filter.searchPlaceholder': 'Title, text, place, keyword…',
  'filter.collection': 'Collection',
  'filter.allCollections': 'All',
  'filter.visibility': 'Visibility',
  'filter.visibilityAll': 'All',
  'filter.visibilityPublic': 'Public',
  'filter.visibilityPrivate': 'Private',
  'filter.count': {
    one: '{shown} series shown of {total}',
    other: '{shown} series shown of {total}',
  },
  'map.label': 'Map of the series',
  'map.empty': 'No series with GPS coordinates.',
  'map.count': {
    one: '{count} geotagged series',
    other: '{count} geotagged series',
  },
};

/** Dictionnaires livrés par le plugin. */
export const HF_LABELS: Readonly<Record<'fr' | 'en', Readonly<HyperfocaleLabels>>> = Object.freeze({
  fr: Object.freeze(fr),
  en: Object.freeze(en),
});

/**
 * Locale par défaut des composants : `fr`, celle de toutes les versions
 * antérieures — un site qui ne passe pas `locale` rend exactement les mêmes
 * libellés qu'avant la 0.23.0.
 */
export const HF_DEFAULT_LOCALE = 'fr';

/** Langue de base d'une étiquette BCP 47 (`en-GB` → `en`). */
function baseLanguage(locale: string): string {
  return locale.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

/**
 * Dictionnaire complet pour une locale : `overrides` → langue → `en` → `fr`.
 * Une clé de `overrides` à `undefined` est ignorée.
 */
export function resolveLabels(
  locale: string = HF_DEFAULT_LOCALE,
  overrides?: Partial<HyperfocaleLabels>,
): HyperfocaleLabels {
  const lang = baseLanguage(locale);
  const own = (HF_LABELS as Record<string, HyperfocaleLabels | undefined>)[lang];
  const merged: HyperfocaleLabels = { ...HF_LABELS.fr, ...HF_LABELS.en, ...own };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/** Remplace les paramètres `{nom}` d'un gabarit. Un paramètre absent reste tel quel. */
export function formatLabel(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Choisit la forme plurielle de `count` selon `Intl.PluralRules(locale)`, puis la formate. */
export function pluralLabel(
  forms: HfPluralForms | string,
  count: number,
  locale: string = HF_DEFAULT_LOCALE,
  params: Record<string, string | number> = {},
): string {
  if (typeof forms === 'string') return formatLabel(forms, params);
  let category: Intl.LDMLPluralRule = 'other';
  try {
    category = new Intl.PluralRules(locale).select(count);
  } catch {
    // locale invalide : `other`
  }
  return formatLabel(forms[category] ?? forms.other, params);
}

function safeLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? HF_DEFAULT_LOCALE;
  } catch {
    return HF_DEFAULT_LOCALE;
  }
}

/**
 * Date longue localisée (« 1 mars 2024 », « March 1, 2024 », « 2024年3月1日 »).
 *
 * Lue en UTC : une date de frontmatter (`2024-03-01`) devient minuit UTC, et la
 * lire dans le fuseau de la machine de build la ferait reculer d'un jour à
 * l'ouest de Greenwich.
 */
export function formatDate(
  date: Date,
  locale: string = HF_DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat(safeLocale(locale), { timeZone: 'UTC', ...options }).format(date);
}

/**
 * Taille de fichier localisée : nombre par `Intl.NumberFormat(locale)`, unité
 * par les libellés `size.*` (o/Ko/Mo/Go en français, B/KB/MB/GB en anglais).
 * Base 1024. `undefined` pour une taille absente, nulle ou négative.
 */
export function formatFileSize(
  bytes: number | undefined,
  locale: string = HF_DEFAULT_LOCALE,
  labels: Pick<HyperfocaleLabels, 'size.byte' | 'size.kilobyte' | 'size.megabyte' | 'size.gigabyte'> = resolveLabels(locale),
): string | undefined {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return undefined;
  const loc = safeLocale(locale);
  const int = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const dec = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (bytes < 1024) return formatLabel(labels['size.byte'], { n: int.format(bytes) });
  if (bytes < 1024 ** 2) return formatLabel(labels['size.kilobyte'], { n: int.format(Math.round(bytes / 1024)) });
  if (bytes < 1024 ** 3) return formatLabel(labels['size.megabyte'], { n: dec.format(bytes / 1024 ** 2) });
  return formatLabel(labels['size.gigabyte'], { n: dec.format(bytes / 1024 ** 3) });
}
