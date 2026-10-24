import { describe, expect, it } from 'vitest';
import {
  HF_LABELS,
  HF_DEFAULT_LOCALE,
  resolveLabels,
  formatLabel,
  pluralLabel,
  formatDate,
  formatFileSize,
} from '../../src/i18n.js';
import { headingTag, passthroughAttrs, scriptJson } from '../../src/components/runtime.js';

describe('dictionnaires livrés', () => {
  it('fr et en portent exactement les mêmes clés', () => {
    expect(Object.keys(HF_LABELS.en).sort()).toEqual(Object.keys(HF_LABELS.fr).sort());
  });

  it('les mêmes paramètres {…} dans chaque langue', () => {
    const params = (v: unknown) =>
      [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort();
    for (const key of Object.keys(HF_LABELS.fr) as Array<keyof typeof HF_LABELS.fr>) {
      expect(params(HF_LABELS.en[key]), key).toEqual(params(HF_LABELS.fr[key]));
    }
  });

  it('sont gelés', () => {
    expect(Object.isFrozen(HF_LABELS.fr)).toBe(true);
    expect(Object.isFrozen(HF_LABELS.en)).toBe(true);
  });

  it('locale par défaut : fr (comportement antérieur à 0.23.0)', () => {
    expect(HF_DEFAULT_LOCALE).toBe('fr');
    expect(resolveLabels()).toEqual(HF_LABELS.fr);
  });
});

describe('resolveLabels', () => {
  it('langue de base : en-GB → en, FR → fr', () => {
    expect(resolveLabels('en-GB')['list.empty']).toBe(HF_LABELS.en['list.empty']);
    expect(resolveLabels('FR')['list.empty']).toBe(HF_LABELS.fr['list.empty']);
  });

  it('langue sans dictionnaire : repli en', () => {
    expect(resolveLabels('ko')).toEqual(HF_LABELS.en);
  });

  it('surcharges par clé, undefined ignoré', () => {
    const labels = resolveLabels('en', { 'list.empty': 'Nothing', 'map.empty': undefined });
    expect(labels['list.empty']).toBe('Nothing');
    expect(labels['map.empty']).toBe(HF_LABELS.en['map.empty']);
  });
});

describe('formatLabel / pluralLabel', () => {
  it('remplace les paramètres, garde les inconnus', () => {
    expect(formatLabel('{a} et {b}', { a: 1 })).toBe('1 et {b}');
  });

  it('pluriel selon Intl.PluralRules', () => {
    const forms = HF_LABELS.fr['map.count'];
    expect(pluralLabel(forms, 1, 'fr', { count: 1 })).toBe('1 série géolocalisée');
    expect(pluralLabel(forms, 0, 'fr', { count: 0 })).toBe('0 série géolocalisée'); // CLDR fr : 0 → one
    expect(pluralLabel(forms, 3, 'fr', { count: 3 })).toBe('3 séries géolocalisées');
    expect(pluralLabel({ other: '{n} x' }, 1, 'en', { n: 1 })).toBe('1 x');
  });
});

describe('formatDate', () => {
  const d = new Date('2024-03-01T00:00:00Z');
  it('date longue localisée, lue en UTC', () => {
    expect(formatDate(d, 'fr')).toBe('1 mars 2024');
    expect(formatDate(d, 'en')).toBe('March 1, 2024');
    expect(formatDate(d, 'es')).toBe('1 de marzo de 2024');
    expect(formatDate(d, 'ko')).toBe('2024년 3월 1일');
  });

  it('locale invalide : repli fr, sans lever', () => {
    expect(formatDate(d, '%%')).toBe('1 mars 2024');
  });
});

describe('formatFileSize', () => {
  it('fr : o/Ko/Mo/Go, virgule décimale', () => {
    expect(formatFileSize(512, 'fr')).toBe('512 o');
    expect(formatFileSize(2048, 'fr')).toBe('2 Ko');
    expect(formatFileSize(2.5 * 1024 ** 2, 'fr')).toBe('2,5 Mo');
    expect(formatFileSize(3 * 1024 ** 3, 'fr')).toBe('3,0 Go');
  });

  it('en : B/KB/MB/GB', () => {
    expect(formatFileSize(512, 'en')).toBe('512 B');
    expect(formatFileSize(2.5 * 1024 ** 2, 'en')).toBe('2.5 MB');
  });

  it('de : unités en anglais (repli), nombre en allemand', () => {
    expect(formatFileSize(2.5 * 1024 ** 2, 'de')).toBe('2,5 MB');
  });

  it('absente, nulle ou négative : undefined', () => {
    expect(formatFileSize(undefined, 'fr')).toBeUndefined();
    expect(formatFileSize(0, 'fr')).toBeUndefined();
    expect(formatFileSize(-1, 'fr')).toBeUndefined();
  });
});

describe('outils des composants', () => {
  it('passthroughAttrs ne garde que data-* et aria-*', () => {
    expect(passthroughAttrs({ 'data-x': 1, 'aria-label': 'a', onclick: 'x', title: 't', 'data-off': false })).toEqual({
      'data-x': 1,
      'aria-label': 'a',
    });
  });

  it('headingTag borne à h1–h6', () => {
    expect(headingTag(3)).toBe('h3');
    expect(headingTag(undefined)).toBe('h2');
    expect(headingTag(9, 3)).toBe('h3');
    expect(headingTag('4')).toBe('h2');
  });

  it('scriptJson échappe < et reste parseable', () => {
    const out = scriptJson({ t: '</script>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual({ t: '</script>' });
  });
});
