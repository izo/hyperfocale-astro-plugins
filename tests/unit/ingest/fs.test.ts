import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createSnapshot, diffSnapshots } from '../../../src/ingest/index.js';
import {
  ContentMismatchError,
  FilesystemProvider,
  hashBytes,
  hashFile,
  materializeSnapshot,
} from '../../../src/ingest/fs.js';
import { dropboxHash, sha256 } from './helpers.js';

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'hf-ingest-fs-'));
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function tree(root: string, files: Record<string, string | Uint8Array>) {
  for (const [path, content] of Object.entries(files)) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

async function snapshotOf(dir: string) {
  const listing = await new FilesystemProvider({ root: dir }).list();
  return createSnapshot(listing.entries, { complete: listing.complete, createdAt: '1970-01-01T00:00:00.000Z' });
}

describe('hashBytes / hashFile (§2.4)', () => {
  it('sha256 et dropbox, en mémoire comme en flux, y compris au-delà d\'un bloc de 4 Mio', async () => {
    const big = new Uint8Array(9 * 1024 * 1024 + 123).map((_, i) => (i * 7) % 256);
    writeFileSync(join(work, 'big.bin'), big);
    writeFileSync(join(work, 'empty.bin'), '');
    expect(hashBytes(big)).toEqual({ sha256: sha256(big), dropbox: dropboxHash(big) });
    expect(await hashFile(join(work, 'big.bin'))).toEqual({
      size: big.length,
      hashes: { sha256: sha256(big), dropbox: dropboxHash(big) },
    });
    const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(await hashFile(join(work, 'empty.bin'))).toEqual({ size: 0, hashes: { sha256: empty, dropbox: empty } });
    expect(hashBytes(big, ['dropbox'])).toEqual({ dropbox: dropboxHash(big) });
  });
});

describe('FilesystemProvider', () => {
  it('parcourt récursivement, exclut, normalise en NFC, classe et hache', async () => {
    tree(work, {
      'archives/cafe\u0301/index.md': '---\ntitle: T\n---\n',
      'archives/cafe\u0301/media/01.jpg': 'jpg',
      'archives/cafe\u0301/media/.DS_Store': 'x',
      'archives/cafe\u0301/images.json': '{}',
      'archives/_todo/draft.md': 'x',
      '.git/config': 'x',
      'Thumbs.db': 'x',
      'README': 'x',
    });
    const provider = new FilesystemProvider({ root: work, ignore: ['_todo/'] });
    const listing = await provider.list();
    expect(listing.complete).toBe(true);
    expect(listing.entries.map((e) => [e.path, e.kind])).toEqual([
      ['README', 'other'],
      ['archives/café/images.json', 'derived'],
      ['archives/café/index.md', 'content'],
      ['archives/café/media/01.jpg', 'media'],
    ]);
    const jpg = listing.entries[3];
    expect(jpg?.size).toBe(3);
    expect(jpg?.hashes).toEqual({ sha256: sha256('jpg'), dropbox: dropboxHash(new TextEncoder().encode('jpg')) });
    expect(jpg?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(provider.capabilities).toMatchObject({ localRead: true, localWrite: true, hashAlgorithms: ['sha256', 'dropbox'] });
    // Lecture par le chemin du contrat, même si le disque garde la forme NFD.
    expect(new TextDecoder().decode(await provider.read('archives/café/media/01.jpg'))).toBe('jpg');
  });

  it('suit un lien vers un fichier, ignore un lien vers un dossier', async () => {
    tree(work, { 'real/a.md': 'a', 'outside.txt': 'o' });
    symlinkSync(join(work, 'real'), join(work, 'loop'));
    symlinkSync(join(work, 'outside.txt'), join(work, 'real', 'link.txt'));
    const listing = await new FilesystemProvider({ root: work }).list();
    expect(listing.entries.map((e) => e.path)).toEqual(['outside.txt', 'real/a.md', 'real/link.txt']);
  });

  it.skipIf(process.getuid?.() === 0)('une erreur de lecture rend le listing incomplet sans l\'interrompre', async () => {
    tree(work, { 'a/index.md': 'a', 'b/secret.md': 's', 'c/locked/x.md': 'x' });
    chmodSync(join(work, 'b/secret.md'), 0o000);
    chmodSync(join(work, 'c/locked'), 0o000);
    try {
      const listing = await new FilesystemProvider({ root: work }).list();
      expect(listing.complete).toBe(false);
      expect(listing.entries.map((e) => e.path)).toEqual(['a/index.md']);
    } finally {
      chmodSync(join(work, 'b/secret.md'), 0o644);
      chmodSync(join(work, 'c/locked'), 0o755);
    }
  });

  it('write écrit de façon atomique et rend l\'entrée ; un chemin hors racine est refusé', async () => {
    const provider = new FilesystemProvider({ root: work });
    const entry = await provider.write('s/media/01.jpg', new TextEncoder().encode('pix'));
    expect(entry).toMatchObject({ path: 's/media/01.jpg', kind: 'media', size: 3, hashes: { sha256: sha256('pix') } });
    expect(readFileSync(join(work, 's/media/01.jpg'), 'utf-8')).toBe('pix');
    await expect(provider.read('../etc/passwd')).rejects.toThrow(/refusé/);
    await expect(provider.write('/abs', new Uint8Array())).rejects.toThrow(/refusé/);
  });
});

describe('materializeSnapshot', () => {
  it('met le dossier dans l\'état de target : ajouts, modifs, suppressions, moves, dossiers vidés', async () => {
    const baseDir = join(work, 'base');
    const sourceDir = join(work, 'source');
    const baseFiles = {
      'keep/index.md': 'keep',
      'edit/index.md': 'v1',
      'gone/index.md': 'gone',
      'gone/media/01.jpg': 'g1',
      'old/index.md': 'series',
      'old/media/01.jpg': 'o1',
      'swap': 'file-then-dir',
    };
    tree(baseDir, baseFiles);
    tree(sourceDir, {
      'keep/index.md': 'keep',
      'edit/index.md': 'v2',
      'new/index.md': 'series',
      'new/media/01.jpg': 'o1',
      'swap/inner.md': 'dir-now',
      'added/index.md': 'fresh',
    });
    const base = await snapshotOf(baseDir);
    const target = await snapshotOf(sourceDir);
    writeFileSync(join(baseDir, 'untracked.txt'), 'hors changeset');
    const changeSet = diffSnapshots(base, target);
    expect(changeSet.moved.map((m) => [m.from, m.to])).toEqual([
      ['old/index.md', 'new/index.md'],
      ['old/media/01.jpg', 'new/media/01.jpg'],
    ]);

    const source = new FilesystemProvider({ root: sourceDir });
    const reads: string[] = [];
    const result = await materializeSnapshot(changeSet, {
      targetDir: baseDir,
      read: async (path) => {
        reads.push(path);
        return source.read(path);
      },
    });
    expect(result).toEqual({ written: 3, moved: 2, deleted: 3 });
    // Les moves locaux ne relisent rien.
    expect(reads.sort()).toEqual(['added/index.md', 'edit/index.md', 'swap/inner.md']);

    // Le fichier hors changeset survit ; le reste coïncide avec target.
    expect(readFileSync(join(baseDir, 'untracked.txt'), 'utf-8')).toBe('hors changeset');
    rmSync(join(baseDir, 'untracked.txt'));
    expect((await snapshotOf(baseDir)).id).toBe(target.id);
    expect(existsSync(join(baseDir, 'gone'))).toBe(false);
    expect(existsSync(join(baseDir, 'old'))).toBe(false);
  });

  it('un move dont la source manque localement est relu depuis la source', async () => {
    const baseDir = join(work, 'base');
    const sourceDir = join(work, 'source');
    tree(baseDir, { 'a/index.md': 'x' });
    tree(sourceDir, { 'b/index.md': 'x' });
    const base = await snapshotOf(baseDir);
    const target = await snapshotOf(sourceDir);
    rmSync(join(baseDir, 'a/index.md'));
    const source = new FilesystemProvider({ root: sourceDir });
    await materializeSnapshot(diffSnapshots(base, target), { targetDir: baseDir, read: (p) => source.read(p) });
    expect(readFileSync(join(baseDir, 'b/index.md'), 'utf-8')).toBe('x');
  });

  it('refuse un contenu qui ne correspond plus à l\'empreinte du snapshot', async () => {
    const sourceDir = join(work, 'source');
    tree(sourceDir, { 'a/index.md': 'listé' });
    const target = await snapshotOf(sourceDir);
    const targetDir = join(work, 'out');
    mkdirSync(targetDir);
    await expect(
      materializeSnapshot(diffSnapshots(null, target), {
        targetDir,
        read: async () => new TextEncoder().encode('changé depuis'),
      }),
    ).rejects.toBeInstanceOf(ContentMismatchError);
    expect(existsSync(join(targetDir, 'a/index.md'))).toBe(false);
  });
});
