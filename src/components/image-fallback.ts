/**
 * Repli d'erreur des images réécrites par un `imageProvider` (#136, P0).
 *
 * Une image dont le fournisseur a changé l'URL porte `data-hf-fallback` : son
 * URL d'origine. Si l'URL réécrite échoue, on bascule une fois sur l'origine,
 * sans `srcset`. `error` ne remonte pas dans le DOM : on écoute en phase de
 * capture, sur le document. Le module ne s'évalue qu'une fois par page, donc un
 * seul écouteur, même si plusieurs composants l'importent.
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

if (typeof document !== 'undefined') initImageFallback();
