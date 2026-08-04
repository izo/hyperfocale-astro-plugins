import { describe, it, expect, vi, afterEach } from 'vitest';
import { PRESETS, PRESET_ALIASES, resolvePreset, type PresetName } from '../../src/presets.js';
import hyperfocale from '../../src/index.js';

describe('PRESETS — table de configuration', () => {
  it('contient exactement 6 presets', () => {
    expect(Object.keys(PRESETS)).toHaveLength(6);
  });

  it('series : collectionName=series, prefix=/series, dateRequired=true', () => {
    expect(PRESETS.series).toEqual({
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
  it('retourne le preset series', () => {
    const config = resolvePreset('series')!;
    expect(config.collectionName).toBe('series');
    expect(config.prefix).toBe('/series');
    expect(config.dateRequired).toBe(true);
  });

  it('retourne le preset recipe', () => {
    const config = resolvePreset('recipe')!;
    expect(config.collectionName).toBe('recipes');
    expect(config.prefix).toBe('/recettes');
    expect(config.dateRequired).toBe(false);
  });

  it('chaque preset retourne un objet avec les 3 clés attendues', () => {
    const names: PresetName[] = ['series', 'portfolio', 'music', 'catalog', 'press', 'recipe'];
    for (const name of names) {
      const config = resolvePreset(name)!;
      expect(config).toHaveProperty('collectionName');
      expect(config).toHaveProperty('prefix');
      expect(config).toHaveProperty('dateRequired');
    }
  });

  it('le prefix commence toujours par /', () => {
    const names: PresetName[] = ['series', 'portfolio', 'music', 'catalog', 'press', 'recipe'];
    for (const name of names) {
      expect(resolvePreset(name)!.prefix).toMatch(/^\//);
    }
  });
});

describe('alias déprécié `photo` → `series` (Annexe G)', () => {
  // `photo` était le nom du profil canonique avant que l'Annexe G ne le
  // standardise sous le nom `series`. Il continue de résoudre à l'identique :
  // un site existant ne doit pas casser sur un renommage de vocabulaire.
  const silenceWarn = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

  afterEach(() => vi.restoreAllMocks());

  it('résout vers exactement la même configuration que `series`', () => {
    silenceWarn();
    expect(resolvePreset('photo')).toEqual(resolvePreset('series'));
  });

  it('avertit, en nommant le remplaçant', () => {
    const warn = silenceWarn();
    resolvePreset('photo');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('series');
  });

  it('n’avertit pas sur un nom canonique', () => {
    const warn = silenceWarn();
    resolvePreset('series');
    expect(warn).not.toHaveBeenCalled();
  });

  it('reste accepté par l’intégration', () => {
    silenceWarn();
    expect(hyperfocale({ preset: 'photo' }).name).toBe('hyperfocale');
  });

  it('n’apparaît pas dans PRESETS — la table ne porte que les noms de l’annexe', () => {
    expect(Object.keys(PRESETS)).not.toContain('photo');
    expect(PRESET_ALIASES.photo).toBe('series');
  });
});

describe('hyperfocale() — intégration preset', () => {
  it('retourne une intégration Astro valide avec preset: series', () => {
    const integration = hyperfocale({ preset: 'series' });
    expect(integration.name).toBe('hyperfocale');
  });

  it('retourne une intégration Astro valide avec preset: recipe', () => {
    const integration = hyperfocale({ preset: 'recipe' });
    expect(integration.name).toBe('hyperfocale');
  });

  it('accepte preset avec surcharge d\'option explicite', () => {
    const integration = hyperfocale({ preset: 'series', prefix: '/galeries' });
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
