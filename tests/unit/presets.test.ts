import { describe, it, expect } from 'vitest';
import { PRESETS, resolvePreset, type PresetName } from '../../src/presets.js';
import hyperfocale from '../../src/index.js';

describe('PRESETS — table de configuration', () => {
  it('contient exactement 6 presets', () => {
    expect(Object.keys(PRESETS)).toHaveLength(6);
  });

  it('photo : collectionName=series, prefix=/series, dateRequired=true', () => {
    expect(PRESETS.photo).toEqual({
      collectionName: 'series',
      prefix: '/series',
      dateRequired: true,
    });
  });

  it('portfolio : collectionName=projects, prefix=/projets, dateRequired=false', () => {
    expect(PRESETS.portfolio).toEqual({
      collectionName: 'projects',
      prefix: '/projets',
      dateRequired: false,
    });
  });

  it('music : collectionName=albums, prefix=/discographie, dateRequired=true', () => {
    expect(PRESETS.music).toEqual({
      collectionName: 'albums',
      prefix: '/discographie',
      dateRequired: true,
    });
  });

  it('catalog : collectionName=items, prefix=/catalogue, dateRequired=false', () => {
    expect(PRESETS.catalog).toEqual({
      collectionName: 'items',
      prefix: '/catalogue',
      dateRequired: false,
    });
  });

  it('press : collectionName=articles, prefix=/presse, dateRequired=true', () => {
    expect(PRESETS.press).toEqual({
      collectionName: 'articles',
      prefix: '/presse',
      dateRequired: true,
    });
  });

  it('recipe : collectionName=recipes, prefix=/recettes, dateRequired=false', () => {
    expect(PRESETS.recipe).toEqual({
      collectionName: 'recipes',
      prefix: '/recettes',
      dateRequired: false,
    });
  });
});

describe('resolvePreset()', () => {
  it('retourne le preset photo', () => {
    const config = resolvePreset('photo');
    expect(config.collectionName).toBe('series');
    expect(config.prefix).toBe('/series');
    expect(config.dateRequired).toBe(true);
  });

  it('retourne le preset recipe', () => {
    const config = resolvePreset('recipe');
    expect(config.collectionName).toBe('recipes');
    expect(config.prefix).toBe('/recettes');
    expect(config.dateRequired).toBe(false);
  });

  it('chaque preset retourne un objet avec les 3 clés attendues', () => {
    const names: PresetName[] = ['photo', 'portfolio', 'music', 'catalog', 'press', 'recipe'];
    for (const name of names) {
      const config = resolvePreset(name);
      expect(config).toHaveProperty('collectionName');
      expect(config).toHaveProperty('prefix');
      expect(config).toHaveProperty('dateRequired');
    }
  });

  it('le prefix commence toujours par /', () => {
    const names: PresetName[] = ['photo', 'portfolio', 'music', 'catalog', 'press', 'recipe'];
    for (const name of names) {
      expect(resolvePreset(name).prefix).toMatch(/^\//);
    }
  });
});

describe('hyperfocale() — intégration preset', () => {
  it('retourne une intégration Astro valide avec preset: photo', () => {
    const integration = hyperfocale({ preset: 'photo' });
    expect(integration.name).toBe('hyperfocale');
  });

  it('retourne une intégration Astro valide avec preset: recipe', () => {
    const integration = hyperfocale({ preset: 'recipe' });
    expect(integration.name).toBe('hyperfocale');
  });

  it('accepte preset avec surcharge d\'option explicite', () => {
    const integration = hyperfocale({ preset: 'photo', prefix: '/galeries' });
    expect(integration.name).toBe('hyperfocale');
  });

  it('lève une erreur si preset inconnu (cast JS)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => hyperfocale({ preset: 'invalid' as any })).toThrow(/preset.*invalid/i);
  });

  it('sans preset, comportement par défaut inchangé', () => {
    expect(hyperfocale().name).toBe('hyperfocale');
    expect(hyperfocale({}).name).toBe('hyperfocale');
  });
});
