---
title: "Garde injection </script><em>marqueur-titre</em>"
date: 2024-01-01
description: "Fixture de non-régression #SEC-001 — ne pas supprimer."
images:
  - file: "01.png"
    alt: "Garde injection </script><em>marqueur-alt</em>"
---

Fixture de test. Le titre et le texte alternatif portent volontairement une
séquence `</script>` : ils sont sérialisés en JSON puis injectés via `set:html`
(JSON-LD du layout de repli, données de la lightbox). Sans échappement de `<`,
la balise se ferme et la suite devient du HTML actif.

Voir `tests/e2e/routes.test.ts` — la série existe pour que ce test ait une prise.
