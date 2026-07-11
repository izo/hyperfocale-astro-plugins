import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { classifyAttachment, getSeriesAttachments } from '../../src/helpers/index.js';
import { baseSeriesSchema } from '../../src/schema.js';
import type { Series } from '../../src/helpers/index.js';

describe('classifyAttachment (spec §1.9)', () => {
  it('retourne null pour les images (elles alimentent la galerie)', () => {
    for (const f of ['01.jpg', '02.jpeg', '03.png', '04.webp', '05.avif', '06.tiff']) {
      expect(classifyAttachment(f)).toBeNull();
    }
  });

  it('retourne null pour index.md (fichier de métadonnées, jamais un document joint)', () => {
    expect(classifyAttachment('index.md')).toBeNull();
    expect(classifyAttachment('INDEX.MD')).toBeNull();
  });

  it('classe les vidéos', () => {
    for (const f of ['clip.mp4', 'clip.webm', 'clip.mov', 'clip.m4v']) {
      expect(classifyAttachment(f)).toBe('video');
    }
  });

  it('classe les audios', () => {
    for (const f of ['son.mp3', 'son.m4a', 'son.ogg', 'son.wav', 'son.flac']) {
      expect(classifyAttachment(f)).toBe('audio');
    }
  });

  it('classe les documents', () => {
    for (const f of ['dossier.pdf', 'livre.epub', 'notes.txt', 'annexe.md']) {
      expect(classifyAttachment(f)).toBe('document');
    }
  });

  it("classe tout le reste en 'file' sans jamais échouer", () => {
    for (const f of ['archive.zip', 'trace.gpx', 'logo.svg', 'donnees.xyz']) {
      expect(classifyAttachment(f)).toBe('file');
    }
  });

  it("classe un fichier sans extension en 'file'", () => {
    expect(classifyAttachment('README')).toBe('file');
  });

  it('est insensible à la casse des extensions', () => {
    expect(classifyAttachment('DOSSIER.PDF')).toBe('document');
    expect(classifyAttachment('photo.JPG')).toBeNull();
  });

  it('accepte un chemin complet (classe sur le basename)', () => {
    expect(classifyAttachment('/src/content/series/bretagne/media/dossier.pdf')).toBe('document');
  });
});

describe('getSeriesAttachments — mode distant (files[])', () => {
  const makeSeries = (data: Record<string, unknown>): Series =>
    ({ id: 'bretagne-2024', collection: 'series', data }) as unknown as Series;

  it("utilise files[] en priorité quand il est présent", async () => {
    const series = makeSeries({
      files: [
        { url: 'https://cdn.example.com/dossier.pdf', title: 'Dossier de presse', kind: 'document', size: 2400000 },
        { url: 'https://cdn.example.com/interview.mp3' },
      ],
    });
    const result = await getSeriesAttachments('bretagne-2024', series);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      src: 'https://cdn.example.com/dossier.pdf',
      kind: 'document',
      title: 'Dossier de presse',
      size: 2400000,
    });
  });

  it("infère kind depuis l'URL quand il est absent", async () => {
    const series = makeSeries({
      files: [{ url: 'https://cdn.example.com/interview.mp3' }],
    });
    const result = await getSeriesAttachments('bretagne-2024', series);
    expect(result[0]?.kind).toBe('audio');
    expect(result[0]?.title).toBe('interview.mp3');
  });

  it('retourne un tableau vide sans files[] ni fichiers locaux', async () => {
    const series = makeSeries({});
    const result = await getSeriesAttachments('serie-inexistante', series);
    expect(result).toEqual([]);
  });
});

describe('schéma — blocs attachments: et files[] (spec §1.9)', () => {
  const schema = baseSeriesSchema();

  it('accepte un bloc attachments: valide', () => {
    const result = schema.safeParse({
      title: 'Bretagne 2024',
      date: '2024-06-15',
      attachments: [
        { file: './media/dossier-de-presse.pdf', title: 'Dossier de presse', description: 'Version print' },
        { file: './media/interview.mp3' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attachments).toHaveLength(2);
      expect(result.data.attachments?.[0]?.title).toBe('Dossier de presse');
    }
  });

  it('accepte un bloc files[] valide (mode distant)', () => {
    const result = schema.safeParse({
      title: 'Bretagne 2024',
      date: '2024-06-15',
      files: [
        { url: 'https://cdn.example.com/dossier.pdf', title: 'Dossier', kind: 'document', size: 1024 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejette une entrée files[] sans url', () => {
    const result = schema.safeParse({
      title: 'Test',
      date: '2024-01-01',
      files: [{ title: 'Sans URL' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejette un kind hors énumération', () => {
    const result = schema.safeParse({
      title: 'Test',
      date: '2024-01-01',
      files: [{ url: 'https://cdn.example.com/x.bin', kind: 'archive' }],
    });
    expect(result.success).toBe(false);
  });

  it("rejette une entrée attachments: sans file", () => {
    const result = schema.safeParse({
      title: 'Test',
      date: '2024-01-01',
      attachments: [{ title: 'Orphelin' }],
    });
    expect(result.success).toBe(false);
  });

  it('reste rétro-compatible : les deux blocs sont optionnels', () => {
    const result = schema.safeParse({ title: 'Minimal', date: '2024-01-01' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attachments).toBeUndefined();
      expect(result.data.files).toBeUndefined();
    }
  });
});
