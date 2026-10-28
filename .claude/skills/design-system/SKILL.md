---
name: design-system
description: Applique le design system cartographique premium de Meridian (atlas d'expédition — papier, encre, gravure). À utiliser dès qu'on crée ou modifie un composant d'interface, un style, une animation, une couleur, une police, une texture ou un rendu de carte, ou qu'on relit un écran. Fournit les tokens, les règles de composants et la checklist « ne jamais faire ».
---

# Skill : design-system (Meridian)

Source de vérité : `docs/design-system.md` (propriétaire : agent `art-director`). Ce skill en est le mode d'emploi opérationnel ; en cas de divergence, **le document gagne**.

## Quand l'utiliser
- Création/modification d'un composant dans `apps/web/src/ui` ou `features/*`.
- Toute valeur de couleur, taille, espacement, rayon, ombre, durée, easing.
- Rendu d'une couche de carte (couleurs, épaisseurs, motifs).
- Revue visuelle d'une capture ou d'une PR.

## Procédure
1. **Lire** les sections concernées de `docs/design-system.md` (palette §2, typo §3, matières §4, carte §5, composant §6, espacement §7, mouvement §8, accessibilité §10).
2. **Utiliser uniquement des tokens** : CSS `var(--color-ink-900)`, `var(--space-4)`, `var(--dur-paper)`… ou `tokens.ts` dans le code Canvas. Aucune valeur hexadécimale / px / ms en dur hors de `packages/design-tokens`.
3. **Map-first** : vérifier que la carte reste ≥ 70 % de l'écran et qu'au plus 3 éléments de chrome sont visibles sur mobile pendant une étape.
4. **Sens des couleurs** : vermillon = route/camp/CTA du joueur ; or = méridien ; 4 encres = rareté (+ forme + libellé). Ne jamais réutiliser ces couleurs pour autre chose.
5. **Typographie** : Fraunces (titres, cartouche), EB Garamond (lettrage de carte : pays en petites capitales espacées, eau en italique), Instrument Sans (UI), IBM Plex Mono (chiffres, `tabular-nums`). Rien d'autre.
6. **Mouvement** : `ease-ink` pour les tracés, `ease-stamp` pour les tampons, interpolation de van Wijk pour la caméra ; chorégraphie d'étape ≤ 3,5 s et interruptible ; variante `prefers-reduced-motion` obligatoire.
7. **Accessibilité** : calculer le contraste (formule WCAG) de toute nouvelle paire de couleurs ; cibles ≥ 44 px ; focus visible ; annonces `aria-live` pour les résultats.
8. **Checklist « jamais »** (§11) passée avant de conclure.

## Checklist de revue rapide
- [ ] Aucune valeur visuelle en dur
- [ ] Pas de Mercator, pas d'épingle en goutte, pas de glassmorphism/néon/pilule/emoji dans le chrome
- [ ] Rien ne révèle la réponse avant le choix du joueur (pas d'étiquette, pas de couleur par pays en jeu)
- [ ] Couleur jamais seule porteuse de sens
- [ ] Variante thème Nocturne vérifiée
- [ ] Variante mouvement réduit vérifiée
- [ ] Mobile 360 × 740 et desktop 1440 × 900 vérifiés (captures Playwright)

## Sortie attendue
Code utilisant les tokens + si un token manque : proposition d'ajout (nom, valeur, justification, contraste calculé) à faire valider par `art-director`.
