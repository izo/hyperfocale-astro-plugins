/** `memoizeRead` — lectures partagées entre validation et garde (#158, PERF-009). */
import { describe, expect, it, vi } from 'vitest';
import { memoizeRead } from '../../../src/ingest/index.js';

describe('memoizeRead', () => {
  it('un chemin n\'est lu qu\'une fois, quel que soit le nombre d\'appels', async () => {
    const read = vi.fn(async (path: string) => `contenu de ${path}`);
    const memo = memoizeRead(read);
    expect(await memo('a/index.md')).toBe('contenu de a/index.md');
    expect(await memo('a/index.md')).toBe('contenu de a/index.md');
    expect(await memo('b/index.md')).toBe('contenu de b/index.md');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('des lectures simultanées du même chemin partagent leur promesse', async () => {
    let resolve!: (value: string) => void;
    const read = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const memo = memoizeRead(read);
    const first = memo('a');
    const second = memo('a');
    resolve('x');
    expect(await Promise.all([first, second])).toEqual(['x', 'x']);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('un échec n\'est pas mémorisé : la lecture suivante réessaie', async () => {
    const read = vi
      .fn<(path: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValueOnce('ok');
    const memo = memoizeRead(read);
    await expect(memo('a')).rejects.toThrow('réseau');
    expect(await memo('a')).toBe('ok');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
