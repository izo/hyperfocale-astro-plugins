import { z } from 'zod';
import type { SchemaContext } from 'astro:content';

/**
 * Options de génération du schéma series.
 */
export interface SeriesSchemaOptions {
  /**
   * Si `false`, le champ `date` est optionnel dans le schéma.
   * Utile pour des collections non temporelles (marques, produits…).
   * @default true
   */
  dateRequired?: boolean;
}

/**
 * Natures de contenu reconnues (spec §1.10).
 *
 * `section` désigne une page d'index de section — un dossier de rangement
 * (`archives/music/index.md`) qui n'est pas une série : pas de galerie, pas de
 * date, absente des listings. L'absence du champ vaut `series`, comportement
 * de tout le contenu antérieur à la v2.6.
 */
export const CONTENT_TYPES = ['series', 'section'] as const;

/** Nature d'un contenu (spec §1.10). */
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Schéma du bloc `iptc.*` (spec §1.3). */
const iptcSchema = z.looseObject({
  creator: z.string().optional(),
  credit: z.string().optional(),
  copyright: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  camera: z.string().optional(),
  lens: z.string().optional(),
  film: z.string().optional(),
  headline: z.string().optional(),
  instructions: z.string().optional(),
  source: z.string().optional(),
  gps: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

/** Schéma d'une image en mode distant (spec §1.5) — `url` requis. */
const remoteImageSchema = z.object({
  url: z.url(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/**
 * Fichier de `media/` référencé par nom — extension du plugin, hors spec §1.5.
 * Permet de curer l'ordre et les `alt` d'images locales sans passer par `image()`.
 */
const localFileImageSchema = z.object({
  file: z.string(),
  alt: z.string().optional(),
});

/**
 * Asset local déjà traité par `image()` du site consommateur — extension du
 * plugin. La valeur est l'`ImageMetadata` d'Astro, dont seule la clé `src` est
 * garantie ici : le reste (width, height, format) transite en passthrough.
 */
const localAssetImageSchema = z.object({
  src: z.looseObject({ src: z.string() }),
  alt: z.string().optional(),
});

/**
 * Une entrée de `images[]`.
 *
 * `getSeriesImages()` accepte trois formes ; le schéma n'en validait qu'une,
 * si bien qu'une entrée `{ file: '01.jpg' }` échouait à la validation Zod avant
 * d'atteindre le helper qui savait la traiter. L'union rétablit la
 * correspondance entre ce qui est validé et ce qui est réellement supporté.
 *
 * L'ordre compte : `url` d'abord (la seule forme normative, §1.5), puis les
 * deux extensions, discriminées par leur clé obligatoire.
 */
const imageEntrySchema = z.union([
  remoteImageSchema,
  localFileImageSchema,
  localAssetImageSchema,
]);

/** Classes de documents joints non-image (spec §1.9). */
export const ATTACHMENT_KINDS = ['video', 'audio', 'document', 'file'] as const;

/** Métadonnées optionnelles d'un document joint local — bloc `attachments:` (spec §1.9). */
const attachmentMetaSchema = z.object({
  file: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

/** Schéma d'un document joint en mode distant — champ `files[]` (spec §1.9). */
const remoteFileSchema = z.object({
  url: z.url(),
  title: z.string().optional(),
  kind: z.enum(ATTACHMENT_KINDS).optional(),
  size: z.number().optional(),
});

/**
 * Hébergeurs reconnus pour un contenu embarqué (spec §1.11).
 *
 * ⚠️ Liste **ouverte** : la spec la donne comme vocabulaire reconnu, pas comme
 * énumération fermée. Une plateforme absente d'ici reste licite — elle est
 * simplement traitée comme inconnue, et l'embed dégrade en lien. D'où le
 * `z.string()` du schéma plutôt qu'un `z.enum()` : rejeter une plateforme
 * inconnue ferait échouer un build sur du contenu que la spec tient pour valide.
 */
export const EMBED_PLATFORMS = [
  'vimeo',
  'youtube',
  'dailymotion',
  'soundcloud',
  'bandcamp',
  'spotify',
] as const;

/**
 * Un contenu embarqué — média hébergé par une plateforme tierce (spec §1.11).
 *
 * `url` est le seul champ requis, et c'est délibéré : il suffit à un rendu
 * valide (un lien). Construire un lecteur demande `platform` **et** `id` ; à
 * défaut on se rabat sur le lien, sans erreur.
 */
const embedSchema = z.object({
  url: z.url(),
  platform: z.string().optional(),
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  // Résolue comme une entrée de manifeste (§1.5.1) : URL absolue, chemin absolu
  // au site, ou chemin relatif à `index.md`.
  poster: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/**
 * Schéma de base sans `cover` — utilisable sans `SchemaContext` (#DATA-004).
 *
 * Permet aux sites consommateurs d'étendre le schéma sans dépendance
 * au contexte Astro :
 *
 * ```ts
 * // src/content.config.ts du site consommateur
 * import { baseSeriesSchema } from '@regrets/hyperfocale';
 *
 * export const collections = {
 *   series: defineCollection({
 *     schema: (ctx) => baseSeriesSchema({ dateRequired: false }).extend({
 *       cover: ctx.image().optional(),
 *       camera: z.string().optional(),
 *       film: z.string().optional(),
 *     }),
 *   }),
 * };
 * ```
 */
export function baseSeriesSchema(options: SeriesSchemaOptions = {}) {
  const { dateRequired = true } = options;
  const schema = z.looseObject({
    type: z.enum(CONTENT_TYPES).default('series'),
    title: z.string(),
    // `date` est déclarée optionnelle ici, puis rendue obligatoire par le
    // `check` ci-dessous : une page d'index de section (§1.10) n'est pas datée,
    // là où une série l'est. Un champ ne pouvant être requis conditionnellement
    // dans un shape Zod, l'arbitrage se fait après coup — et `.check()` survit
    // à `.extend()`, ce dont dépend l'API d'extension (#DATA-004).
    date: z.coerce.date().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    lang: z.string().optional(),
    // `published` est déprécié : `published: false` fait exactement ce que fait
    // `draft: true`, en logique inverse. La spec §0.5 le relève depuis la v2.1
    // comme « extension plugin, redondant avec `draft`, à arbitrer » ; l'arbitrage
    // est fait. Le champ reste accepté et agissant — un site qui l'emploie ne
    // casse pas — avec un avertissement au build, et sera retiré en 1.0.
    published: z.boolean().default(true),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    // Tri d'une sous-série dans le line-up de son conteneur (spec §1.8).
    // Absent, la sous-série se range par date décroissante.
    lineup_order: z.number().optional(),
    alt_description: z.string().optional(),
    private: z.boolean().default(false),
    download: z.boolean().default(false),
    iptc: iptcSchema.optional(),
    images: z.array(imageEntrySchema).optional(),
    attachments: z.array(attachmentMetaSchema).optional(),
    files: z.array(remoteFileSchema).optional(),
    // Médias hébergés chez un tiers et joués dans la page (spec §1.11). À ne pas
    // confondre avec `attachments`/`files`, qui désignent des fichiers dont on
    // sert l'octet : la frontière est l'emplacement du fichier, pas la nature
    // du média.
    embeds: z.array(embedSchema).optional(),
  });

  if (!dateRequired) return schema;

  return schema.check((ctx) => {
    if (ctx.value.type === 'section' || ctx.value.date !== undefined) return;
    ctx.issues.push({
      code: 'custom',
      path: ['date'],
      input: ctx.value.date,
      message:
        'Le champ `date` est requis pour une série. ' +
        'Une page de rangement se déclare `type: section` et n\'est alors pas datée (spec §1.10).',
    });
  });
}

/**
 * Schéma complet avec `cover` (image traitée par Astro).
 * Nécessite `SchemaContext` car `image()` est fourni par `defineCollection`.
 *
 * @example Usage standard :
 * ```ts
 * const series = defineCollection({ schema: seriesSchema });
 * ```
 *
 * @example Sans date (marques, produits) :
 * ```ts
 * const brands = defineCollection({
 *   schema: (ctx) => seriesSchema(ctx, { dateRequired: false }),
 * });
 * ```
 */
export function seriesSchema({ image }: SchemaContext, options: SeriesSchemaOptions = {}) {
  return baseSeriesSchema(options).extend({ cover: (image() as z.ZodTypeAny).optional() });
}

/**
 * Type des données d'une série (frontmatter).
 *
 * Quand `dateRequired: false` est passé à `seriesSchema()`, `date` sera `undefined`
 * pour les entrées sans date. Utilisez `SeriesDataOptionalDate` dans ce cas.
 */
export interface SeriesData {
  /** Nature du contenu (spec §1.10). Absent du frontmatter → `series`. */
  type: ContentType;
  title: string;
  date: Date;
  description?: string;
  cover?: {
    src: string;
    width: number;
    height: number;
    format: string;
  };
  location?: string;
  lang?: string;
  /**
   * @deprecated Redondant avec `draft`, en logique inverse. Utilisez `draft`,
   * que la spec standardise (§1.3). Retrait en 1.0.
   */
  published: boolean;
  draft: boolean;
  featured: boolean;
  tags: string[];
  /** Tri d'une sous-série dans le line-up de son conteneur (spec §1.8). */
  lineup_order?: number;
  alt_description?: string;
  private: boolean;
  download: boolean;
  iptc?: Record<string, unknown>;
  /**
   * Entrées de `images[]` — trois formes, cf. `imageEntrySchema` :
   * `url` (mode distant §1.5), `file` (média local par nom), `src` (asset
   * déjà traité par `image()`). Les deux dernières sont des extensions du plugin.
   */
  images?: Array<
    | { url: string; alt?: string; width?: number; height?: number }
    | { file: string; alt?: string }
    | { src: { src: string; [key: string]: unknown }; alt?: string }
  >;
  attachments?: Array<{
    file: string;
    title?: string;
    description?: string;
  }>;
  files?: Array<{
    url: string;
    title?: string;
    kind?: AttachmentKind;
    size?: number;
  }>;
}

/** Classe d'un document joint (spec §1.9). */
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * Document joint résolu — retourné par `getSeriesAttachments()` (spec §3.2).
 * `src` est un chemin relatif (mode local) ou une URL (mode distant).
 */
export interface Attachment {
  src: string;
  kind: AttachmentKind;
  title?: string;
  description?: string;
  size?: number;
}

/** Hébergeur reconnu d'un contenu embarqué — la liste reste ouverte (spec §1.11). */
export type EmbedPlatform = (typeof EMBED_PLATFORMS)[number];

/**
 * Contenu embarqué résolu — retourné par `getSeriesEmbeds()` (spec §1.11).
 *
 * `poster` est résolu : `ImageMetadata` pour un fichier de `media/` traité par
 * Astro, chaîne pour une URL distante, `undefined` si absent ou introuvable.
 * `playable` dit si un lecteur peut être construit — c'est-à-dire si `platform`
 * est connue **et** `id` présent. Faux, le consommateur rend un lien.
 */
export interface Embed {
  url: string;
  playable: boolean;
  platform?: string;
  id?: string;
  title?: string;
  description?: string;
  poster?: { src: string; width: number; height: number; format: string } | string;
  width?: number;
  height?: number;
}

/**
 * Variante de `SeriesData` pour les collections où `date` est optionnelle
 * (`dateRequired: false`).
 */
export interface SeriesDataOptionalDate extends Omit<SeriesData, 'date'> {
  date?: Date;
}

/**
 * Données d'une page d'index de section (spec §1.10).
 *
 * Une section range des séries sans en être une : `date` est sans objet, et si
 * elle est présente, aucun tri ne s'appuie dessus.
 */
export interface SectionData extends Omit<SeriesData, 'type' | 'date'> {
  type: 'section';
  date?: Date;
}
