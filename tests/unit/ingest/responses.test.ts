/**
 * Données de retour (spec 2.18, §4.2, §4.8) : dossier réservé `_responses/`
 * exclu par défaut, et écriture confinée à ce dossier.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RESPONSES_DIR,
  ResponsePathError,
  ResponseWriteUnsupportedError,
  isExcluded,
  isResponsePath,
  writeResponse,
  type ContentProvider,
} from '../../../src/ingest/index.js';
import { FilesystemProvider } from '../../../src/ingest/fs.js';
import { RESPONSES_DIR as DELIVERY_DIR, pollResponsePath } from '../../../src/delivery.js';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('dossier réservé', () => {
  it('/delivery et /ingest nomment le même dossier', () => {
    expect(DELIVERY_DIR).toBe(RESPONSES_DIR);
    expect(isResponsePath(pollResponsePath('series/mariage-2026'))).toBe(true);
  });

  it('exclu par défaut, sans règle du consommateur, à la racine seulement et casse ignorée', () => {
    for (const path of ['_responses/a/poll.json', '_responses', '_responses/', '_Responses/x', '_RESPONSES/a/poll.md']) {
      expect(isExcluded(path), path).toBe(true);
    }
    for (const path of ['_responsesX/x', '_responses-2025/a', 'responses/poll.json', 'a/_responses/x', '_sondages/a.md']) {
      expect(isExcluded(path), path).toBe(false);
    }
  });
});

describe('writeResponse', () => {
  let root: string;
  let provider: FilesystemProvider;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hf-responses-'));
    mkdirSync(join(root, 'series/a/media'), { recursive: true });
    writeFileSync(join(root, 'series/a/index.md'), '---\ntitle: A\ndate: 2026-01-01\n---\n');
    provider = new FilesystemProvider({ root });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('écrit sous _responses/, et le listing ne voit rien de plus', async () => {
    const before = (await provider.list()).entries.map((e) => e.path);
    await writeResponse(provider, pollResponsePath('series/a'), bytes('{"version":1}'));
    expect(readFileSync(join(root, '_responses/series/a/poll.json'), 'utf8')).toBe('{"version":1}');
    const after = await provider.list();
    expect(after.entries.map((e) => e.path)).toEqual(before);
    expect(after.diagnostics ?? []).toEqual([]);
  });

  it.each([
    ['dans une série', 'series/a/poll.json'],
    ['à la racine', 'poll.json'],
    ['autre casse', '_Responses/a/poll.json'],
    ['nom voisin', '_responses-2025/a/poll.json'],
    ['dossier seul', '_responses'],
    ['remontée', '_responses/../series/a/index.md'],
    ['segment caché', '_responses/.git/config'],
    ['antislash', '_responses\\a\\poll.json'],
    ['vide', ''],
  ])('refuse un chemin %s : rien d’écrit', async (_label, path) => {
    await expect(writeResponse(provider, path, bytes('x'))).rejects.toBeInstanceOf(ResponsePathError);
    expect(existsSync(join(root, '_responses'))).toBe(false);
    expect(readFileSync(join(root, 'series/a/index.md'), 'utf8')).toContain('title: A');
  });

  it('provider sans écriture : erreur dédiée, que l’appelant peut ignorer sans bloquer la publication', async () => {
    const readOnly = {
      type: 'lecture-seule',
      capabilities: { localRead: true },
      list: provider.list.bind(provider),
      read: provider.read.bind(provider),
    } as unknown as ContentProvider;
    await expect(writeResponse(readOnly, '_responses/a/poll.json', bytes('x'))).rejects.toBeInstanceOf(ResponseWriteUnsupportedError);
  });

  it('Dropbox sans la portée d’écriture : message qui dit quoi cocher', async () => {
    const noScope = {
      type: 'dropbox',
      capabilities: { remoteWrite: true },
      write: async () => {
        throw new Error('[hyperfocale] Dropbox files/upload : 401 missing_scope/..');
      },
    } as unknown as ContentProvider;
    await expect(writeResponse(noScope, '_responses/a/poll.json', bytes('x'))).rejects.toThrow(/files\.content\.write/);
  });

  it('toute autre erreur du provider remonte telle quelle', async () => {
    const broken = {
      type: 'x',
      capabilities: { remoteWrite: true },
      write: async () => {
        throw new Error('réseau');
      },
    } as unknown as ContentProvider;
    await expect(writeResponse(broken, '_responses/a/poll.json', bytes('x'))).rejects.toThrow('réseau');
  });

  it('un lien symbolique sous la racine n’est pas traversé', async () => {
    const { symlinkSync } = await import('node:fs');
    const outside = mkdtempSync(join(tmpdir(), 'hf-outside-'));
    try {
      try {
        symlinkSync(outside, join(root, '_responses'), 'dir');
      } catch {
        return; // plateforme sans liens symboliques
      }
      await expect(writeResponse(provider, '_responses/a/poll.json', bytes('x'))).rejects.toThrow();
      expect(existsSync(join(outside, 'a'))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
