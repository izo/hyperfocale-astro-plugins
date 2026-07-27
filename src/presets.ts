export type PresetName = 'photo' | 'portfolio' | 'music' | 'catalog' | 'press' | 'recipe';

export interface PresetConfig {
  collectionName: string;
  prefix: string;
  dateRequired: boolean;
}

export const PRESETS: Record<PresetName, PresetConfig> = {
  photo:     { collectionName: 'series',   prefix: '/series',       dateRequired: true  },
  portfolio: { collectionName: 'projects', prefix: '/projets',      dateRequired: false },
  music:     { collectionName: 'albums',   prefix: '/discographie', dateRequired: true  },
  catalog:   { collectionName: 'items',    prefix: '/catalogue',    dateRequired: false },
  press:     { collectionName: 'articles', prefix: '/presse',       dateRequired: true  },
  recipe:    { collectionName: 'recipes',  prefix: '/recettes',     dateRequired: false },
};

export function resolvePreset(name: PresetName): PresetConfig {
  return PRESETS[name];
}
