/**
 * Script client de `SeriesLightbox` (#136, P1) : une `<dialog>` natif, modale,
 * pilotée par `showModal()`. Le module est testé en happy-dom
 * (tests/components/lightbox-client.test.ts) ; le composant l'importe.
 *
 * API publique, sur `window.hfLightbox` : `open(index)`, `close()`,
 * `setImages(list)` (série déverrouillée après coup). Événements émis sur la
 * `<dialog>` : `hf:lightbox-open` et `hf:lightbox-navigate`, `detail: { index }`.
 */

export interface LightboxImage {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface LightboxApi {
  open: (index: number) => void;
  close: () => void;
  setImages: (list: LightboxImage[]) => void;
}

const ids = {
  dialog: 'hf-lightbox',
  img: 'hf-lightbox-img',
  caption: 'hf-lightbox-caption',
  counter: 'hf-lightbox-counter',
  close: 'hf-lightbox-close',
  prev: 'hf-lightbox-prev',
  next: 'hf-lightbox-next',
  data: 'hf-lightbox-data',
} as const;

function byId<T extends HTMLElement>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null;
}

/** Monte la lightbox du document. Rend `undefined` si le markup n'est pas là. */
export function initLightbox(doc: Document = document): LightboxApi | undefined {
  const dialog = byId<HTMLDialogElement>(doc, ids.dialog);
  const img = byId<HTMLImageElement>(doc, ids.img);
  const caption = byId<HTMLElement>(doc, ids.caption);
  const counter = byId<HTMLElement>(doc, ids.counter);
  const btnClose = byId<HTMLButtonElement>(doc, ids.close);
  const btnPrev = byId<HTMLButtonElement>(doc, ids.prev);
  const btnNext = byId<HTMLButtonElement>(doc, ids.next);
  const dataEl = byId<HTMLElement>(doc, ids.data);
  if (!dialog || !img || !caption || !counter || !btnClose || !btnPrev || !btnNext || !dataEl) return undefined;

  const loop = dialog.dataset['hfLoop'] === 'true';
  const decorative = dialog.dataset['hfDecorativeAlt'] === 'true';
  const altTemplate = dialog.dataset['hfLabelAlt'] ?? '{n} / {total}';
  const counterTemplate = dialog.dataset['hfLabelCounter'] ?? '{n} / {total}';

  let images: LightboxImage[] = JSON.parse(dataEl.textContent ?? '[]');
  let current = 0;
  let isOpen = false;
  let previousFocus: HTMLElement | null = null;

  const fill = (template: string, n: number) =>
    template.split('{n}').join(String(n)).split('{total}').join(String(images.length));

  // Bornes : sans `loop`, un bouton arrivé au bout passe en `aria-disabled` et
  // ne fait rien ; avec `loop`, la navigation boucle.
  function setBoundary(button: HTMLButtonElement, disabled: boolean) {
    button.setAttribute('aria-disabled', String(disabled));
    button.style.display = images.length <= 1 ? 'none' : '';
  }

  function preload(index: number) {
    const target = images[index];
    if (!target) return;
    const Ctor = doc.defaultView?.Image ?? Image;
    new Ctor().src = target.src;
  }

  function show(index: number, emit: boolean) {
    if (images.length === 0) return;
    const last = images.length - 1;
    if (!loop && (index < 0 || index > last)) return;
    current = ((index % images.length) + images.length) % images.length;
    const image = images[current];
    if (!image) return;

    img!.src = image.src;
    img!.alt = decorative ? '' : (image.alt ?? fill(altTemplate, current + 1));
    caption!.textContent = decorative ? '' : (image.alt ?? '');
    caption!.hidden = decorative || !image.alt;
    counter!.textContent = fill(counterTemplate, current + 1);

    setBoundary(btnPrev!, !loop && current === 0);
    setBoundary(btnNext!, !loop && current === last);
    preload(current - 1);
    preload(current + 1);

    if (emit) dialog!.dispatchEvent(new CustomEvent('hf:lightbox-navigate', { detail: { index: current } }));
  }

  function open(index: number) {
    previousFocus = doc.activeElement as HTMLElement | null;
    show(index, false);
    isOpen = true;
    if (typeof dialog!.showModal === 'function') dialog!.showModal();
    else dialog!.setAttribute('open', '');
    doc.body.style.overflow = 'hidden';
    btnClose!.focus();
    dialog!.dispatchEvent(new CustomEvent('hf:lightbox-open', { detail: { index: current } }));
  }

  function finish() {
    if (!isOpen) return;
    isOpen = false;
    if (dialog!.open && typeof dialog!.close === 'function') dialog!.close();
    else dialog!.removeAttribute('open');
    doc.body.style.overflow = '';
    previousFocus?.focus();
  }

  btnClose.addEventListener('click', finish);
  btnPrev.addEventListener('click', () => show(current - 1, true));
  btnNext.addEventListener('click', () => show(current + 1, true));

  // Esc ferme la dialog natif : son événement `close` remet l'état à jour.
  dialog.addEventListener('close', () => {
    if (!isOpen) return;
    isOpen = false;
    doc.body.style.overflow = '';
    previousFocus?.focus();
  });

  // Clic sur le fond (la dialog elle-même, hors de la scène) : fermer.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) finish();
  });

  // Swipe tactile — passif, pour ne pas bloquer le défilement natif.
  let touchStartX = 0;
  dialog.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0]?.clientX ?? 0;
  }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    const delta = touchStartX - (e.changedTouches[0]?.clientX ?? 0);
    if (Math.abs(delta) < 50) return;
    show(delta > 0 ? current + 1 : current - 1, true);
  }, { passive: true });

  doc.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'ArrowLeft') show(current - 1, true);
    if (e.key === 'ArrowRight') show(current + 1, true);
  });

  const api: LightboxApi = {
    open,
    close: finish,
    setImages(list) {
      images = list;
      current = 0;
      if (isOpen) show(0, false);
    },
  };
  return api;
}

/**
 * Monte la lightbox du document et expose `window.hfLightbox`. Appelé par le
 * `<script>` de `SeriesLightbox` : un import sans effet serait écarté au
 * bundle, `sideEffects` ne listant que les CSS. Un seul montage par page.
 */
export function mountLightbox(doc: Document = document): void {
  const win = doc.defaultView as (Window & { hfLightbox?: LightboxApi }) | null;
  if (!win || win.hfLightbox) return;
  const api = initLightbox(doc);
  if (api) win.hfLightbox = api;
}
