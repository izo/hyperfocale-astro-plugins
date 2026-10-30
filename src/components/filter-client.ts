/**
 * Script client de `SeriesFilter` (#136, W4 de la revue de #139, P3).
 *
 * Sorti du `<script>` du composant pour être testé en happy-dom
 * (`tests/components/filter-client.test.ts`) : le composant l'importe et
 * l'appelle sur `document`. Compilé par tsup en `dist/components/filter-client.js`
 * (hors champ `exports` : pas une API publique).
 *
 * La liste rendue au serveur est filtrée par masquage (`hidden`). Si le
 * composant reçoit `indexUrl`, l'index complet est chargé à la première
 * interaction, puis la liste est reconstruite depuis le `<template>` — ce qui
 * permet de ne rendre qu'une partie du corpus dans la page.
 *
 * Émet `hf:filter-change` sur la liste, `detail.series` : les séries visibles.
 */

/** Une série du filtre : la forme de l'index distant (`indexUrl`) est la même. */
export type FilterItem = {
  id: string;
  title: string;
  description?: string | null;
  date: number | null;
  tags: string[];
  location: string | null;
  url: string;
  collection?: string;
  private?: boolean;
};

type Prepared = FilterItem & { folded: string };

type FilterData = {
  locale: string;
  count: { other: string } & Record<string, string | undefined>;
  tagList: string;
  items: FilterItem[];
  indexUrl?: string;
};

/** Minuscules et sans accents : la recherche ignore la casse et les diacritiques. */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ajoute le texte de recherche à chaque série, une seule fois. */
function prepare(items: FilterItem[]): Prepared[] {
  return items.map((item) => ({
    ...item,
    folded: fold([item.title, item.description ?? '', item.location ?? '', ...item.tags].join(' ')),
  }));
}

/** Branche le filtre rendu dans `root`. Rend `false` si le balisage attendu manque. */
export function initSeriesFilter(root: Document | Element = document): boolean {
  const form = root.querySelector<HTMLFormElement>('#hf-filter-form');
  const list = root.querySelector<HTMLElement>('#hf-filter-list');
  const countEl = root.querySelector<HTMLElement>('#hf-filter-count');
  const dataEl = root.querySelector<HTMLElement>('#hf-filter-data');
  const template = root.querySelector<HTMLTemplateElement>('#hf-filter-item');

  if (!list || !dataEl) return false;

  const payload: FilterData = JSON.parse(dataEl.textContent ?? '{}');
  let allItems = prepare(payload.items ?? []);
  let byId = new Map(allItems.map((item) => [item.id, item]));

  let plural: Intl.PluralRules | null = null;
  try {
    plural = new Intl.PluralRules(payload.locale);
  } catch {
    plural = null;
  }
  function countText(shown: number, total: number): string {
    const forms = payload.count ?? { other: '{shown} / {total}' };
    const text = forms[plural?.select(shown) ?? 'other'] ?? forms.other;
    return text.split('{shown}').join(String(shown)).split('{total}').join(String(total));
  }

  const currentItems = () => [...list.querySelectorAll<HTMLLIElement>('[data-id]')];

  // Index distant : `idle` tant qu'on n'a pas interagi, `loading` pendant le
  // téléchargement, `done` une fois la liste complète en place (ou sans index).
  let remote: 'idle' | 'loading' | 'done' = payload.indexUrl ? 'idle' : 'done';

  function getFilters() {
    if (!form) return { terms: [] as string[], tags: [] as string[], year: '', location: '', collection: '', visibility: '' };
    const data = new FormData(form);
    return {
      terms: fold(String(data.get('q') ?? '')).split(/\s+/).filter(Boolean),
      tags: data.getAll('tag') as string[],
      year: (data.get('year') as string) ?? '',
      location: ((data.get('location') as string) ?? '').trim().toLowerCase(),
      collection: (data.get('collection') as string) ?? '',
      visibility: (data.get('visibility') as string) ?? '',
    };
  }

  type Filters = ReturnType<typeof getFilters>;

  function matches(item: Prepared, f: Filters): boolean {
    const matchTerms = f.terms.every((term) => item.folded.includes(term));
    const matchTags = f.tags.length === 0 || f.tags.every((t) => item.tags.includes(t));
    const matchYear = !f.year || String(item.date) === f.year;
    const matchLocation = !f.location || (item.location?.toLowerCase().includes(f.location) ?? false);
    const matchCollection = !f.collection || item.collection === f.collection;
    const matchVisibility =
      !f.visibility || (f.visibility === 'private' ? item.private === true : item.private !== true);
    return matchTerms && matchTags && matchYear && matchLocation && matchCollection && matchVisibility;
  }

  function applyFilters() {
    const filters = getFilters();
    let shown = 0;
    const visible: Prepared[] = [];

    for (const li of currentItems()) {
      const item = byId.get(li.dataset['id'] ?? '');
      if (!item) continue;
      const ok = matches(item, filters);
      li.hidden = !ok;
      if (ok) {
        shown++;
        visible.push(item);
      }
    }

    if (countEl) {
      const total = allItems.length;
      countEl.textContent = shown === total ? '' : countText(shown, total);
    }

    // Événement DOM pour intégration custom (#FE-010)
    list!.dispatchEvent(new CustomEvent('hf:filter-change', { bubbles: true, detail: { series: visible } }));
  }

  // Un élément de liste à partir du `<template>` : les textes passent par
  // `textContent`, jamais par `innerHTML` — un titre reste du texte.
  function renderItem(item: Prepared): HTMLLIElement | null {
    const node = template?.content.firstElementChild?.cloneNode(true) as HTMLLIElement | undefined;
    if (!node) return null;
    node.dataset['id'] = item.id;
    node.dataset['tags'] = item.tags.join(',');
    node.dataset['year'] = item.date === null ? '' : String(item.date);
    node.dataset['location'] = (item.location ?? '').toLowerCase();

    node.querySelector('a')?.setAttribute('href', item.url);
    const title = node.querySelector('.hf-filter__title');
    if (title) title.textContent = item.title;

    const meta = [item.date, item.location].filter((v) => v !== null && v !== '').join(' · ');
    const metaEl = node.querySelector('.hf-filter__meta');
    if (metaEl) {
      if (meta) metaEl.textContent = meta;
      else metaEl.remove();
    }

    const chips = node.querySelector('.hf-filter__chips');
    if (chips) {
      if (item.tags.length === 0) {
        chips.remove();
      } else {
        chips.setAttribute('aria-label', payload.tagList.split('{tags}').join(item.tags.join(', ')));
        for (const tag of item.tags) {
          const chip = node.ownerDocument.createElement('span');
          chip.className = 'hf-filter__chip';
          chip.textContent = tag;
          chips.appendChild(chip);
        }
      }
    }
    return node;
  }

  // Ajoute à la liste déroulante de collection les valeurs qu'elle n'a pas.
  function refreshCollectionOptions() {
    const select = form?.querySelector<HTMLSelectElement>('#hf-filter-collection');
    if (!select) return;
    const known = new Set([...select.options].map((o) => o.value));
    const values = [...new Set(allItems.map((i) => i.collection).filter((c): c is string => !!c))].sort();
    for (const value of values) {
      if (known.has(value)) continue;
      const option = select.ownerDocument.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
  }

  function renderList() {
    for (const li of currentItems()) li.remove();
    for (const item of allItems) {
      const node = renderItem(item);
      if (node) list!.appendChild(node);
    }
    refreshCollectionOptions();
  }

  // Charge l'index distant une fois, à la première interaction. En cas d'échec,
  // la liste rendue au serveur reste en place et la prochaine interaction réessaie.
  function loadIndex(): Promise<void> {
    if (remote !== 'idle' || !payload.indexUrl || !template) return Promise.resolve();
    remote = 'loading';
    return fetch(payload.indexUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`index ${response.status}`);
        return response.json() as Promise<FilterItem[]>;
      })
      .then((items) => {
        allItems = prepare(items);
        byId = new Map(allItems.map((item) => [item.id, item]));
        renderList();
        remote = 'done';
        applyFilters();
      })
      .catch(() => {
        remote = 'idle';
      });
  }

  function interact() {
    if (remote === 'done') applyFilters();
    else void loadIndex();
  }

  form?.addEventListener('change', interact);
  form?.addEventListener('input', interact);
  form?.addEventListener('focusin', () => {
    if (remote === 'idle') void loadIndex();
  });
  form?.addEventListener('reset', () => setTimeout(interact, 0));
  return true;
}
