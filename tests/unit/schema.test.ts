import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// On re-crée le schéma sans l'image() Astro pour les tests unitaires
// L'image Astro n'est disponible qu'au runtime Astro — on simule avec z.string()
const seriesSchemaForTest = z.object({
  title: z.string(),
  date: z.coerce.date(),
  description: z.string().optional(),
  cover: z.string().optional(), // Simulé (string path en test)
  location: z.string().optional(),
});

describe('schéma series', () => {
  it('valide un objet minimal (title + date)', () => {
    const result = seriesSchemaForTest.safeParse({
      title: 'Bretagne 2024',
      date: '2024-06-15',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Bretagne 2024');
      expect(result.data.date).toBeInstanceOf(Date);
    }
  });

  it('valide un objet complet avec tous les champs', () => {
    const result = seriesSchemaForTest.safeParse({
      title: 'Bretagne 2024',
      date: '2024-06-15',
      description: 'Côtes sauvages du Finistère',
      cover: './media/01.jpg',
      location: 'Finistère, France',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('Côtes sauvages du Finistère');
      expect(result.data.location).toBe('Finistère, France');
    }
  });

  it('coerce une date depuis une chaîne ISO', () => {
    const result = seriesSchemaForTest.safeParse({
      title: 'Test',
      date: '2024-01-01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date.getFullYear()).toBe(2024);
      expect(result.data.date.getMonth()).toBe(0); // janvier = 0
    }
  });

  it('rejette si title est manquant', () => {
    const result = seriesSchemaForTest.safeParse({
      date: '2024-06-15',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('title');
    }
  });

  it('rejette si date est manquante', () => {
    const result = seriesSchemaForTest.safeParse({
      title: 'Test',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('date');
    }
  });

  it('rejette une date invalide', () => {
    const result = seriesSchemaForTest.safeParse({
      title: 'Test',
      date: 'pas-une-date',
    });
    expect(result.success).toBe(false);
  });

  it('accepte description undefined (champ optionnel)', () => {
    const result = seriesSchemaForTest.safeParse({
      title: 'Test',
      date: '2024-01-01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });

  it('accepte cover undefined (champ optionnel)', () => {
    const result = seriesSchemaForTest.safeParse({
      title: 'Test',
      date: '2024-01-01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cover).toBeUndefined();
    }
  });
});
