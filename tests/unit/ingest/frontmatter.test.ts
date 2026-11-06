/** Frontmatter hostile (SEC-010, #158) : plafonds de taille et d'alias. */
import { describe, expect, it } from 'vitest';
import { MAX_FRONTMATTER_BYTES, parseFrontmatter } from '../../../src/ingest/frontmatter.js';

const doc = (yaml: string) => `---\n${yaml}\n---\ncorps\n`;

describe('parseFrontmatter — bornes', () => {
  it('lit un frontmatter ordinaire', () => {
    expect(parseFrontmatter(doc('title: T\ntags: [a, b]'))).toEqual({ status: 'ok', data: { title: 'T', tags: ['a', 'b'] } });
  });

  it('refuse un bloc de plus de 256 Kio', () => {
    const result = parseFrontmatter(doc(`title: T\nnote: "${'x'.repeat(MAX_FRONTMATTER_BYTES)}"`));
    expect(result).toMatchObject({ status: 'invalid' });
    expect((result as { reason: string }).reason).toContain('256 Kio');
  });

  it('accepte un bloc juste sous le plafond', () => {
    const result = parseFrontmatter(doc(`title: T\nnote: "${'x'.repeat(MAX_FRONTMATTER_BYTES - 100)}"`));
    expect(result.status).toBe('ok');
  });

  it('refuse une bombe d\'alias, sans lever', () => {
    const levels = ['a0: &a0 [x, x, x, x, x, x, x, x, x]'];
    for (let i = 1; i < 12; i++) levels.push(`a${i}: &a${i} [${Array(9).fill(`*a${i - 1}`).join(', ')}]`);
    expect(parseFrontmatter(doc(`title: T\n${levels.join('\n')}`)).status).toBe('invalid');
  });

  it('tolère quelques alias', () => {
    expect(parseFrontmatter(doc('title: T\nbase: &b {w: 1}\nautre: *b')).status).toBe('ok');
  });
});

describe('parseFrontmatter — clé de fusion YAML 1.1 (§1.12, §4.10 règle 6)', () => {
  // Astro lit le frontmatter avec `merge: true` : une clé `<<` y est remplacée par
  // les clés de l'ancre, que ce lecteur-ci (YAML 1.2 core) ne verrait pas. Deux
  // lecteurs divergeraient : le fichier est refusé plutôt qu'interprété.
  it.each([
    ['à la racine', 'title: T\nx: &g\n  private: true\n<<: *g'],
    ['dans un mapping imbriqué', 'title: T\nbloc:\n  g: &g {a: 1}\n  sous:\n    <<: *g'],
    ['en flux', 'title: T\ng: &g {a: 1}\nbloc: {<<: *g, b: 2}'],
    ['dans un élément de séquence', 'title: T\ng: &g {a: 1}\nliste:\n  - <<: *g\n    b: 2'],
    ['avec plusieurs ancres', 'title: T\na: &a {p: 1}\nb: &b {q: 2}\n<<: [*a, *b]'],
    ['sous une ancre réutilisée', 'title: T\ng: &g {<<: {a: 1}}\nh: *g'],
    ['entre guillemets, indiscernable une fois lu', 'title: T\ng: &g {a: 1}\n"<<": *g'],
    ['sous une clé de type, de date ou de couverture', 'title: T\ng: &g {cover: "../../x.jpg"}\ncover:\n  <<: *g'],
  ])('refuse la clé de fusion %s', (_label, yaml) => {
    expect(parseFrontmatter(doc(yaml))).toEqual({ status: 'invalid', reason: expect.stringContaining('fusion') });
  });

  it('`!!merge <<` reste illisible : étiquette inconnue', () => {
    expect(parseFrontmatter(doc('title: T\ng: &g {a: 1}\n!!merge <<: *g')).status).toBe('invalid');
  });

  it('une valeur `<<` ou un texte qui en contient n\'est pas une clé', () => {
    expect(parseFrontmatter(doc('title: "a << b"\nnote: "<<"\nliste: ["<<", x]')).status).toBe('ok');
    expect(parseFrontmatter(doc('title: T\nnote: |\n  <<: ceci est du texte\n')).status).toBe('ok');
  });

  it('les alias ordinaires restent lus', () => {
    expect(parseFrontmatter(doc('title: T\nbase: &b {w: 1}\nautre: *b'))).toEqual({
      status: 'ok',
      data: { title: 'T', base: { w: 1 }, autre: { w: 1 } },
    });
  });
});

