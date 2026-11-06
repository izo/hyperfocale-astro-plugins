/**
 * Annexe A — bornes d'`iptc.gps` et code pays ISO 3166-1 d'`iptc.country_code`.
 * Le §4.10 ne code ni l'un ni l'autre : le schéma du build les porte, et
 * `validate --astro-schema` les rend en `x-schema-invalid`.
 */
import { describe, expect, it } from 'vitest';
import { baseSeriesSchema } from '../../src/schema.js';
import { ISO_COUNTRY_CODE_COUNT, isIsoCountryCode } from '../../src/iso-countries.js';

const schema = baseSeriesSchema({ dateRequired: false });
const parse = (iptc: unknown) => schema.safeParse({ title: 'T', iptc });
const issuePaths = (iptc: unknown) => {
  const result = parse(iptc);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('iptc.gps — bornes de l\'Annexe A', () => {
  it.each([
    [0, 0],
    [90, 180],
    [-90, -180],
    [48.58, -4.5],
    [89.99, 179.99],
  ])('lat %s, lng %s est admis', (lat, lng) => {
    expect(parse({ gps: { lat, lng } }).success).toBe(true);
  });

  it.each([
    [90.01, 0],
    [-90.01, 0],
    [91, 0],
    [999, 0],
    [0, 180.01],
    [0, -180.01],
    [0, 181],
    [0, 360],
  ])('lat %s, lng %s est refusé', (lat, lng) => {
    expect(parse({ gps: { lat, lng } }).success).toBe(false);
  });

  it('l\'erreur désigne la coordonnée fautive, et chacune seulement', () => {
    expect(issuePaths({ gps: { lat: 91, lng: 0 } })).toEqual(['iptc.gps.lat']);
    expect(issuePaths({ gps: { lat: 0, lng: 181 } })).toEqual(['iptc.gps.lng']);
    expect(issuePaths({ gps: { lat: 91, lng: 181 } })).toEqual(['iptc.gps.lat', 'iptc.gps.lng']);
  });

  it('latitude et longitude permutées : la longitude de Paris n\'est pas une latitude de 150°', () => {
    expect(parse({ gps: { lat: 2.35, lng: 48.85 } }).success).toBe(true);
    expect(parse({ gps: { lat: 151.2, lng: -33.9 } }).success).toBe(false);
  });

  it('ni nombre non fini, ni chaîne, ni valeur absente ne contournent les bornes', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '91', '48.5', null]) {
      expect(parse({ gps: { lat: bad, lng: 0 } }).success, String(bad)).toBe(false);
      expect(parse({ gps: { lat: 0, lng: bad } }).success, String(bad)).toBe(false);
    }
    expect(parse({ gps: { lat: 0 } }).success).toBe(false);
  });

  it('gps reste facultatif', () => {
    expect(parse({}).success).toBe(true);
    expect(parse({ gps: undefined }).success).toBe(true);
  });
});

describe('iptc.country_code — ISO 3166-1 alpha-2', () => {
  it.each(['FR', 'GB', 'US', 'CI', 'NA', 'AX', 'BQ', 'SS', 'ZW'])('%s est admis', (code) => {
    expect(parse({ country_code: code }).success).toBe(true);
  });

  it.each([
    ['minuscules', 'fr'],
    ['casse mêlée', 'Fr'],
    ['espace initiale', ' FR'],
    ['espace finale', 'FR '],
    ['saut de ligne final', 'FR\n'],
    ['espace interne', 'F R'],
    ['alpha-3', 'FRA'],
    ['numérique', '250'],
    ['une lettre', 'F'],
    ['vide', ''],
    ['forme sans attribution', 'XX'],
    ['utilisateur', 'ZZ'],
    ['Royaume-Uni en usage courant, la norme dit GB', 'UK'],
    ['réservé par exception', 'EU'],
    ['Kosovo, hors norme', 'XK'],
    ['Nations unies', 'UN'],
    ['Yougoslavie, retirée', 'YU'],
    ['pleine chasse', 'ＦＲ'],
    ['lettres accentuées', 'FÉ'],
  ])('%s : %j est refusé', (_label, code) => {
    expect(parse({ country_code: code }).success).toBe(false);
  });

  it('seul le texte est jugé : une valeur qui n\'est pas une chaîne reste refusée', () => {
    for (const bad of [33, null, ['FR'], { code: 'FR' }, true]) {
      expect(parse({ country_code: bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('le champ reste facultatif et les autres clés d\'iptc passent toujours', () => {
    expect(parse({ country: 'France' }).success).toBe(true);
    expect(parse({ country: 'France', country_code: 'FR', custom: { a: 1 } }).success).toBe(true);
  });

  it('un message dit ce qui est attendu', () => {
    const result = parse({ country_code: 'fr' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('ISO 3166-1');
  });
});

describe('liste des codes pays', () => {
  it('compte les 249 codes attribués, chacun accepté par isIsoCountryCode', () => {
    expect(ISO_COUNTRY_CODE_COUNT).toBe(249);
    let accepted = 0;
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        if (isIsoCountryCode(String.fromCharCode(a, b))) accepted++;
      }
    }
    expect(accepted).toBe(249);
  });

  it('ne contient aucun code que l\'ICU de Node ignore (une coquille y laisserait un code fictif)', () => {
    const names = new Intl.DisplayNames('en', { type: 'region', fallback: 'none' });
    expect(names.of('FR')).toBe('France');
    const unknown: string[] = [];
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        if (isIsoCountryCode(code) && names.of(code) === undefined) unknown.push(code);
      }
    }
    expect(unknown).toEqual([]);
  });
});
