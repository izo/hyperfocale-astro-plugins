/**
 * Profils de domaine standardisés en Annexe G de la spec Hyperfocale.
 *
 * Le `prefix` de chaque profil est une **recommandation** de la spec, pas une
 * obligation : §2.0.1 autorise un preset à fixer le sien. Ceux du plugin sont
 * localisés en français, ce que §0.5 de la spec reconnaît comme conforme.
 */
export type PresetName = 'series' | 'portfolio' | 'music' | 'catalog' | 'press' | 'recipe';

/**
 * Noms conservés pour ne pas casser les sites existants, mais qui ne sont pas
 * ceux de l'Annexe G. Ils résolvent vers leur profil canonique en avertissant.
 */
export type DeprecatedPresetName = 'photo';

export interface PresetConfig {
  collectionName: string;
  prefix: string;
  dateRequired: boolean;
}

export const PRESETS: Record<PresetName, PresetConfig> = {
  series:    { collectionName: 'series',   prefix: '/series',       dateRequired: true  },
  portfolio: { collectionName: 'projects', prefix: '/projets',      dateRequired: false },
  music:     { collectionName: 'albums',   prefix: '/discographie', dateRequired: true  },
  catalog:   { collectionName: 'items',    prefix: '/catalogue',    dateRequired: false },
  press:     { collectionName: 'articles', prefix: '/presse',       dateRequired: true  },
  recipe:    { collectionName: 'recipes',  prefix: '/recettes',     dateRequired: false },
};

/**
 * `photo` était le nom du profil canonique jusqu'à la 0.12.0. L'Annexe G l'a
 * standardisé sous le nom `series` ; l'ancien nom continue de fonctionner à
 * l'identique — même collection, même prefix — et sera retiré en 1.0.
 */
export const PRESET_ALIASES: Record<DeprecatedPresetName, PresetName> = {
  photo: 'series',
};

/**
 * Résout un nom de preset, alias historiques compris.
 * Retourne `undefined` pour un nom inconnu — l'intégration lève alors une
 * erreur explicite listant les valeurs acceptées.
 */
export function resolvePreset(name: PresetName | DeprecatedPresetName): PresetConfig | undefined {
  const alias = PRESET_ALIASES[name as DeprecatedPresetName];
  if (alias !== undefined) {
    console.warn(
      `[hyperfocale] Le preset "${name}" est déprécié : utilisez "${alias}", ` +
      'nom standardisé du profil (Annexe G de la spec). ' +
      'Le comportement est identique ; l\'ancien nom sera retiré en 1.0.',
    );
    return PRESETS[alias];
  }
  return PRESETS[name as PresetName];
}
