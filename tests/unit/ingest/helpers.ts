import { createHash } from 'node:crypto';
import { classifyPath, createSnapshot } from '../../../src/ingest/index.js';
import type { ContentSnapshot, SnapshotEntry } from '../../../src/ingest/index.js';

/** SHA-256 hexadécimal de référence, calculé par node:crypto. */
export function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Content hash Dropbox de référence, implémentation indépendante de celle du paquet. */
export function dropboxHash(content: Uint8Array): string {
  const block = 4 * 1024 * 1024;
  const outer = createHash('sha256');
  for (let offset = 0; offset < content.length; offset += block) {
    outer.update(createHash('sha256').update(content.subarray(offset, offset + block)).digest());
  }
  return outer.digest('hex');
}

/** Entrée de snapshot pour un contenu donné, classée par son chemin. */
export function entry(path: string, content = path, extra: Partial<SnapshotEntry> = {}): SnapshotEntry {
  const bytes = new TextEncoder().encode(content);
  return {
    path,
    kind: classifyPath(path),
    size: bytes.length,
    hashes: { sha256: sha256(bytes) },
    ...extra,
  };
}

/** Snapshot complet, daté de l'epoch comme les fixtures de la spec. */
export function snapshot(entries: SnapshotEntry[], complete = true): Promise<ContentSnapshot> {
  return createSnapshot(entries, { complete, createdAt: '1970-01-01T00:00:00.000Z' });
}

/** Lecteur en mémoire. */
export function memoryReader(files: Record<string, string>) {
  return async (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`fichier absent : ${path}`);
    return content;
  };
}
