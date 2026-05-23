import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { seriesSchema } from '../../src/schema.js';
import type { SchemaContext } from 'astro:content';

// Mock SchemaContext pour les tests unitaires
const mockCtx: SchemaContext = {
  image: () => z.object({ src: z.string(), width: z.number(), height: z.number(), format: z.string() }),
};

// On re-crée le schéma sans l'image() Astro pour les tests unitaires
// L'image Astro n'est disponible qu'au runtime Astro — on simule avec z.string()
const seriesSchemaForTest = z.object({
  title: z.string(),
  date: z.coerce.date(),
  description: z.string().optional(),
  cover: z.string().optional(), // Simulé (string path en test)
  location: z.string().optional(),
});

// Schéma avec date optionnelle (dateRequired: false)
const seriesSchemaOptionalDate = z.object({
  title: z.string(),
  date: z.coerce.date().optional(),
  description: z.string().optional(),
  cover: z.string().optional(),
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

describe('schéma series — dateRequired: false', () => {
  it('accepte un objet sans date (collection non temporelle)', () => {
    const result = seriesSchemaOptionalDate.safeParse({
      title: 'Château de Laubade',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBeUndefined();
    }
  });

  it('accepte une date si fournie (rétrocompat)', () => {
    const result = seriesSchemaOptionalDate.safeParse({
      title: 'Château de Laubade',
      date: '2024-01-01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBeInstanceOf(Date);
    }
  });

  it('valide tous les autres champs normalement', () => {
    const result = seriesSchemaOptionalDate.safeParse({
      title: 'Calvados Roger Groult',
      description: 'Artisans de grands Calvados depuis 1860',
      location: 'Pays d\'Auge, Normandie',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Calvados Roger Groult');
      expect(result.data.description).toBe('Artisans de grands Calvados depuis 1860');
      expect(result.data.location).toBe('Pays d\'Auge, Normandie');
      expect(result.data.date).toBeUndefined();
    }
  });

  it('rejette si title est manquant (obligatoire dans tous les cas)', () => {
    const result = seriesSchemaOptionalDate.safeParse({
      description: 'Sans titre',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('title');
    }
  });
});

describe('seriesSchema() — inférence de types et .extend()', () => {
  it('retourne un ZodObject sur lequel .extend() est disponible', () => {
    const schema = seriesSchema(mockCtx);
    expect(typeof schema.extend).toBe('function');
  });

  it('.extend() ajoute un champ supplémentaire correctement validé', () => {
    const brandSchema = seriesSchema(mockCtx, { dateRequired: false }).extend({
      logo: z.string(),
      gallery: z.array(z.string()).default([]),
    });

    const result = brandSchema.safeParse({
      title: 'Château de Laubade',
      logo: 'logo.png',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Château de Laubade');
      expect(result.data.logo).toBe('logo.png');
      expect(result.data.gallery).toEqual([]);
      expect(result.data.date).toBeUndefined();
    }
  });

  it('.extend() échoue si le champ ajouté est manquant', () => {
    const brandSchema = seriesSchema(mockCtx, { dateRequired: false }).extend({
      logo: z.string(),
    });

    const result = brandSchema.safeParse({
      title: 'Château de Laubade',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('logo');
    }
  });

  it('.extend() avec date obligatoire valide date + champs étendus', () => {
    const extendedSchema = seriesSchema(mockCtx).extend({
      photographer: z.string(),
    });

    const result = extendedSchema.safeParse({
      title: 'Bretagne 2024',
      date: '2024-06-15',
      photographer: 'Jean Dupont',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Bretagne 2024');
      expect(result.data.date).toBeInstanceOf(Date);
      expect(result.data.photographer).toBe('Jean Dupont');
    }
  });
});
