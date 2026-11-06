/**
 * §1.12 — formes admises d'un champ d'URL et références de fichiers sûres.
 * Les contournements classiques d'une liste noire : casse du schéma, espace ou
 * caractère de contrôle qu'un navigateur ignore, `//hôte`, antislash, `%2e`.
 */
import { describe, expect, it } from 'vitest';
import { isEmbedId, isUnsafeReferenceText, referenceProblem, urlFieldProblem } from '../../src/url-forms.js';

const SCHEME = 'url-scheme-forbidden';
const UNSAFE = 'reference-unsafe';

describe('urlFieldProblem — formes admises', () => {
  it.each([
    'https://cdn.example.com/a.jpg',
    'http://cdn.example.com/a.jpg',
    'HTTPS://cdn.example.com/a.jpg',
    'Http://cdn.example.com/a.jpg',
    '/content/a/media/01.jpg',
    '/',
    './media/01.jpg',
    'media/01.jpg',
    '../autre/media/01.jpg',
    'media/ma photo.jpg',
    'media/photo.jpg?v=2#haut',
    'media/été.jpg',
  ])('%j est admis', (value) => {
    expect(urlFieldProblem(value)).toBeNull();
  });

  it('une valeur vide n\'est pas concernée', () => {
    expect(urlFieldProblem('')).toBeNull();
    expect(referenceProblem('')).toBeNull();
  });
});

describe('urlFieldProblem — schémas refusés (liste blanche)', () => {
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'jAvAsCrIpT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'DATA:image/svg+xml;base64,AAAA',
    'file:///etc/passwd',
    'FILE:///etc/passwd',
    'vbscript:msgbox(1)',
    'blob:https://a.example/uuid',
    'ftp://a.example/x.jpg',
    'mailto:a@b.example',
    'tel:+33100000000',
    'ws://a.example/',
    'x-custom+scheme.v2:payload',
    'c:\\windows\\x.jpg',
    'a:b',
  ])('%j', (value) => {
    expect(urlFieldProblem(value)).toBe(SCHEME);
  });

  it('un nom sans deux-points n\'est pas un schéma', () => {
    expect(urlFieldProblem('https')).toBeNull();
    expect(urlFieldProblem('javascript')).toBeNull();
  });

  it('un schéma qui ressemble à http sans l\'être est refusé', () => {
    for (const value of ['httpx://a.example/x', 'http+evil://a.example/x', 'xhttp://a.example/x', 'https-://a.example/x']) {
      expect(urlFieldProblem(value), value).toBe(SCHEME);
    }
  });
});

describe('urlFieldProblem — contournements : ce qu\'un navigateur ignore avant de lire le schéma', () => {
  it.each([
    [' javascript:alert(1)', 'espace initiale'],
    ['   javascript:alert(1)', 'espaces initiales'],
    ['\tjavascript:alert(1)', 'tabulation initiale'],
    ['\njavascript:alert(1)', 'saut de ligne initial'],
    ['\u0001javascript:alert(1)', 'contrôle initial'],
    ['\u0000javascript:alert(1)', 'NUL initial'],
    ['java\tscript:alert(1)', 'tabulation dans le schéma'],
    ['java\nscript:alert(1)', 'saut de ligne dans le schéma'],
    ['java\rscript:alert(1)', 'retour chariot dans le schéma'],
    ['java\u0000script:alert(1)', 'NUL dans le schéma'],
    ['javascript\t:alert(1)', 'tabulation avant les deux-points'],
    ['\u007fjavascript:alert(1)', 'DEL initial'],
    [' \t javascript:alert(1)', 'mélange d\'espaces et de contrôles'],
    ['\tJaVaScRiPt:alert(1)', 'casse mixte et tabulation'],
    ['data\t:text/html,x', 'data: coupé'],
    [' https://a.example/x.jpg', 'espace initiale devant un http licite'],
    ['\thttps://a.example/x.jpg', 'tabulation initiale devant un http licite'],
    ['https://a.example/\u0000x.jpg', 'NUL dans une URL http'],
    ['https://a.example/x\n.jpg', 'saut de ligne dans une URL http'],
  ])('%j (%s)', (value) => {
    expect(urlFieldProblem(value)).toBe(SCHEME);
  });

  it('la valeur se lit telle qu\'écrite : une entité ou un pourcent-encodage du schéma n\'est pas décodé', () => {
    // Relatifs, donc jugés comme des références — et rien n'y est un séparateur encodé.
    expect(urlFieldProblem('javascript&colon;alert(1)')).toBeNull();
    expect(urlFieldProblem('javascript%3Aalert(1)')).toBeNull();
    expect(urlFieldProblem('%252e%252e/x.jpg')).toBeNull();
  });
});

describe('urlFieldProblem — `//hôte` et antislash', () => {
  it.each([
    '//evil.example/x.jpg',
    '//evil.example',
    '///evil.example/x.jpg',
    '\t//evil.example/x.jpg',
    ' //evil.example/x.jpg',
    '/\\evil.example/x.jpg',
    '/content/a\\b.jpg',
    '/content\\..\\..\\x.jpg',
    '/\\',
  ])('chemin absolu %j refusé', (value) => {
    expect(urlFieldProblem(value)).toBe(SCHEME);
  });

  it('un chemin absolu qui contient `..` ou `%2e` reste un chemin absolu au site (règle 15, pas 17)', () => {
    expect(urlFieldProblem('/content/../x.jpg')).toBeNull();
    expect(urlFieldProblem('/content/%2e%2e/x.jpg')).toBeNull();
  });
});

describe('urlFieldProblem — références relatives non sûres (règle 17)', () => {
  it.each([
    ['..\\..\\x.pdf', 'antislash'],
    ['.\\media\\01.jpg', 'antislashs'],
    ['media\\01.jpg', 'un antislash'],
    ['\\\\evil\\share\\x.jpg', 'chemin UNC'],
    ['\\evil.example/x.jpg', 'antislash initial'],
    ['./media/%2e%2e/%2e%2e/secret.jpg', '%2e'],
    ['./media/%2E%2E/secret.jpg', '%2E'],
    ['./media/%2e./secret.jpg', '%2e mélangé à un point'],
    ['./media/..%2fsecret.jpg', '%2f'],
    ['./media/..%2Fsecret.jpg', '%2F'],
    ['./media/..%5csecret.jpg', '%5c'],
    ['./media/..%5Csecret.jpg', '%5C'],
    ['./media/01%2ejpg', '%2e dans un nom'],
    ['./media/a\u0000b.jpg', 'octet NUL'],
    ['./media/a\u0001b.jpg', 'contrôle'],
    ['./media/a\tb.jpg', 'tabulation'],
    ['./media/a\nb.jpg', 'saut de ligne'],
    ['./media/a\u007fb.jpg', 'DEL'],
    ['\t./media/01.jpg', 'tabulation initiale devant un relatif'],
    ['./media/01.jpg\n', 'saut de ligne final'],
  ])('%j (%s)', (value) => {
    expect(urlFieldProblem(value)).toBe(UNSAFE);
    expect(referenceProblem(value)).toBe(UNSAFE);
    expect(isUnsafeReferenceText(value)).toBe(true);
  });

  it('une valeur relative qui porte un caractère de contrôle est une référence non sûre, jamais les deux diagnostics', () => {
    expect(urlFieldProblem('./media/a\u0000b.jpg')).toBe(UNSAFE);
  });

  it('comparaison sans décodage : `%25` n\'est pas un séparateur', () => {
    for (const value of ['./media/%252e%252e/x.jpg', './media/%25.jpg', './media/100%.jpg', './media/%2.jpg', './media/%e2.jpg']) {
      expect(urlFieldProblem(value), value).toBeNull();
      expect(isUnsafeReferenceText(value), value).toBe(false);
    }
  });

  it('la sortie de la racine dépend de l\'appelant, qui connaît le dossier de l\'index', () => {
    const escapesRoot = (reference: string) => reference.startsWith('../../');
    expect(urlFieldProblem('../../x.jpg', { escapesRoot })).toBe(UNSAFE);
    expect(urlFieldProblem('../x.jpg', { escapesRoot })).toBeNull();
    expect(urlFieldProblem('../../x.jpg')).toBeNull();
    expect(referenceProblem('../../x.jpg', escapesRoot)).toBe(UNSAFE);
  });

  it('`escapesRoot` ne juge que les valeurs relatives', () => {
    const escapesRoot = () => true;
    expect(urlFieldProblem('https://a.example/x.jpg', { escapesRoot })).toBeNull();
    expect(urlFieldProblem('/content/x.jpg', { escapesRoot })).toBeNull();
    expect(referenceProblem('https://a.example/x.jpg', escapesRoot)).toBeNull();
  });

  it('une espace initiale devant un relatif sûr relève de la règle 15 : le texte n\'est pas une référence', () => {
    expect(urlFieldProblem(' ./media/01.jpg')).toBe(SCHEME);
    expect(referenceProblem(' ./media/01.jpg')).toBeNull();
  });
});

describe('urlFieldProblem — embeds[].url (httpOnly)', () => {
  it.each(['https://vimeo.com/1', 'HTTP://vimeo.com/1'])('%j est admis', (value) => {
    expect(urlFieldProblem(value, { httpOnly: true })).toBeNull();
  });

  it.each(['/embed/1', './video.mp4', 'video.mp4', '//vimeo.com/1', '..\\x', '%2e%2e/x', 'javascript:alert(1)', ' https://vimeo.com/1'])(
    '%j est refusé, par la règle 15 seule',
    (value) => {
      expect(urlFieldProblem(value, { httpOnly: true })).toBe(SCHEME);
    },
  );
});

describe('referenceProblem — ne juge que les références relatives', () => {
  it.each(['javascript:alert(1)', '//evil.example/x', '/content/a\\b.jpg', 'https://a.example/%2e%2e/x', '\tjavascript:x', '/content/%2e%2e/x'])(
    '%j n\'est pas relative : relève de la règle 15',
    (value) => {
      expect(referenceProblem(value, () => true)).toBeNull();
    },
  );
});

describe('isEmbedId — identifiants d\'embed (§1.12)', () => {
  it.each(['123831041', 'dQw4w9WgXcQ', 'a_b-C', '-', '_', 'a'.repeat(128)])('%j est admis', (id) => {
    expect(isEmbedId(id)).toBe(true);
  });

  it.each([
    ['vide', ''],
    ['129 caractères', 'a'.repeat(129)],
    ['remontée', '../x'],
    ['séparateur de chemin', '1/2'],
    ['antislash', '1\\2'],
    ['requête', '1?autoplay=0'],
    ['paramètre', '1&x=2'],
    ['fragment', '1#t=30'],
    ['espace', '1 2'],
    ['espace de queue', '123 '],
    ['saut de ligne final', '123\n'],
    ['saut de ligne initial', '\n123'],
    ['octet nul', '12\u00003'],
    ['pourcentage', '%2e%2e'],
    ['point', 'a.b'],
    ['deux-points', 'javascript:1'],
    ['lettre accentuée', 'vidéo'],
    ['chiffre arabe-indien', '١٢٣'],
    ['lettre pleine chasse', '\uFF56imeo'],
    ['hors BMP', '\u{1F600}'],
  ])('%s est refusé', (_, id) => {
    expect(isEmbedId(id)).toBe(false);
  });

  it.each([undefined, null, 123, {}, ['1'], true])('%j (pas une chaîne) est refusé', (id) => {
    expect(isEmbedId(id)).toBe(false);
  });
});
