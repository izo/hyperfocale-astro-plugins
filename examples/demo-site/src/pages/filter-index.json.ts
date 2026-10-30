// Index distant du `SeriesFilter` de la page /composants/ (#136, P3) : le filtre
// charge ce JSON à la première interaction, puis remplace la liste rendue.
import { getSeriesList } from '@regrets/hyperfocale/helpers';

export async function GET() {
  const series = await getSeriesList();
  const index = series.map((s) => {
    const data = s.data as Record<string, unknown>;
    return {
      id: s.id,
      title: String(s.data.title),
      description: typeof data.description === 'string' ? data.description : null,
      date: data.date instanceof Date ? data.date.getFullYear() : null,
      tags: (data.tags as string[] | undefined) ?? [],
      location: (data.location as string | undefined) ?? null,
      url: `/series/${s.id}/`,
      collection: s.collection,
      private: data.private === true,
    };
  });
  return new Response(JSON.stringify(index), { headers: { 'content-type': 'application/json' } });
}
