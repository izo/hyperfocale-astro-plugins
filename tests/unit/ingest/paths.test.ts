import { describe, expect, it } from 'vitest';
import {
  classifyPath,
  collisionKey,
  compareCanonical,
  isExcluded,
  isIndexFile,
  normalizePath,
} from '../../../src/ingest/index.js';

describe('normalizePath (§2.1)', () => {
  it('normalise en NFC et accepte un chemin relatif ordinaire', () => {
    const nfd = 'archives/e\u0301te\u0301-2024/index.md';
    expect(normalizePath(nfd)).toEqual({ path: 'archives/été-2024/index.md', valid: true });
  });

  it('préserve la casse', () => {
    expect(normalizePath('Archives/Foo.JPG').path).toBe('Archives/Foo.JPG');
  });

  it.each([
    ['', 'vide'],
    ['/archives/a.md', 'slash initial'],
    ['archives/', 'slash final'],
    ['archives//a.md', 'segment vide'],
    ['./a.md', 'segment .'],
    ['a/../b.md', 'segment ..'],
    ['a\\b.md', 'barre oblique inverse'],
    ['a/b\u0000.md', 'NUL'],
    ['a/b\u001f.md', 'U+001F'],
    ['a/b\u007f.md', 'DEL'],
    ['a/Icon\r', 'retour chariot'],
  ])('rejette %j (%s)', (input) => {
    const result = normalizePath(input);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTypeOf('string');
  });

  it('accepte un segment qui contient des points sans en être un', () => {
    expect(normalizePath('a/..b/c..d/.e').valid).toBe(true);
  });
});

describe('classifyPath (§2.3)', () => {
  it('images.json → derived, même sous media/', () => {
    expect(classifyPath('archives/foo/images.json')).toBe('derived');
    expect(classifyPath('archives/foo/media/images.json')).toBe('derived');
    expect(classifyPath('images.json')).toBe('derived');
  });

  it('parent immédiat media → media, avant l\'extension', () => {
    expect(classifyPath('archives/foo/media/01.jpg')).toBe('media');
    expect(classifyPath('archives/foo/media/notes.md')).toBe('media');
    expect(classifyPath('media/01.jpg')).toBe('media');
  });

  it('un média imbriqué n\'est plus de classe media', () => {
    expect(classifyPath('archives/foo/media/sub/01.jpg')).toBe('other');
  });

  it('.md / .mdx insensible à la casse → content', () => {
    expect(classifyPath('archives/foo/index.md')).toBe('content');
    expect(classifyPath('archives/foo/INDEX.MDX')).toBe('content');
    expect(classifyPath('pages/about.Md')).toBe('content');
  });

  it('sinon → other', () => {
    expect(classifyPath('archives/foo/cover.jpg')).toBe('other');
    expect(classifyPath('README')).toBe('other');
  });
});

describe('isExcluded (§2.2)', () => {
  it.each(['.DS_Store', 'archives/.git/config', 'archives/foo/media/._01.jpg', 'a/.gitkeep', '.dropbox'])(
    'exclut %j (segment en point)',
    (path) => expect(isExcluded(path)).toBe(true),
  );

  it.each(['a/Thumbs.db', 'desktop.ini', 'a/b/Icon\r'])('exclut le basename %j', (path) => {
    expect(isExcluded(path)).toBe(true);
  });

  it('n\'exclut pas un fichier ordinaire ni un point interne', () => {
    expect(isExcluded('archives/foo/index.md')).toBe(false);
    expect(isExcluded('archives/v1.2/index.md')).toBe(false);
    expect(isExcluded('a/Icon')).toBe(false);
  });

  it('applique les règles du consumer : segment de dossier, segment quelconque, RegExp, prédicat', () => {
    expect(isExcluded('archives/_todo/a.md', ['_todo/'])).toBe(true);
    expect(isExcluded('archives/_todo', ['_todo/'])).toBe(false);
    expect(isExcluded('archives/_todo', ['_todo'])).toBe(true);
    expect(isExcluded('archives/foo/a.tmp', [/\.tmp$/])).toBe(true);
    expect(isExcluded('archives/foo/a.jpg', [(p) => p.startsWith('archives/')])).toBe(true);
    expect(isExcluded('archives/foo/a.jpg', ['_todo/', /\.tmp$/])).toBe(false);
  });

  it('une RegExp globale ne garde pas d\'état entre deux appels', () => {
    const rule = /\.tmp$/g;
    expect(isExcluded('a.tmp', [rule])).toBe(true);
    expect(isExcluded('b.tmp', [rule])).toBe(true);
  });
});

describe('compareCanonical (§2.1)', () => {
  it('trie par octets UTF-8, pas par unités UTF-16', () => {
    const emoji = '\u{1F600}'; // U+1F600 : F0 9F 98 80
    const fullwidth = '～'; // U+FF5E : EF BD 9E
    // UTF-16 : D83D < FF5E ; UTF-8 : F0 > EF.
    expect(emoji < fullwidth).toBe(true);
    expect(compareCanonical(emoji, fullwidth)).toBe(1);
    expect(compareCanonical(fullwidth, emoji)).toBe(-1);
  });

  it('majuscules avant minuscules, préfixe avant extension, pas de collation', () => {
    expect(['b', 'a/b', 'B', 'a', 'é', 'a-b'].sort(compareCanonical)).toEqual(['B', 'a', 'a-b', 'a/b', 'b', 'é']);
    expect(compareCanonical('abc', 'abc')).toBe(0);
  });

  it('coïncide avec la comparaison des octets UTF-8', () => {
    const words = ['z', 'Z', 'é', 'e\u0301', '\u{1F600}', '～', 'a/b', 'a.b', 'a-b', ''];
    const byBytes = [...words].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    expect([...words].sort(compareCanonical)).toEqual(byBytes);
  });
});

describe('collisionKey et isIndexFile', () => {
  it('replie la casse et la forme Unicode', () => {
    expect(collisionKey('Archives/É.md')).toBe(collisionKey('archives/e\u0301.MD'));
  });

  it.each(['index.md', 'index.mdx', 'index.en.md', 'index.pt-BR.md'])('%s est un fichier index', (name) => {
    expect(isIndexFile(name)).toBe(true);
  });

  it.each(['index.en.mdx', 'index.EN.md', 'index.english.md', 'Index.md', 'index.pt-br.md', 'README.md'])(
    '%s n\'est pas un fichier index',
    (name) => expect(isIndexFile(name)).toBe(false),
  );
});
