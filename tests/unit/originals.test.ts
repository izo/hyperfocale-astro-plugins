import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyAttachment, getSeriesAttachments, isOriginal } from '../../src/helpers/index.js';
import { ORIGINAL_EXTENSIONS, PROJECT_STATUSES, baseSeriesSchema } from '../../src/schema.js';
import { ORIGINAL_EXTENSIONS as INGEST_ORIGINAL_EXTENSIONS, isOriginalEntry, isOriginalPath } from '../../src/ingest/index.js';
import type { Series } from '../../src/helpers/index.js';

/**
 * Originaux (spec §1.9, v2.11) et profil Projet (G.12) côté adaptateur : un RAW
 * ou un sidecar de `media/` n'est ni une image ni un document joint.
 */

// Liste fermée de la spec, recopiée ici à dessein : elle se change par PR
// contre la spec, et ce test oblige à le faire en connaissance de cause.
const SPEC_LIST = [
  'raf', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'orf', 'rw2', 'pef', 'dng',
  '3fr', 'iiq', 'x3f', 'srw', 'rwl', 'erf', 'mos', 'mef', 'kdc', 'dcr',
  'xmp', 'pp3', 'dop', 'cos',
];

describe('originaux — liste fermée (§1.9)', () => {
  it('le schéma porte la liste de la spec', () => {
    expect([...ORIGINAL_EXTENSIONS]).toEqual(SPEC_LIST);
  });

  it('la copie de /ingest (sans zod) reste égale à celle du schéma', () => {
    expect([...INGEST_ORIGINAL_EXTENSIONS]).toEqual([...ORIGINAL_EXTENSIONS]);
  });

  // `import.meta.glob` n'accepte qu'un littéral : les motifs d'exclusion du
  // glob des documents joints recopient la liste. On les relit dans la source.
  it('le glob des documents joints exclut exactement la liste, en minuscules et en majuscules', () => {
    const source = readFileSync(resolve(__dirname, '../../src/helpers/index.ts'), 'utf-8');
    const block = source.slice(source.indexOf('const _attachmentGlob'), source.indexOf(');', source.indexOf('const _attachmentGlob')));
    const groups = [...block.matchAll(/!\/src\/content\/\*\*\/media\/\*\.\{([^}]+)\}/g)].map((m) => (m[1] as string).split(','));
    const lower = groups.find((g) => g.includes('raf'));
    const upper = groups.find((g) => g.includes('RAF'));
    expect(lower).toEqual(SPEC_LIST);
    expect(upper).toEqual(SPEC_LIST.map((e) => e.toUpperCase()));
  });
});

describe('isOriginal / classifyAttachment — originaux', () => {
  it('reconnaît RAW et sidecars, quelle que soit la casse', () => {
    for (const f of ['DSCF0001.RAF', 'img.cr3', 'img.Dng', 'img.XMP', 'img.pp3', 'img.dop', 'img.cos', 'img.3fr']) {
      expect(isOriginal(f)).toBe(true);
      expect(classifyAttachment(f)).toBeNull();
    }
  });

  it('ne regarde que le dernier point', () => {
    expect(isOriginal('DSCF0001.raf.jpg')).toBe(false);
    expect(classifyAttachment('DSCF0001.raf.jpg')).toBeNull(); // image
    expect(isOriginal('photo.jpg.cr3')).toBe(true);
  });

  it('un fichier nommé « raf », sans extension, reste un document joint', () => {
    expect(isOriginal('raf')).toBe(false);
    expect(classifyAttachment('raf')).toBe('file');
  });

  it('ignore la query string d’une URL distante', () => {
    expect(isOriginal('https://cdn.example.com/a/DSCF0001.RAF?v=2')).toBe(true);
  });

  it('`.tif` est une image (spec 2.9), plus une pièce jointe', () => {
    expect(classifyAttachment('scan.tif')).toBeNull();
    expect(classifyAttachment('scan.TIF')).toBeNull();
  });

  it('une extension RAW absente de la liste reste `file`', () => {
    expect(isOriginal('img.braw')).toBe(false);
    expect(classifyAttachment('img.braw')).toBe('file');
  });
});

describe('getSeriesAttachments — originaux en mode distant (§1.9)', () => {
  const series = (data: Record<string, unknown>) => ({ id: 's', data }) as unknown as Series;

  it('écarte un original de `files[]`', async () => {
    const attachments = await getSeriesAttachments('s', series({
      files: [
        { url: 'https://cdn.example.com/s/devis.pdf' },
        { url: 'https://cdn.example.com/s/DSCF0001.RAF' },
        { url: 'https://cdn.example.com/s/DSCF0001.xmp', kind: 'file' },
      ],
    }));
    expect(attachments.map((a) => a.src)).toEqual(['https://cdn.example.com/s/devis.pdf']);
  });
});

describe('ingest — entrée originale (§4.11)', () => {
  it('exige le kind media recalculé du chemin', () => {
    expect(isOriginalEntry({ path: 's/media/A.RAF' })).toBe(true);
    expect(isOriginalEntry({ path: 's/raw/e.nef' })).toBe(false);
    expect(isOriginalEntry({ path: 's/notes.xmp' })).toBe(false);
    expect(isOriginalPath('s/notes.xmp')).toBe(true);
  });
});

describe('schéma — bloc `project:` (G.12)', () => {
  const schema = baseSeriesSchema();
  const base = { title: 'Mariage Dupont', date: '2026-06-14', draft: true };

  it('accepte le bloc de l’exemple de la spec', () => {
    const result = schema.safeParse({
      ...base,
      project: {
        status: 'en-cours',
        stage: 'tri',
        client: 'Famille Dupont',
        contact: 'claire.dupont@example.com',
        start: '2026-06-14',
        end: '2026-06-15',
        due: '2026-07-01',
        deliverables: [{ name: 'Galerie web', date: '2026-07-01' }, { name: 'Tirages 30x40' }],
        tasks: [{ title: 'Envoyer la sélection', done: false, due: '2026-06-20' }, { title: 'Sauvegarder les cartes', done: true }],
      },
    });
    expect(result.success).toBe(true);
    const project = (result.data as { project: { due: Date; tasks: Array<{ done: boolean }> } }).project;
    expect(project.due).toBeInstanceOf(Date);
    expect(project.tasks.map((t) => t.done)).toEqual([false, true]);
  });

  it('conserve un statut inconnu et les clés inconnues, sans échouer', () => {
    const result = schema.safeParse({ ...base, project: { status: 'en-pause', budget: 1200 } });
    expect(result.success).toBe(true);
    expect((result.data as { project: Record<string, unknown> }).project).toMatchObject({ status: 'en-pause', budget: 1200 });
  });

  it('n’échoue pas sur un livrable sans `name` ni une tâche sans `title`', () => {
    const result = schema.safeParse({ ...base, project: { deliverables: [{ date: '2026-07-01' }], tasks: [{ done: true }] } });
    expect(result.success).toBe(true);
  });

  it('les statuts connus sont des slugs ASCII', () => {
    for (const status of PROJECT_STATUSES) expect(status).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('une série sans bloc `project:` est inchangée', () => {
    const result = schema.safeParse(base);
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).project).toBeUndefined();
  });
});
