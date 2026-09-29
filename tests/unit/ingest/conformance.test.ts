/**
 * Conformité aux fixtures cross-language de la couche 4 (izo/hyperfocale-spec,
 * fixtures/ingestion/), copiées à une ref épinglée sous
 * tests/fixtures/spec-ingestion/ par scripts/sync-spec-fixtures.mjs.
 *
 * Chaque fixture du dossier est parcourue : en ajouter une côté spec, puis
 * resynchroniser, l'ajoute ici sans toucher à ce fichier. Les règles de
 * comparaison sont celles du README des fixtures — diagnostics par triplet
 * code + severity + path, jamais le message.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  classifyPath,
  collisionKey,
  compareCanonical,
  computeSnapshotId,
  createSnapshot,
  diffSnapshots,
  dropboxContentHash,
  guardChangeSet,
  isExcluded,
  normalizePath,
  parseSnapshot,
  sha256Hex,
  validateSnapshot,
} from '../../../src/ingest/index.js';
import type { ContentSnapshot, Diagnostic, SnapshotEntry, ValidationRoot } from '../../../src/ingest/index.js';
import { FilesystemProvider, hashBytes } from '../../../src/ingest/fs.js';

const FIXTURES = resolve(__dirname, '../../fixtures/spec-ingestion');

function cases(dir: string): Array<[string, any]> {
  return readdirSync(join(FIXTURES, dir))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => [name.replace(/\.json$/, ''), JSON.parse(readFileSync(join(FIXTURES, dir, name), 'utf-8'))]);
}

const triples = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.map(({ code, severity, path }) => ({ code, severity, path }));

describe('fixtures de la spec — présence', () => {
  it('la copie est épinglée à un commit de izo/hyperfocale-spec', () => {
    const source = readFileSync(join(FIXTURES, 'SOURCE'), 'utf-8');
    expect(source).toMatch(/^commit=[0-9a-f]{40}$/m);
  });

  it.each(['corpora', 'snapshots', 'validation', 'diff', 'guard', 'snapshot-id', 'paths', 'hashes'])('%s/ est présent', (dir) => {
    expect(existsSync(join(FIXTURES, dir))).toBe(true);
  });
});

describe('fixtures — hashes/vectors.json (§4.4)', () => {
  const { vectors } = JSON.parse(readFileSync(join(FIXTURES, 'hashes', 'vectors.json'), 'utf-8'));
  for (const vector of vectors) {
    it(vector.name, async () => {
      const bytes =
        vector.input.utf8 !== undefined
          ? new TextEncoder().encode(vector.input.utf8)
          : new Uint8Array(vector.input.repeat.count).fill(vector.input.repeat.byte);
      expect(bytes.length).toBe(vector.size);
      expect(await sha256Hex(bytes)).toBe(vector.sha256);
      expect(await dropboxContentHash(bytes)).toBe(vector.dropbox);
      expect(hashBytes(bytes)).toEqual({ sha256: vector.sha256, dropbox: vector.dropbox });
    });
  }
});

describe('fixtures — paths/ (§4.1–4.3)', () => {
  for (const [name, fixture] of cases('paths')) {
    it(`${name} — ${fixture.description}`, () => {
      const actual = (fixture.input as string[]).map((input) => {
        const { path, valid } = normalizePath(input);
        const excluded = isExcluded(path);
        return { path, valid, kind: valid && !excluded ? classifyPath(path) : null, excluded };
      });
      expect(actual).toEqual(fixture.expected);

      if (fixture.collisions !== undefined) {
        const retained = [...new Set(actual.filter((e) => e.valid && !e.excluded).map((e) => e.path))].sort(compareCanonical);
        const seen = new Set<string>();
        const collisions = retained.filter((path) => {
          const key = collisionKey(path);
          if (seen.has(key)) return true;
          seen.add(key);
          return false;
        });
        expect(collisions).toEqual(fixture.collisions);
      }
    });
  }
});

describe('fixtures — snapshot-id/ (§4.6)', () => {
  for (const [name, fixture] of cases('snapshot-id')) {
    it(`${name} — ${fixture.description}`, async () => {
      expect(await computeSnapshotId(fixture.entries)).toBe(fixture.expectedId);
    });
  }
});

/** Snapshot d'un corpus par le FilesystemProvider, daté comme les fixtures. */
async function snapshotOfCorpus(name: string): Promise<ContentSnapshot> {
  const listing = await new FilesystemProvider({ root: join(FIXTURES, 'corpora', name) }).list();
  return createSnapshot(listing.entries, { complete: listing.complete, createdAt: '1970-01-01T00:00:00.000Z' });
}

const comparable = (snapshot: ContentSnapshot) => ({
  format: snapshot.format,
  version: snapshot.version,
  id: snapshot.id,
  complete: snapshot.complete,
  entries: snapshot.entries.map(({ path, kind, size, hashes }: SnapshotEntry) => ({ path, kind, size, hashes })),
});

describe('fixtures — snapshots/ ← corpora/ (§4.5)', () => {
  const corpora = readdirSync(join(FIXTURES, 'corpora')).sort();

  it('chaque corpus a son snapshot attendu, et réciproquement', () => {
    expect(cases('snapshots').map(([name]) => name)).toEqual(corpora);
  });

  for (const [name, expected] of cases('snapshots')) {
    it(name, async () => {
      expect(comparable(await snapshotOfCorpus(name))).toEqual(comparable(parseSnapshot(expected)));
    });
  }
});

describe('fixtures — validation/ (§4.10)', () => {
  for (const [name, fixture] of cases('validation')) {
    it(`${name} — ${fixture.description}`, async () => {
      let snapshot: ContentSnapshot;
      let read: (path: string) => Promise<Uint8Array>;
      if (fixture.corpus !== undefined) {
        const corpus = join(FIXTURES, 'corpora', fixture.corpus);
        snapshot = parseSnapshot(readFileSync(join(FIXTURES, 'snapshots', `${fixture.corpus}.json`), 'utf-8'));
        read = async (path) => new Uint8Array(readFileSync(join(corpus, ...path.split('/'))));
      } else {
        // Snapshot inline, éventuellement mal formé (rejet structurel) : passé tel quel.
        snapshot = fixture.snapshot;
        const files: Record<string, string> = fixture.files ?? {};
        read = async (path) => {
          if (!Object.hasOwn(files, path)) throw new Error(`lecture hors de \`files\` : ${path}`);
          return new TextEncoder().encode(files[path]);
        };
      }
      const diagnostics = await validateSnapshot(snapshot, { read, roots: fixture.roots as ValidationRoot[] });
      expect(triples(diagnostics)).toEqual(fixture.expected);
    });
  }
});

describe('fixtures — diff/ (§4.7)', () => {
  for (const [name, fixture] of cases('diff')) {
    it(`${name} — ${fixture.description}`, () => {
      const base = fixture.base === null ? null : parseSnapshot(fixture.base);
      const actual = diffSnapshots(base, parseSnapshot(fixture.target));
      const { diagnostics, ...rest } = actual;
      const { diagnostics: expectedDiagnostics, ...expectedRest } = fixture.expected;
      expect(rest).toEqual(expectedRest);
      expect(triples(diagnostics)).toEqual(triples(expectedDiagnostics));
    });
  }
});

describe('fixtures — guard/ (§4.11)', () => {
  for (const [name, fixture] of cases('guard')) {
    it(`${name} — ${fixture.description}`, async () => {
      const files: Record<'base' | 'target', Record<string, string>> = { base: {}, target: {}, ...fixture.files };
      const read = async (side: 'base' | 'target', path: string) => {
        if (!Object.hasOwn(files[side], path)) throw new Error(`lecture hors de \`files.${side}\` : ${path}`);
        return new TextEncoder().encode(files[side][path]);
      };
      const base = fixture.base === null ? null : parseSnapshot(fixture.base);
      const target = parseSnapshot(fixture.target);
      // Le changeset fourni est celui du diff : on le vérifie au passage.
      const { diagnostics: _d, ...changeSet } = diffSnapshots(base, target);
      const { diagnostics: _e, ...expectedChangeSet } = fixture.changeSet;
      expect(changeSet).toEqual(expectedChangeSet);
      const diagnostics = await guardChangeSet(fixture.changeSet, base, target, { read, policy: fixture.policy });
      expect(triples(diagnostics)).toEqual(fixture.expected);
    });
  }
});
