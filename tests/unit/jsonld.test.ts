/** `seriesJsonLd` — données structurées ImageGallery d'une série (#136, P1). */
import { describe, expect, it } from 'vitest';
import { seriesJsonLd } from '../../src/helpers/index.js';

const series = { id: 'bretagne', collection: 'series', body: '', data: { title: 'Bretagne', description: 'Côtes' } } as never;

describe('seriesJsonLd', () => {
  it('sans images : nom et description seulement', () => {
    expect(seriesJsonLd(series)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'ImageGallery',
      name: 'Bretagne',
      description: 'Côtes',
    });
  });

  it('avec images : ImageObject par image, alt en légende', () => {
    const ld = seriesJsonLd(series, [
      { src: 'https://r2.example/01.jpg', width: 800, height: 600, alt: 'Phare' },
      { src: 'https://r2.example/02.jpg' },
    ]);
    expect(ld.image).toEqual([
      { '@type': 'ImageObject', contentUrl: 'https://r2.example/01.jpg', width: 800, height: 600, caption: 'Phare' },
      { '@type': 'ImageObject', contentUrl: 'https://r2.example/02.jpg' },
    ]);
  });

  it('sans description, la clé est absente', () => {
    const bare = { ...(series as object), data: { title: 'Nue' } } as never;
    expect(seriesJsonLd(bare)).not.toHaveProperty('description');
  });
});
