/**
 * Script client de `SeriesPoll` (profil Livraison) : le formulaire de notation.
 *
 * Tout le balisage est construit ici, dans l'élément racine : le composant
 * `.astro` n'émet que la racine et ses données. Un site dont les images ne sont
 * connues qu'après authentification (série privée) appelle `mountSeriesPoll`
 * lui-même, depuis son propre îlot, avec les mêmes options.
 *
 * Protocole avec le serveur du site (`endpoint`) :
 * - `GET  <endpoint>?series=<chemin>` → `{ submitted: boolean, scores: { "<file>": n } }` ;
 * - `POST <endpoint>` corps JSON `{ series, scores: { "<file>": n } }` → 2xx si enregistré.
 * `headers` porte l'authentification du site (jeton d'accès).
 *
 * Rien n'est envoyé avant l'appui sur le bouton d'envoi, et l'envoi reste
 * désactivé tant qu'une image n'est pas notée. Émet `hf:poll-submitted` sur la
 * racine (remonte), `detail.scores`, à l'envoi **et** quand une réponse déjà
 * enregistrée est retrouvée au chargement (`detail.restored: true`).
 *
 * Testé en happy-dom : tests/components/poll-client.test.ts. Compilé par tsup en
 * `dist/components/poll-client.js`.
 */
import { POLL_SCORES } from '../delivery.js';

export interface PollImage {
  /** Chemin du média relatif à la série (`media/a.jpg`) — l'identifiant de la note. */
  file: string;
  src: string;
  alt?: string;
}

/** Libellés lus par le formulaire (clés `poll.*` de `HyperfocaleLabels`). */
export interface PollClientLabels {
  heading: string;
  intro: string;
  start: string;
  edit: string;
  scoreLegend: string;
  imageAlt: string;
  progress: string;
  submit: string;
  sending: string;
  thanks: string;
  error: string;
}

export interface PollOptions {
  series: string;
  images: PollImage[];
  endpoint: string;
  labels: PollClientLabels;
  /** En-têtes ajoutés aux deux requêtes (authentification du site). */
  headers?: Record<string, string>;
  /** Niveau du titre, 1 à 6. Défaut : 2. */
  headingLevel?: number;
}

export interface PollHandle {
  /** Retire le formulaire et ses écouteurs. */
  destroy(): void;
}

const fill = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );

let instances = 0;

/** Monte le formulaire dans `root`. Rend `null` s'il n'y a aucune image à noter. */
export function mountSeriesPoll(root: HTMLElement, options: PollOptions): PollHandle | null {
  const { series, images, endpoint, labels } = options;
  if (images.length === 0) return null;

  const doc = root.ownerDocument;
  const uid = `hf-poll-${++instances}`;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const scores = new Map<string, number>();
  let submitted = false;
  let sending = false;
  let destroyed = false;

  root.replaceChildren();
  root.classList.add('hf-poll');
  const level = Number.isInteger(options.headingLevel) && options.headingLevel! >= 1 && options.headingLevel! <= 6 ? options.headingLevel! : 2;
  const heading = el(`h${level}` as 'h2', 'hf-poll__heading', labels.heading);
  heading.id = `${uid}-heading`;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-labelledby', heading.id);

  // ── Écran fermé : invitation, ou confirmation après envoi ──
  const closed = el('div', 'hf-poll__closed');
  const status = el('p', 'hf-poll__status', labels.intro);
  status.setAttribute('role', 'status');
  status.tabIndex = -1;
  const toggle = el('button', 'hf-poll__button', labels.start);
  toggle.type = 'button';
  closed.append(status, toggle);

  // ── Formulaire ──
  const form = el('form', 'hf-poll__form');
  form.noValidate = true;
  form.hidden = true;
  const intro = el('p', 'hf-poll__intro', labels.intro);
  const list = el('ol', 'hf-poll__list');
  const inputs: HTMLInputElement[] = [];
  images.forEach((image, index) => {
    const item = el('li', 'hf-poll__item');
    const group = el('fieldset', 'hf-poll__group');
    const position = { n: index + 1, total: images.length };
    group.append(el('legend', 'hf-poll__legend', fill(labels.scoreLegend, position)));
    const figure = el('div', 'hf-poll__figure');
    const img = el('img', 'hf-poll__image');
    img.src = image.src;
    img.alt = image.alt || fill(labels.imageAlt, position);
    img.loading = 'lazy';
    img.decoding = 'async';
    figure.append(img);
    const row = el('div', 'hf-poll__scores');
    const number = el('span', 'hf-poll__number', String(index + 1).padStart(2, '0'));
    number.setAttribute('aria-hidden', 'true');
    row.append(number);
    for (const score of POLL_SCORES) {
      const label = el('label', 'hf-poll__score');
      const input = el('input', 'hf-poll__radio');
      input.type = 'radio';
      input.name = `${uid}-${index}`;
      input.value = String(score);
      input.dataset['file'] = image.file;
      inputs.push(input);
      label.append(input, el('span', 'hf-poll__score-text', String(score)));
      row.append(label);
    }
    group.append(figure, row);
    item.append(group);
    list.append(item);
  });
  const actions = el('div', 'hf-poll__actions');
  const submit = el('button', 'hf-poll__button hf-poll__button--primary', labels.submit);
  submit.type = 'submit';
  const progress = el('p', 'hf-poll__progress');
  progress.setAttribute('aria-live', 'polite');
  actions.append(submit, progress);
  const error = el('p', 'hf-poll__error', labels.error);
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.append(intro, list, actions, error);
  root.append(heading, closed, form);

  const done = () => images.filter((image) => scores.has(image.file)).length;
  const scoreRecord = () => Object.fromEntries(images.map((image) => [image.file, scores.get(image.file) as number]));

  function refresh(): void {
    const complete = done() === images.length;
    submit.disabled = !complete || sending;
    submit.textContent = sending ? labels.sending : labels.submit;
    submit.setAttribute('aria-busy', String(sending));
    progress.textContent = fill(labels.progress, { done: done(), total: images.length });
    for (const input of inputs) input.checked = scores.get(input.dataset['file'] as string) === Number(input.value);
    status.textContent = submitted ? labels.thanks : labels.intro;
    toggle.textContent = submitted ? labels.edit : labels.start;
    root.toggleAttribute('data-hf-poll-submitted', submitted);
  }

  function announce(restored: boolean): void {
    const Custom = doc.defaultView?.CustomEvent ?? CustomEvent;
    root.dispatchEvent(new Custom('hf:poll-submitted', { bubbles: true, detail: { series, scores: scoreRecord(), restored } }));
  }

  const onToggle = () => {
    closed.hidden = true;
    form.hidden = false;
    error.hidden = true;
  };
  const onChange = (event: Event) => {
    const input = event.target as HTMLInputElement | null;
    const file = input?.dataset?.['file'];
    if (!input || file === undefined || !input.checked) return;
    scores.set(file, Number(input.value));
    refresh();
  };
  const onSubmit = async (event: Event) => {
    event.preventDefault();
    if (sending || done() !== images.length) return;
    sending = true;
    error.hidden = true;
    refresh();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        body: JSON.stringify({ series, scores: scoreRecord() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      if (destroyed) return;
      submitted = true;
      sending = false;
      form.hidden = true;
      closed.hidden = false;
      refresh();
      // Le bouton d'envoi vient de disparaître : le focus va sur la confirmation.
      status.focus();
      announce(false);
    } catch {
      if (destroyed) return;
      sending = false;
      error.hidden = false;
      refresh();
    }
  };
  toggle.addEventListener('click', onToggle);
  form.addEventListener('change', onChange);
  form.addEventListener('submit', onSubmit);
  refresh();

  // Réponse déjà enregistrée (retour du client, autre appareil) : on la reprend.
  const stateUrl = `${endpoint}${endpoint.includes('?') ? '&' : '?'}series=${encodeURIComponent(series)}`;
  void fetch(stateUrl, { headers: { ...options.headers } })
    .then((res) => (res.ok ? (res.json() as Promise<{ submitted?: boolean; scores?: Record<string, unknown> }>) : null))
    .then((state) => {
      if (destroyed || !state?.submitted || submitted) return;
      for (const image of images) {
        const score = state.scores?.[image.file];
        if (typeof score === 'number' && POLL_SCORES.includes(score) && !scores.has(image.file)) scores.set(image.file, score);
      }
      submitted = done() === images.length;
      refresh();
      if (submitted) announce(true);
    })
    .catch(() => {
      // Non bloquant : le client peut noter, l'envoi dira si quelque chose cloche.
    });

  return {
    destroy() {
      destroyed = true;
      toggle.removeEventListener('click', onToggle);
      form.removeEventListener('change', onChange);
      form.removeEventListener('submit', onSubmit);
      root.replaceChildren();
    },
  };
}

/** Monte chaque `SeriesPoll` rendu par le composant (`[data-hf-poll]` et son JSON). */
export function initSeriesPolls(root: Document | Element = document): number {
  let mounted = 0;
  for (const node of root.querySelectorAll<HTMLElement>('[data-hf-poll]:not([data-hf-poll-ready])')) {
    const data = node.querySelector('script[type="application/json"]');
    if (!data) continue;
    const options = JSON.parse(data.textContent ?? '{}') as PollOptions;
    node.setAttribute('data-hf-poll-ready', '');
    if (mountSeriesPoll(node, options)) mounted++;
  }
  return mounted;
}
