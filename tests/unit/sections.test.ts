/**
 * Page d'index de section — spec §1.10 (#SPEC-001).
 *
 * Un `index.md` portant `type: section` range des séries sans en être une :
 * pas de date, pas de galerie, absent des listings. Avant ce correctif, `date`
 * était requise sans condition et un tel fichier cassait le build Astro — cinq
 * fichiers du corpus de `mathieu-drouet.com` étaient dans ce cas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import type { SchemaContext } from 'astro:content';
import { baseSeriesSchema, seriesSchema } from '../../src/schema.js';

const mockCtx: SchemaContext = {
  image: () => z.object({ src: z.string(), width: z.number(), height: z.number(), format: z.string() }),
};

// ─── Schéma ────────────────────────────────────────────────────────────────

describe('schéma — §1.10 page d’index de section', () => {
  it('valide une section sans date', () => {
    const result = baseSeriesSchema().safeParse({ type: 'section', title: 'Musique' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.date).toBeUndefined();
  });

  it('rejette une série sans date — une série non datée reste invalide', () => {
    const result = baseSeriesSchema().safeParse({ title: 'Bretagne 2024' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join('.'))).toContain('date');
    }
  });

  it('`type` absent vaut `series` — tout contenu antérieur à v2.6 est inchangé', () => {
    const result = baseSeriesSchema().safeParse({ title: 'Bretagne 2024', date: '2024-06-15' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe('series');
  });

  it('rejette une valeur de `type` hors spec', () => {
    const result = baseSeriesSchema().safeParse({ type: 'rubrique', title: 'X', date: '2024-01-01' });
    expect(result.success).toBe(false);
  });

  it('accepte une date sur une section — présente, elle est simplement ignorée', () => {
    const result = baseSeriesSchema().safeParse({
      type: 'section',
      title: 'Musique',
      date: '2024-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('`dateRequired: false` laisse une série sans date passer', () => {
    const result = baseSeriesSchema({ dateRequired: false }).safeParse({ title: 'Laubade' });
    expect(result.success).toBe(true);
  });

  it('la contrainte survit à `.extend()` — API d’extension #DATA-004', () => {
    const extended = seriesSchema(mockCtx).extend({ photographer: z.string().optional() });
    expect(extended.safeParse({ type: 'section', title: 'Musique' }).success).toBe(true);
    expect(extended.safeParse({ title: 'Sans date' }).success).toBe(false);
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

type Entry = { id: string; collection: string; data: Record<string, unknown>; body: string };

const entry = (id: string, data: Record<string, unknown>): Entry => ({
  id,
  collection: 'series',
  data: { published: true, draft: false, featured: false, tags: [], ...data },
  body: '',
});

const CORPUS: Entry[] = [
  entry('archives/music', { type: 'section', title: 'Musique', tags: ['section-tag'] }),
  entry('archives/music/concerts/rennes-2024', {
    type: 'series',
    title: 'Rennes 2024',
    date: new Date('2024-05-01'),
    tags: ['concert'],
  }),
  entry('bretagne-2024', { title: 'Bretagne 2024', date: new Date('2024-06-15'), tags: ['concert'] }),
];

vi.mock('astro:content', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCollection: async () => CORPUS,
}));

const {
  getSeriesList,
  querySeries,
  getSections,
  isSection,
  getAllTags,
  getAllCollections,
  resetSeriesCache,
} = await import('../../src/helpers/index.js');

describe('helpers — exclusion des sections (§1.10)', () => {
  beforeEach(() => resetSeriesCache());

  it('isSection ne se fie qu’à `type`, jamais à l’absence de date', () => {
    expect(isSection(CORPUS[0] as never)).toBe(true);
    expect(isSection(CORPUS[2] as never)).toBe(false);
    expect(isSection(entry('x', { title: 'Sans date' }) as never)).toBe(false);
  });

  it('getSeriesList écarte la section et garde les séries', async () => {
    const ids = (await getSeriesList()).map((s) => s.id);
    expect(ids).not.toContain('archives/music');
    expect(ids).toEqual(['bretagne-2024', 'archives/music/concerts/rennes-2024']);
  });

  it('querySeries écarte la section', async () => {
    const { items, pagination } = await querySeries();
    expect(items.map((s) => s.id)).not.toContain('archives/music');
    expect(pagination.totalItems).toBe(2);
  });

  it('getSections retourne les sections, triées par slug', async () => {
    const sections = await getSections();
    expect(sections.map((s) => s.id)).toEqual(['archives/music']);
  });

  it('getAllTags ignore les tags portés par une section', async () => {
    const tags = (await getAllTags()).map((t) => t.name);
    expect(tags).not.toContain('section-tag');
    expect(tags).toContain('concert');
  });

  it('getAllCollections ne compte pas la section comme un contenu', async () => {
    const archives = (await getAllCollections()).find((c) => c.slug === 'archives');
    expect(archives?.count).toBe(1);
  });
});
