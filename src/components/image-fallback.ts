/**
 * Repli d'erreur des images réécrites par un `imageProvider` (#136, P0).
 *
 * Une image dont le fournisseur a changé l'URL porte `data-hf-fallback` : son
 * URL d'origine. Si l'URL réécrite échoue, on bascule une fois sur l'origine,
 * sans `srcset`. `error` ne remonte pas dans le DOM : on écoute en phase de
 * capture, sur le document. `mountImageFallback` s'appelle depuis le `<script>`
 * de chaque composant concerné ; la garde garde un seul écouteur.
 */
export function initImageFallback(doc: Document = document): void {
  doc.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const fallback = img.dataset['hfFallback'];
      if (!fallback || img.getAttribute('src') === fallback) return;
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.setAttribute('src', fallback);
    },
    true,
  );
}

/** Un écouteur par page suffit : les `<script>` des composants l'appellent tous. */
let installed = false;
export function mountImageFallback(doc: Document = document): void {
  if (installed) return;
  installed = true;
  initImageFallback(doc);
}
