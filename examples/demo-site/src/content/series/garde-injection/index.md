---
title: "Garde injection </script><em>marqueur-titre</em>"
date: 2024-01-01
description: "Fixture de non-régression #SEC-001 et #SEC-002 — ne pas supprimer."
images:
  - file: "01.png"
    alt: "Garde injection </script><em>marqueur-alt</em>"
embeds:
  # Fixture #SEC-002 : un id portant des séparateurs d'URL. Sans encodage, le
  # `?` ouvrirait une query string et le `&` y ajouterait un paramètre, dans une
  # URL dont le chemin est censé s'arrêter à l'identifiant.
  - url: "https://vimeo.com/123831041"
    platform: vimeo
    id: "1?autoplay=0&marqueur-id=1"
    title: "Garde encodage d'identifiant"
---

Fixture de test. Le titre et le texte alternatif portent volontairement une
séquence `</script>` : ils sont sérialisés en JSON puis injectés via `set:html`
(JSON-LD du layout de repli, données de la lightbox). Sans échappement de `<`,
la balise se ferme et la suite devient du HTML actif.

L'`embeds[].id` porte pour sa part des séparateurs d'URL (`?`, `&`) : sans
encodage, ils détourneraient l'URL de lecture construite par `SeriesEmbeds`.

Voir `tests/e2e/routes.test.ts` — la série existe pour que ces tests aient une prise.
