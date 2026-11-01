/** `mapConcurrentWeighted` — budget d'octets en vol (#158, PERF-008). */
import { describe, expect, it } from 'vitest';
import { mapConcurrentWeighted } from '../../../src/ingest/concurrency.js';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

/** Lance `weights` et rend les pics observés d'appels et de poids simultanés. */
async function observe(weights: number[], limit: number, maxWeight: number) {
  let active = 0;
  let inFlight = 0;
  let peakActive = 0;
  let peakWeight = 0;
  const alone: number[] = [];
  const results = await mapConcurrentWeighted(
    weights,
    { limit, maxWeight, weight: (w) => w },
    async (w, i) => {
      active++;
      inFlight += w;
      peakActive = Math.max(peakActive, active);
      peakWeight = Math.max(peakWeight, inFlight);
      if (active === 1) alone.push(i);
      await tick();
      active--;
      inFlight -= w;
      return i * 10;
    },
  );
  return { results, peakActive, peakWeight, alone };
}

describe('mapConcurrentWeighted', () => {
  it('respecte la limite d\'appels simultanés', async () => {
    const { peakActive } = await observe(Array(10).fill(1), 3, Infinity);
    expect(peakActive).toBe(3);
  });

  it('respecte le budget de poids : jamais plus que `maxWeight` en vol', async () => {
    const { peakActive, peakWeight } = await observe([40, 40, 40, 40, 40], 10, 100);
    expect(peakActive).toBe(2);
    expect(peakWeight).toBeLessThanOrEqual(100);
  });

  it('un élément plus lourd que le budget passe, mais seul — rien ne bloque', async () => {
    const { results, alone } = await observe([10, 500, 10], 5, 100);
    expect(results).toEqual([0, 10, 20]);
    expect(alone).toContain(1);
  });

  it('les résultats suivent l\'ordre des entrées, quel que soit l\'ordre d\'arrivée', async () => {
    const items = [30, 5, 20, 1];
    const results = await mapConcurrentWeighted(
      items,
      { limit: 4, maxWeight: Infinity, weight: () => 0 },
      async (ms, i) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return `r${i}`;
      },
    );
    expect(results).toEqual(['r0', 'r1', 'r2', 'r3']);
  });

  it('un poids nul ne compte pas dans le budget : seule la limite d\'appels borne', async () => {
    const { peakActive } = await observe(Array(6).fill(0), 4, 1);
    expect(peakActive).toBe(4);
  });

  it('une liste vide rend une liste vide', async () => {
    await expect(
      mapConcurrentWeighted([], { limit: 2, maxWeight: 10, weight: () => 1 }, async () => 1),
    ).resolves.toEqual([]);
  });

  it('le premier rejet se propage et plus aucun appel ne démarre', async () => {
    const started: number[] = [];
    await expect(
      mapConcurrentWeighted(
        [1, 1, 1, 1, 1],
        { limit: 1, maxWeight: 10, weight: (w) => w },
        async (_w, i) => {
          started.push(i);
          await tick();
          if (i === 1) throw new Error('échec');
          return i;
        },
      ),
    ).rejects.toThrow('échec');
    await tick();
    await tick();
    expect(started).toEqual([0, 1]);
  });

  it('un rejet tardif d\'un appel déjà en vol est absorbé, sans rejet non géré', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      await expect(
        mapConcurrentWeighted(
          [1, 2],
          { limit: 2, maxWeight: 10, weight: () => 1 },
          async (ms) => {
            await new Promise((resolve) => setTimeout(resolve, ms * 5));
            throw new Error(`échec ${ms}`);
          },
        ),
      ).rejects.toThrow('échec 1');
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
