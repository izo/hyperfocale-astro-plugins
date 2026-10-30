/** Garde de publication : lectures des index en parallèle, diagnostics en ordre stable (PERF-009, #158). */
import { describe, expect, it } from 'vitest';
import { diffSnapshots, guardChangeSet } from '../../../src/ingest/index.js';
import { entry, snapshot } from './helpers.js';

const PRIVATE = '---\ntitle: T\nprivate: true\n---\n';
const PUBLIC = '---\ntitle: T\n---\n';
const FOLDERS = Array.from({ length: 12 }, (_, i) => `series/s${String(i).padStart(2, '0')}`);

describe('guardChangeSet — lectures concurrentes', () => {
  it('lit les index de plusieurs dossiers à la fois, bornées, et garde l\'ordre des diagnostics', async () => {
    const files = { base: {} as Record<string, string>, target: {} as Record<string, string> };
    const baseEntries = [];
    const targetEntries = [];
    for (const folder of FOLDERS) {
      files.base[`${folder}/index.md`] = PRIVATE;
      files.target[`${folder}/index.md`] = PUBLIC; // exposée
      baseEntries.push(entry(`${folder}/index.md`, PRIVATE));
      targetEntries.push(entry(`${folder}/index.md`, PUBLIC));
    }
    const base = await snapshot(baseEntries);
    const target = await snapshot(targetEntries);
    const { diagnostics: _ignored, ...changeSet } = diffSnapshots(base, target);

    let inFlight = 0;
    let peak = 0;
    const read = async (side: 'base' | 'target', path: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return files[side][path] as string;
    };

    const diagnostics = await guardChangeSet(changeSet, base, target, { read, policy: {} });
    const exposed = diagnostics.filter((d) => d.code === 'guard-private-exposed').map((d) => d.path);
    expect(exposed).toEqual(FOLDERS);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
  });
});
