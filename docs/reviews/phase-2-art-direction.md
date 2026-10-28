# Revue Art Director : portail de la phase 2 (boucle de jeu complète)

> **Relecteur :** Art Director (`.claude/agents/art-director.md`)
> **Date :** 2026-10-28
> **Référence :** `docs/design-system.md` v0.3 (§1.4, §2.3, §5.1, §5.4, §6, §7, §8, §10, §11)
> **Build relu :** `a61f363` reconstruit en local (`pnpm build`, `node apps/server/dist/server.mjs`, port 4190).
> **Matériel :** 80 captures Playwright (hors dépôt, `scratchpad/ad2/`) : desktop 1440 × 900 et Pixel 7, thèmes Atlas et Nocturne, FR et EN. Écrans : accueil, consigne au repos, camp provisoire, résolution valide (0,4 à 2,7 s, image par image), fausse piste, carnet ouvert, longue-vue, récapitulatif, carte de défi, carnet d'expéditions, passeport, atlas après partie. Les mesures de cadrage sont faites par `engine.project()` sur le contour de la sphère.
> **Code relu :** `apps/web/src/screens/{PlayView.tsx, useMapInsets.ts, SummaryView.tsx, PassportScreen.tsx}`, `apps/web/src/ui/game/game.module.css`, `apps/web/src/map/{AtlasMapEngine.ts (homeTransform), render.ts (highlight)}`, `packages/design-tokens/tokens.json`.

## Verdict

**❌ Refusé : le portail AD de la phase 2 n'est pas franchi.**

La boucle de jeu est belle sur desktop : cartouche, sceau, fanions, route tiquée, losanges de méridien, hachure de fausse piste avec contour pointillé et fanion `invalid` barré, atlas aquarellé par continent après la partie. Le Nocturne tient. La chorégraphie reste sous 3,5 s (2,6 s pour une étape valide, 3,2 s pour une fausse piste, 0,9 s en mouvement réduit) et se passe d'un tap. **Le portrait n'est pas au niveau** : la carte n'occupe que la moitié de l'écran, le chrome compte cinq éléments, et la note de marge, qui porte l'explication pédagogique, se perd sous la barre.

### Les deux bloquants de la phase 1

| Bloquant phase 1 | État | Preuve |
|---|---|---|
| `fitInsets` et carte ≥ 70 % de la hauteur en portrait | **Non levé.** Les `fitInsets` existent (`useMapInsets`) et servent aux vols de caméra (`flyToBounds`). Ils n'entrent pas dans le cadrage de repos du jeu. | Pixel 7, consigne au repos : sphère de y = 210 à 629 sur 839 px, soit **50 %** (Atlas et Nocturne, FR et EN). La zone libre (104 → 742) offre pourtant 638 px. Cause : `PlayView` passe `insets` et non `homeInsets`, donc `homeTransform()` retombe sur `target = this.height * 0.5` (`AtlasMapEngine.ts` l. 347). Sous la carte, une bande de papier vide d'environ 270 px. |
| Chrome mobile réduit (cartouche, `CampBar` avec odomètre, rose) | **Partiellement levé.** L'odomètre, la recherche et la longue-vue sont bien dans la `CampBar`. Restent deux éléments de trop : l'onglet « Carnet de route » et l'enveloppe des ordres de mission. | Pixel 7 : 5 éléments visibles pendant une étape (cartouche, onglet, rose, enveloppe, `CampBar`), contre 3 + la rose admis (§7). |

---

## Bloquant

| # | Écran | Constat | Règle | Correction proposée |
|---|---|---|---|---|
| B1 | Expédition, `sm` portrait | La sphère occupe **50 %** de la hauteur au repos (mesuré), avec une bande vide d'environ 270 px au-dessus de la `CampBar`. Le récapitulatif mobile laisse aussi environ 30 % de papier vide au-dessus de la carte, et sa route passe sous le panneau. | §1.4.1, §5.1 (portrait `sm` : la règle des 70 % prime), revue phase 1 | `AtlasMapEngine.homeTransform()` : en portrait (`width/height < 0.9`), `target = max(height × map.fit.minMapHeightRatioSm, freeH × (1 − 2 × map.fit.marginRatio))`, avec `freeH = height − insets.top − insets.bottom`, soit 0,7 × 839 = 587 px au Pixel 7. Remplacer le plafond `k ≤ 2.6` par le token `map.fit.maxHomeKSm` = 3.2 (nouveau). Centrer verticalement dans `[insets.top, height − insets.bottom]`, et horizontalement sur le camp courant (§5.1). `PlayView` et `SummaryView` passent leurs insets mesurés à `homeInsets` en plus de `insets`. Critère Playwright : `sphereVisible / innerHeight ≥ 0.70` sur Pixel 7, consigne au repos, dans les deux thèmes. |
| B2 | Expédition, `sm` | Cinq éléments de chrome. L'enveloppe `MissionOrders` duplique la `MissionList` déjà présente dans le carnet. L'onglet « Carnet de route » est un bouton flottant de 32 px de haut, sous la cible de 44 px. | §7 (densité ≤ 3), §6.7 (onglet en marque-page), §10 (cibles ≥ 44 px) | Sur `sm` : masquer `.missions`, les ordres restent dans le carnet. L'onglet du carnet devient un **marque-page** de 44 × 28 px (zone tactile de 44 × 44 px) accroché au bord supérieur de la `CampBar`, à gauche, en `paper-100` avec un filet `ink-900` de 1 px et le libellé en `type-label-caps`. Nouveau token `legLog.tab` = { width: 44, height: 28, hit: 44 }. Chrome visible : cartouche, rose, `CampBar` (avec odomètre et marque-page). |
| B3 | Expédition, `sm` : fausse piste et longue-vue | `MarginNote` est posée à `bottom: 100px` en dur, sans fond, avec un simple `text-shadow`. En FR, elle chevauche frontières et côtes, et le texte « Toucher pour passer » s'écrit **par-dessus** (capture `pixel-atlas-fr-05a`). En EN, la `CampBar` monte à 4 lignes et recouvre la fin de l'explication de la fausse piste, et la note de la longue-vue disparaît **entièrement** sous la barre (`pixel-nocturne-en-06`, `-07`). L'explication pédagogique est perdue. | §6.14, §10 (le résultat est annoncé et lisible), §11.8 | Sur `sm` : `bottom: calc(var(--inset-bottom) + var(--space-2))`, où `--inset-bottom` est la hauteur mesurée de la `CampBar` (déjà calculée par `useMapInsets`). Fond `paper-100` opaque, filet de 1 px `paper-400`, `shadow-paper`, padding `space-3`, au plus 4 lignes (`line-clamp`, texte complet dans le carnet). Garder `sepia-600` sur `paper-100` (6,5:1, calculé au §2.1). Masquer « Toucher pour passer » tant qu'une note est affichée. Nouveau token `margin-note-sm` = { background: `paper-100`, border: `paper-400`, maxLines: 4 }. |

## À corriger

| # | Écran | Constat | Règle | Correction proposée |
|---|---|---|---|---|
| C1 | Expédition et récapitulatif : lavis validé | Le palier Confins (outremer à 18 % sur `paper-200`) s'aplatit en **`#CECCCB`, un gris neutre** (calculé ; mesuré `#C2C0BC` avec le grain). Il se confond avec le voile de la longue-vue (`ink-500` à 14 %, soit `#DED6C6`), lui aussi gris. Deux sens pour un même gris, et le palier ne se lit plus sur la carte. | §1.4.3, §10 (jamais la couleur seule) | État « Validé » (§5.4) = lavis de l'encre du palier à 18 % **plus un contour de 1,25 px dans la même encre**. Contrastes calculés contre `paper-200` : sépia 5,03:1 · vert-de-gris 4,19:1 · outremer 6,76:1 · cramoisi 7,17:1. En Nocturne contre `#1E2A33` : 5,68 · 5,89 · 6,11 · 5,14:1. Token `map.countryState.validOutline` = 1.25. |
| C2 | Longue-vue | Voile `ink-500` à 14 % sur les sous-régions : un gris en Atlas, et en Nocturne l'encre crème **éclaircit** les terres, ce qui se lit comme une mise en avant. C'est le défaut du survol corrigé en phase 1. La caméra ne recule pas : sur la capture 07, on ne voit que deux sous-régions. L'état n'existe pas au §5.4. | §5.4, §1.4.3 | Nouvel état « Indice (longue-vue) » : **aucun lavis**, contour extérieur de chaque sous-région en tirets 6-3 de 1,25 px `ink-700` (7,9:1 sur `paper-200` en Atlas). Token `map.countryState.hint` = { stroke: `ink-700`, width: 1.25, dash: [6, 3] } ; supprimer `hintOpacity`. Après usage, `flyToBounds` sur l'union des sous-régions (`dur-flight`). |
| C3 | Résolution d'une étape (`chor-00` à `chor-06`) | Ordre non tenu : le lavis et le tampon sont déjà posés à t ≈ 0,37 s, **avant** la fin du tracé. Le tracé et l'odomètre finissent vers 0,9 s, puis rien ne se passe jusqu'à 2,6 s (1,7 s de temps mort sous « Toucher pour passer »). Il n'y a pas de vol vers la consigne suivante, et le cartouche passe à la consigne suivante sans repli visible. | §8 (séquence de référence) | Planifier sur les tokens : recadrage `dur-ink` (600), puis tracé `dur-route` (proportionnel), puis lavis `dur-ink` démarré à 70 % du tracé, puis tampon `dur-quick` + 200 ms de repos, puis repli du cartouche `dur-paper`, puis `resetView` en `dur-flight`. `RESOLVE_MS.valid` se calcule comme la somme (plafond 3 500 ms), au lieu des 2 600 ms en dur. |
| C4 | Tampons dans le cartouche et le carnet | À 32–48 px, le code ISO3 fait environ 5 px et ne se lit pas (`crop-stamp-cartouche`). Le §4 exige un tampon lisible à 32 px. | §4, §6.8 | Variante `Stamp size="inline"` (≤ 48 px) : ISO3 seul en IBM Plex Mono 10 px, sans date ni libellé. Le palier est écrit à côté, comme c'est déjà le cas dans le cartouche. Token `stamp.inline` = { size: 40, isoPx: 10 }. |
| C5 | Passeport | Il n'affiche pas le **nom du palier**, seulement « encre fraîche » : la rareté ne passe que par la forme et la couleur, et le §10 exige aussi le libellé. La date manque (§6.8). Les fiches en grille avec ombre portée tirent vers les « cartes UI génériques ». | §10, §6.8, §11.4 | Sous chaque tampon : nom du palier en `type-label-caps` `ink-700` et date en `type-coord`. Retirer `shadow-paper` des fiches et séparer les pays par un filet `paper-400`, à la manière d'une page de passeport. Le livre double page reste en « plus tard ». |
| C6 | Carte de défi (`/x/…?r=`) | Un cartouche seul au centre d'une page **sans carte**. La distance est en Fraunces, pas en Plex Mono. | §1.4.1, §6.15, §6.16 | Poser le cartouche sur l'atlas Equal Earth au repos : méridien de l'expédition visible et port de départ marqué, **sans** route de l'ami (§6.16). Distance en `type-odometer`. |
| C7 | `CampBar`, `sm` | En EN, le texte d'invite prend 4 lignes (« Tap the map to pitch a provisional camp ») et la barre monte à 121 px. La barre est translucide à 96 % et son ombre est en dur (`rgb(36 35 43 / .25)`, déjà relevé en phase 1). | §6.2 (hauteur 88 px), §3 (`type-small`), §4 | Invite en `type-small` 14/20, 2 lignes au plus, texte raccourci : « Touchez un pays » / « Tap a country ». Fond `paper-100` opaque. Ombre `shadow-paper`. |
| C8 | Odomètre | Chiffres en 18 px au lieu de `type-odometer` 28/32 (déjà demandé en phase 1). Pas de rouleaux : la valeur saute. | §6.5 | 28/32 sur `lg`. Sur `sm`, 22/28 via un token `type-odometer-sm` (nouveau). Rouleaux en `ease-ink` synchronisés sur `onRouteProgress` (l'API existe déjà). |
| C9 | Expédition, `lg` | Le carnet ouvert par défaut (300 px) recouvre les Amériques au repos : `homeTransform` ignore l'inset gauche. | §6.7 (colonne), §5.1 | Inclure `insets.left` dans le cadrage de repos sur `lg` (voir B1). |
| C10 | Récapitulatif | « Renommée **23701** » sans séparateur, en chiffres Fraunces, à côté de « 17 459 » formaté. Les ordres accomplis sont des glyphes « ☑ » au lieu d'une case dessinée à la plume. | §3 (chiffres tabulaires), §6.13 | `formatNumber(locale, …)` en IBM Plex Mono `tabular-nums`. Case SVG à la plume, `ink-900`, avec un sceau `meridian-500` de 12 px pour un ordre accompli. |
| C11 | Carnet de route, `sm` | Panneau déroulant de 55 % de la hauteur sous le cartouche, alors que le §6.7 prévoit une feuille basse à 3 crans. | §6.7 | Feuille basse à crans 0 / 40 % / 90 %, ouverte depuis le marque-page de B2, dépliée en `dur-paper` `ease-ink`. |

## Plus tard

| Écran | Constat | Correction proposée |
|---|---|---|
| Récapitulatif | Equal Earth à plat au lieu du globe orthographique qui tourne le long de la route (§5.1, §6.10). | Globe orthographique, dégradé radial `sea-100 → sea-200`, rotation en `ease-camera`, désactivée sous `prefers-reduced-motion`. |
| Récapitulatif | Lavis aux encres de rareté et non à l'aquarelle par continent (§2.3). C'est défendable, à trancher avec le Game Designer. | — |
| Tampon | Pas d'encre fraîche baveuse ni de transition de séchage (§6.8). | Livrer avec le passeport en livre. |
| Passeport | Grille de fiches au lieu du livre double page avec silhouette gravée et index (§6.9). | Phase suivante. |
| Carnet d'expéditions | Pas de mini-carte de la région par entrée (§6.15). | Vignette Equal Earth de 64 × 40 px, trait seul. |
| Vol de caméra | Un niveau de détail grossier apparaît brièvement pendant le dézoom (`chor-01`, en haut à droite). | Garder le niveau de détail fin jusqu'au `settle`. |
| Accueil, `lg` | Le planisphère occupe 54 % de la hauteur. C'est acceptable hors étape, mais il y a beaucoup de papier vide. | Filet double et graduations de cadre (§5.1, vue Atlas) pour habiter la marge. |

## Conformités relevées

- Hachure non plantable sépia à 135° (Sahara occidental, Antarctique) ; halos invisibles au repos ; « Océan Austral » dégagé du méridien.
- Fausse piste : hachure `vermilion-700` à 45° avec contour pointillé, croix dans le cartouche et libellé, fanion `invalid` barré. La couleur n'est jamais seule.
- Sceau « Planter le camp » : état désactivé en papier, état prêt en vermillon. Contrastes Nocturne calculés : texte sombre `#141B22` sur `#E2694B` = 5,27:1.
- Atlas après partie : aquarelle par continent sur fond de terra incognita croisée (§2.3, §5.4).
- §11 : pas de Mercator, d'épingle, de pilule, de confetti ni d'emoji dans le chrome (les emoji restent dans le texte de partage, ce qui est autorisé). Animations ≤ 3,5 s, toutes passables.

## Contre-revue

À présenter : captures `02-leg-rest`, `05a-false`, `06-log-open` et `07-spyglass` en Pixel 7 (Atlas FR et Nocturne EN), avec la mesure `sphereVisible / innerHeight` ≥ 0,70 jointe ; plus `chor-00` à `chor-06` et le récapitulatif mobile. Le portail est franchi dès que B1, B2 et B3 sont levés. C1 à C3 doivent être soldés avant la phase 3. Les tokens nouveaux ou modifiés (`map.fit.maxHomeKSm`, `map.countryState.validOutline`, `map.countryState.hint`, `margin-note-sm`, `legLog.tab`, `stamp.inline`, `type-odometer-sm`) seront intégrés au design system en v0.4 par l'AD.

---

## Suivi (Tech Lead, commit b9df1fa)

- **B1** levé : en portrait, la carte occupe 70 % de la hauteur pendant une étape (mesure E2E `portrait: the map fills at least 70 %`), token `map.fit.maxHomeKSm` = 3.2, centrage sur le camp courant dans la zone libre ; récapitulatif idem.
- **B2** levé : enveloppe des ordres et onglet du carnet masqués sur mobile ; le carnet s'ouvre depuis la `CampBar`.
- **B3** levé : note de marge ancrée sur la hauteur mesurée de la `CampBar`, papier opaque, 4 lignes max ; « Toucher pour passer » dans la cartouche résolue ; `CampBar` sur deux lignes.
- Faits aussi : contour à l'encre du palier pour les pays validés ; longue-vue en tirets `ink-700` sans lavis + recul de caméra ; odomètre desktop au token `type-odometer` ; séparateur des milliers.
- Restent « à corriger » : chorégraphie (tampon après le tracé, vol vers l'étape suivante), lisibilité des tampons < 48 px, carte sur l'écran de défi, nom du palier au passeport, feuille basse du carnet. Contre-revue AD à faire sur des captures régénérées.

---

## Contre-revue (Art Director, 2026-10-28)

> **Build relu :** `6e8bf80` reconstruit en local (`pnpm build`, serveur sur le port 4190). Même méthode que pour le premier passage : desktop 1440 × 900 et Pixel 7, Atlas et Nocturne, FR et EN. Captures régénérées hors dépôt (`scratchpad/ad2/v2/`), plus deux séries ajoutées : la longue-vue à t = 0,3 / 0,9 / 1,6 / 2,6 / 4 s, et la fausse piste FR et EN. Mesures faites par `engine.project()` sur le contour de la sphère.

### Levée des bloquants

| # | Constat | Statut |
|---|---|---|
| B1 cadrage portrait | Pixel 7, consigne au repos : sphère de y = 134 à 721 sur 839 px, soit **69,96 %** (affiché 0,70), identique dans les deux thèmes et les deux langues. Le premier passage mesurait 50 %. La bande de papier vide a disparu. L'expédition est centrée et le méridien entier est visible. Le récapitulatif mobile remplit la moitié haute sans bande vide. | **Levé.** Réserve : on est exactement au seuil. Une variation de chrome (cartouche sur 3 lignes, police de repli) le ferait passer dessous. Viser `map.fit.minMapHeightRatioSm` = 0.72 comme cible du moteur et garder 0.70 comme seuil du test E2E. |
| B2 chrome mobile | Pendant une étape : cartouche, rose et `CampBar` (carnet, odomètre, recherche, longue-vue, sceau). L'enveloppe des ordres et l'onglet flottant ont disparu. Le carnet s'ouvre depuis la barre, avec une cible de 44 px. Sur desktop, l'enveloppe reste à sa place, ce qui est conforme. | **Levé.** |
| B3 note de marge | La note est posée au-dessus de la `CampBar`, sur papier opaque cerné de `paper-400`. « Toucher pour passer » est passé dans le cartouche résolu. Plus aucun chevauchement avec la carte ou la barre, en FR comme en EN (`pixel-*-05a`). | **Levé**, sous trois réserves « à corriger » (R1 à R3). |

### Corrections annexes

| Point | Constat | Statut |
|---|---|---|
| Contour à l'encre du palier (C1) | Burkina Faso (Confins) est cerné d'outremer, la Côte d'Ivoire et le Bénin (Sentier) de vert-de-gris, en Atlas comme en Nocturne. Le palier se lit sur la carte et ne se confond plus avec la longue-vue. | Conforme. |
| Longue-vue (C2) | Plus de lavis : le Nocturne n'éclaircit plus les terres. La caméra recule bien à k ≈ 1,2 sur desktop et revient au repos sur mobile. | Partiellement conforme : voir R4. |
| Odomètre (C8) | 28 px sur desktop (`type-odometer`). Sur mobile, environ 22 px dans la `CampBar`. | Conforme. Rouleaux toujours absents : « plus tard ». |
| Séparateur des milliers (C10) | « Renommée 22 674 » et « 17 459 km » en FR, « 17,459 » et « 22,674 » en EN. | Conforme sur le principe : voir R5 pour le rendu en Plex Mono. |

### Réserves (à corriger, non bloquantes)

| # | Écran | Constat | Règle | Correction proposée |
|---|---|---|---|---|
| R1 | Note de marge, `sm` | `-webkit-line-clamp: 4` est posé sur l'élément qui porte le padding : la moitié haute de la 5e ligne (« aussi Haïti et Vanuatu ») déborde dans le padding bas, sous le filet (`crop-note-fr`). | §4 (net, sans bavure d'interface) | Mettre le clamp sur un `<span>` intérieur, avec `display: -webkit-box`, `overflow: hidden` et `max-height: calc(4 × 20px)`, et laisser le padding sur le conteneur. |
| R2 | Note de marge : fausse piste | À 4 lignes, l'explication est coupée avant sa chute (« … mais… »), et le texte complet n'est disponible nulle part : le carnet affiche seulement « fausse piste ». | §6.14, §10 (le résultat est annoncé) | Dans le carnet, la ligne de l'étape en fausse piste porte l'explication complète en `type-small`, italique `sepia-600`. La note de marge renvoie au carnet par « suite au carnet ». Sinon, limiter `explain` à 160 caractères côté contenu. |
| R3 | Note et carnet ouvert, `sm` | La note reste au premier plan **par-dessus** le carnet ouvert et masque les ordres de mission (`pixel-nocturne-en-06`). | §6.14 (une seule à la fois), §6.7 | Ouvrir le carnet ferme la note (ou la masque tant qu'il est ouvert). Le carnet passe au-dessus de la note dans l'empilement. |
| R4 | Longue-vue | Le rendu trace en tirets `ink-700` **chaque frontière** des pays des sous-régions indiquées, et non le contour extérieur de la sous-région. Pour « un pays sans accès à la mer », presque toute l'Afro-Eurasie se couvre de frontières épaisses (`spy-pixel-atlas-4000`). La carte s'alourdit, et seule une différence de couleur de trait (encre contre sépia) distingue la zone indiquée. | §1.3 (Calme), §5.4 | Fusionner chaque sous-région (`topojson.merge` sur les unités de la sous-région) et ne tracer que **son contour extérieur** : 1,5 px, `ink-700`, tirets 6-3. Les frontières intérieures restent en sépia. Token `map.countryState.hint.width` = 1.5. |
| R5 | Récapitulatif FR | « 17 459 km » en IBM Plex Mono : l'espace insécable occupe une pleine chasse de chiffre, et l'écart ressemble à une double espace (`pixel-atlas-fr-08`). | §3 (chiffres d'instrument) | Composer chaque groupe de chiffres dans son propre `<span>`, séparé par une marge de `0.3ch`, sans caractère d'espace, ou utiliser U+202F en vérifiant qu'il existe dans le sous-ensemble Plex Mono. Même traitement dans l'odomètre. |
| R6 | Récapitulatif | Le cadrage de la route ignore les bords : le camp 2 (Brésil) est coupé à gauche sur mobile, et l'Asie passe sous le panneau sur desktop. | §5.1, §6.10 | `flyToBounds` sur l'emprise de la route avec les insets mesurés (le panneau compte comme inset droit sur `lg` et comme inset bas sur `sm`). |

Restent ouverts, comme indiqué dans le suivi du Tech Lead : C3 (ordre de la chorégraphie), C4 (tampons sous 48 px), C5 (palier au passeport), C6 (carte sur l'écran de défi), C7 en desktop (barre translucide et ombre en dur), C11 (feuille basse du carnet), et la section « plus tard ».

### Verdict final du portail

**⚠️ Validé sous réserve : le portail AD de la phase 2 est franchi.**

Les trois bloquants sont levés et vérifiés sur captures régénérées, dans les deux thèmes et les deux langues. La carte remplit 70 % du portrait, le chrome mobile est réduit aux trois instruments, et la note de marge est lisible. Le palier se lit de nouveau sur la carte. Les réserves R1 à R6 et les points C3 à C6 doivent être soldés **avant le portail de la phase 3**, où ils seront revérifiés sur les mêmes captures (`pixel-*-02`, `-05a`, `-06`, `spy-*`, `-08`). C3 (chorégraphie) et R4 (longue-vue) sont prioritaires, car ils touchent la lecture du jeu.
