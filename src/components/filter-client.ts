/**
 * Script client de `SeriesFilter` (#136, W4 de la revue de #139).
 *
 * Sorti du `<script>` du composant pour être testé en happy-dom
 * (`tests/components/filter-client.test.ts`) : le composant l'importe et
 * l'appelle sur `document`. Compilé par tsup en `dist/components/filter-client.js`
 * (hors champ `exports` : pas une API publique).
 *
 * Le composant rend la liste complète ; ce script ne fait que masquer
 * (`hidden`) les entrées qui ne passent pas les filtres, mettre à jour le
 * compteur (`aria-live`) et émettre `hf:filter-change` sur la liste.
 */

type ItemData = { id: string; title: string; date: number | null; tags: string[]; location: string | null; url: string };
type FilterData = { locale: string; count: { other: string } & Record<string, string | undefined>; items: ItemData[] };

/** Branche le filtre rendu dans `root`. Rend `false` si le balisage attendu manque. */
export function initSeriesFilter(root: Document | Element = document): boolean {
  const form = root.querySelector<HTMLFormElement>('#hf-filter-form');
  const list = root.querySelector<HTMLElement>('#hf-filter-list');
  const countEl = root.querySelector<HTMLElement>('#hf-filter-count');
  const dataEl = root.querySelector<HTMLElement>('#hf-filter-data');

  if (!list || !dataEl) return false;

  const payload: FilterData = JSON.parse(dataEl.textContent ?? '{}');
  const allItems: ItemData[] = payload.items ?? [];
  let plural: Intl.PluralRules | null = null;
  try {
    plural = new Intl.PluralRules(payload.locale);
  } catch {
    plural = null;
  }
  function countText(shown: number, total: number): string {
    const forms = payload.count ?? { other: '{shown} / {total}' };
    const template = forms[plural?.select(shown) ?? 'other'] ?? forms.other;
    return template.split('{shown}').join(String(shown)).split('{total}').join(String(total));
  }
  const listItems = [...list.querySelectorAll<HTMLLIElement>('[data-id]')];

  function getFilters() {
    if (!form) return { tags: [] as string[], year: '', location: '' };
    const data = new FormData(form);
    return {
      tags: data.getAll('tag') as string[],
      year: (data.get('year') as string) ?? '',
      location: ((data.get('location') as string) ?? '').trim().toLowerCase(),
    };
  }

  function applyFilters() {
    const { tags, year, location } = getFilters();
    let shown = 0;
    const visibleIds = new Set<string>();

    listItems.forEach((li) => {
      const item = allItems.find((i) => i.id === li.dataset['id']);
      if (!item) return;

      const matchTags = tags.length === 0 || tags.every((t) => item.tags.includes(t));
      const matchYear = !year || String(item.date) === year;
      const matchLocation = !location || (item.location?.toLowerCase().includes(location) ?? false);
      const visible = matchTags && matchYear && matchLocation;

      li.hidden = !visible;
      if (visible) {
        shown++;
        visibleIds.add(item.id);
      }
    });

    if (countEl) {
      const total = allItems.length;
      countEl.textContent = shown === total ? '' : countText(shown, total);
    }

    // Événement DOM pour intégration custom (#FE-010)
    list!.dispatchEvent(
      new CustomEvent('hf:filter-change', {
        bubbles: true,
        detail: { series: allItems.filter((i) => visibleIds.has(i.id)) },
      }),
    );
  }

  form?.addEventListener('change', applyFilters);
  form?.addEventListener('input', (e) => {
    if ((e.target as HTMLInputElement).type === 'search') applyFilters();
  });
  form?.addEventListener('reset', () => setTimeout(applyFilters, 0));
  return true;
}
