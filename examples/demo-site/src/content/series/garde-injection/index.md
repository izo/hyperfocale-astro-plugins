---
title: "Garde injection </script><em>marqueur-titre</em>"
date: 2024-01-01
description: "Fixture de non-régression #SEC-001 et #SEC-002 — ne pas supprimer."
images:
  - file: "01.png"
    alt: "Garde injection </script><em>marqueur-alt</em>"
embeds:
  # Fixture #SEC-002 (spec 2.17, §1.12) : un id portant des séparateurs d'URL est
  # hors du motif `^[A-Za-z0-9_-]{1,128}$`. Il n'entre dans aucune URL de lecture :
  # l'embed se rabat sur son lien.
  - url: "https://vimeo.com/123831041"
    platform: vimeo
    id: "1?autoplay=0&marqueur-id=1"
    title: "Garde encodage d'identifiant"
  # Mutation inverse : un id conforme garde la façade et son URL de lecture.
  - url: "https://vimeo.com/123831041"
    platform: vimeo
    id: "123831041"
    title: "Garde identifiant conforme"
---

Fixture de test. Le titre et le texte alternatif portent volontairement une
séquence `</script>` : ils sont sérialisés en JSON puis injectés via `set:html`
(JSON-LD du layout de repli, données de la lightbox). Sans échappement de `<`,
la balise se ferme et la suite devient du HTML actif.

Un `embeds[].id` porte pour sa part des séparateurs d'URL (`?`, `&`) : hors du
motif de §1.12, il ne détourne aucune URL de lecture et l'embed se rabat sur le
lien. Un second embed, à l'id conforme, garde la façade.

Voir `tests/e2e/routes.test.ts` — la série existe pour que ces tests aient une prise.
