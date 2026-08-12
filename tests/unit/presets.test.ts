import { describe, it, expect, vi, afterEach } from 'vitest';
import { PRESETS, PRESET_ALIASES, resolvePreset, type PresetName } from '../../src/presets.js';
import hyperfocale from '../../src/index.js';

// Les onze profils de l'Annexe G, dans l'ordre où elle les énumère.
const ALL_PRESETS: PresetName[] = [
  'series', 'portfolio', 'music', 'catalog', 'press', 'recipe',
  'event', 'app', 'book', 'place', 'screen',
];

describe('PRESETS — table de configuration', () => {
  it('couvre les 11 profils de l’Annexe G', () => {
    expect(Object.keys(PRESETS).sort()).toEqual([...ALL_PRESETS].sort());
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

  // G.8 déclare la date de sortie optionnelle — « démos et sorties non datées
  // restent valides ». Le preset a porté `true` de la 0.8.0 à la 0.13.0 (#62).
  it('music : collectionName=albums, prefix=/discographie, dateRequired=false', () => {
    expect(PRESETS.music).toEqual({
      collectionName: 'albums',
      prefix: '/discographie',
      dateRequired: false,
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

  // Les cinq profils que l'annexe définissait sans que le plugin les couvre (#60).
  // `collectionName` et `dateRequired` sont ceux de l'annexe ; seul le prefix est
  // localisé, comme pour les six premiers.
  it.each([
    ['event',  'events',  '/evenements',   true ],
    ['app',    'apps',    '/applications', false],
    ['book',   'books',   '/livres',       false],
    ['place',  'places',  '/lieux',        false],
    ['screen', 'screens', '/ecrans',       false],
  ] as const)(
    '%s : collectionName=%s, prefix=%s, dateRequired=%s',
    (name, collectionName, prefix, dateRequired) => {
      expect(PRESETS[name]).toEqual({ collectionName, prefix, dateRequired });
    },
  );

  it('un seul profil daté parmi les cinq ajoutés — `event`', () => {
    const dated = (['event', 'app', 'book', 'place', 'screen'] as const)
      .filter((n) => PRESETS[n].dateRequired);
    expect(dated).toEqual(['event']);
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
    for (const name of ALL_PRESETS) {
      const config = resolvePreset(name)!;
      expect(config).toHaveProperty('collectionName');
      expect(config).toHaveProperty('prefix');
      expect(config).toHaveProperty('dateRequired');
    }
  });

  it('le prefix commence toujours par /', () => {
    for (const name of ALL_PRESETS) {
      expect(resolvePreset(name)!.prefix).toMatch(/^\//);
    }
  });

  // Un prefix accentué survivrait au typecheck mais casserait les URLs générées.
  it('le prefix est un segment d’URL sûr — minuscules ASCII, sans accent', () => {
    for (const name of ALL_PRESETS) {
      expect(resolvePreset(name)!.prefix).toMatch(/^\/[a-z0-9-]+$/);
    }
  });

  it('deux presets ne partagent jamais le même prefix ni la même collection', () => {
    const prefixes = ALL_PRESETS.map((n) => PRESETS[n].prefix);
    const collections = ALL_PRESETS.map((n) => PRESETS[n].collectionName);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(new Set(collections).size).toBe(collections.length);
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
