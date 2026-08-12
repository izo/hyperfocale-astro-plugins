---
title: "Documentaire 2024"
date: 2024-11-03
description: "Série portant des contenus embarqués (§1.11) à côté de sa galerie."
embeds:
  # Lecteur constructible : plateforme reconnue + id.
  - url: "https://vimeo.com/123831041"
    platform: vimeo
    id: "123831041"
    title: "Le film"
    description: "74 min"
    poster: "./media/poster-vimeo.png"
    width: 1920
    height: 1080
  # Plateforme hors du vocabulaire reconnu : dégradation en lien, sans erreur.
  - url: "https://peertube.test/w/abcdef"
    platform: peertube
    id: "abcdef"
    title: "Le même film, ailleurs"
---

`media/` contient deux images : `01.png`, qui est une photo de la série, et
`poster-vimeo.png`, qui est la vignette du premier embed.

La galerie ne doit afficher que la première. C'est la seule exception au
principe « toute image de `media/` alimente la galerie » (§1.11) — sans elle,
une série de vidéos exposerait ses propres posters comme des photos.
