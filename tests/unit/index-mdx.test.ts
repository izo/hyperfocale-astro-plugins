/**
 * `index.mdx` est interdit (spec 2.17, §1.12) : un lecteur ne compile, n'évalue
 * ni n'importe jamais un `.mdx` de corpus. La collection que l'intégration
 * déclare par le module virtuel est ce que lisent les helpers (`getCollection`) :
 * son glob ne doit pas admettre le MDX, faute de quoi `@astrojs/mdx`, s'il est
 * présent, compilerait le fichier avant que les helpers ne le voient.
 */

import { matchesGlob } from 'node:path';
import { describe, expect, it } from 'vitest';
import hyperfocale from '../../src/index.js';

const MODULE = '\0virtual:hyperfocale/collection';

/** Source du module virtuel `virtual:hyperfocale/collection`, telle que Vite la charge. */
function virtualCollectionSource(options: Parameters<typeof hyperfocale>[0] = {}): string {
  let plugins: Array<{ load?: (id: string) => unknown }> = [];
  const setup = hyperfocale(options).hooks['astro:config:setup'];
  if (!setup) throw new Error('hook astro:config:setup absent de l’intégration');
  setup({
    injectRoute: () => {},
    injectScript: () => {},
    updateConfig: (config: { vite?: { plugins?: typeof plugins } }) => void (plugins = config.vite?.plugins ?? plugins),
    logger: { info: () => {}, warn: () => {} },
    config: { root: new URL('file:///tmp/hyperfocale-test/') },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  for (const plugin of plugins) {
    const source = plugin.load?.(MODULE);
    if (typeof source === 'string') return source;
  }
  throw new Error('module virtuel introuvable');
}

describe('module virtuel — la collection ne charge pas de MDX (§1.12)', () => {
  const pattern = /glob\(\{ pattern: '([^']+)'/.exec(virtualCollectionSource())?.[1] as string;

  it('le glob d\'index admet index.md, pas index.mdx', () => {
    expect(pattern).toBeDefined();
    expect(matchesGlob('a/index.md', pattern)).toBe(true);
    expect(matchesGlob('index.md', pattern)).toBe(true);
    expect(matchesGlob('a/b/index.md', pattern)).toBe(true);
    for (const path of ['a/index.mdx', 'index.mdx', 'a/b/index.mdx', 'a/index.en.mdx']) {
      expect(matchesGlob(path, pattern), path).toBe(false);
    }
  });

  it('quel que soit le nom de collection', () => {
    expect(virtualCollectionSource({ collectionName: 'projects' })).not.toMatch(/mdx/);
  });
});
