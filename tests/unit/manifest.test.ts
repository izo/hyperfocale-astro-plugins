/**
 * Manifeste d'images externalisé — spec §1.5.1 (#SPEC-002).
 *
 * Le tableau `images:` du frontmatter suppose une liste écrite à la main. Dès
 * qu'elle est générée (sync CDN, pipeline d'optimisation), l'écrire dans le
 * frontmatter mélange donnée dérivée et donnée éditoriale. Le manifeste isole
 * la première dans un `images.json` posé à côté d'`index.md`.
 *
 * Le glob Vite étant statique, la résolution des chemins relatifs (qui passe
 * par le glob de `media/`) est couverte en e2e ; ici on teste le parsing et sa
 * robustesse, seuls points vérifiables sans filesystem.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseImageManifest, classifyAttachment } from '../../src/helpers/index.js';

afterEach(() => vi.restoreAllMocks());

/** Le repli sur `media/` s'accompagne d'un avertissement — on le tait ici. */
const silenceWarn = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('parseImageManifest — formes acceptées (§1.5.1)', () => {
  it('lit la forme courte : un tableau de chaînes', () => {
    const m = parseImageManifest('{"images":["/content/bretagne/media/01.jpg","./media/02.jpg"]}');
    expect(m?.images).toEqual(['/content/bretagne/media/01.jpg', './media/02.jpg']);
  });

  it('lit la forme longue : des objets aux clés de `images:`', () => {
    const m = parseImageManifest(
      '{"images":[{"url":"https://cdn.example.com/01.jpg","alt":"Phare","width":3000,"height":2000}]}',
    );
    expect(m?.images[0]).toEqual({
      url: 'https://cdn.example.com/01.jpg',
      alt: 'Phare',
      width: 3000,
      height: 2000,
    });
  });

  it('accepte les deux formes mélangées dans un même tableau', () => {
    const m = parseImageManifest('{"images":["./media/01.jpg",{"url":"https://cdn/02.jpg"}]}');
    expect(m?.images).toHaveLength(2);
  });

  it('préserve l’ordre du tableau — aucun tri n’est appliqué', () => {
    const m = parseImageManifest('{"images":["./media/09.jpg","./media/01.jpg","./media/05.jpg"]}');
    expect(m?.images).toEqual(['./media/09.jpg', './media/01.jpg', './media/05.jpg']);
  });

  it('lit la clé `files` optionnelle', () => {
    const m = parseImageManifest('{"images":[],"files":[{"url":"https://cdn/notes.pdf","title":"Notes"}]}');
    expect(m?.files).toEqual([{ url: 'https://cdn/notes.pdf', title: 'Notes' }]);
  });

  it('omet `files` quand la clé est absente', () => {
    const m = parseImageManifest('{"images":[]}');
    expect(m).not.toHaveProperty('files');
  });
});

describe('parseImageManifest — robustesse : jamais d’échec de build (§1.5.1)', () => {
  it('retourne null sur un JSON illisible, avec avertissement', () => {
    const warn = silenceWarn();
    expect(parseImageManifest('{ images: [ // pas du JSON')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('retourne null si la clé `images` est absente', () => {
    silenceWarn();
    expect(parseImageManifest('{"files":[]}')).toBeNull();
  });

  it('retourne null si `images` n’est pas un tableau', () => {
    silenceWarn();
    expect(parseImageManifest('{"images":"01.jpg"}')).toBeNull();
  });

  it('retourne null si la racine n’est pas un objet', () => {
    silenceWarn();
    expect(parseImageManifest('["01.jpg"]')).toBeNull();
    expect(parseImageManifest('null')).toBeNull();
    expect(parseImageManifest('42')).toBeNull();
  });

  it('ne lève jamais, quelle que soit l’entrée', () => {
    silenceWarn();
    for (const raw of ['', '   ', '{', 'undefined', '{"images":null}']) {
      expect(() => parseImageManifest(raw)).not.toThrow();
    }
  });

  it('nomme le fichier fautif dans l’avertissement', () => {
    const warn = silenceWarn();
    parseImageManifest('nope', '/src/content/series/bretagne/images.json');
    expect(warn.mock.calls[0]?.[0]).toContain('/src/content/series/bretagne/images.json');
  });

  it('accepte un tableau `images` vide — une galerie vide est légitime', () => {
    expect(parseImageManifest('{"images":[]}')?.images).toEqual([]);
  });
});

describe('images.json n’est ni un média ni un document joint (§1.5.1)', () => {
  it('classifyAttachment l’écarte, comme index.md', () => {
    expect(classifyAttachment('images.json')).toBeNull();
    expect(classifyAttachment('IMAGES.JSON')).toBeNull();
    expect(classifyAttachment('media/images.json')).toBeNull();
  });

  it('mais un autre .json reste un document joint', () => {
    expect(classifyAttachment('donnees.json')).toBe('file');
  });
});
