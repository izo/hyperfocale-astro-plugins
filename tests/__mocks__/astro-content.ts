/**
 * Mock du module `astro:content` pour les tests unitaires Vitest.
 * Le module réel n'est disponible que dans le runtime Astro.
 */
import { z } from 'zod';

export { z };

export type CollectionEntry<T extends string> = {
  id: string;
  slug?: string;
  collection: T;
  data: Record<string, unknown>;
  body: string;
  render: () => Promise<{ Content: unknown }>;
};

export type SchemaContext = {
  image: () => ReturnType<typeof z.object>;
};

export function defineCollection(config: unknown) {
  return config;
}

export async function getCollection(collection: string): Promise<CollectionEntry<typeof collection>[]> {
  return [];
}

export async function getEntry(
  collection: string,
  id: string
): Promise<CollectionEntry<typeof collection> | undefined> {
  return undefined;
}
