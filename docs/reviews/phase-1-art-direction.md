# Revue Art Director — sortie de phase 1 (tranche verticale « planter un camp »)

> **Relecteur :** Art Director (`.claude/agents/art-director.md`)
> **Date :** 2026-10-28
> **Référence :** `docs/design-system.md` v0.2 (§1, §2, §3, §5, §6.3, §6.4, §7, §10, §11)
> **Objet :** portail « revue AD » de la phase 1 (`docs/development-plan.md`) + point de décision de projection
> **Matériel relu :** 7 captures Playwright (desktop 1440 × 900 : Atlas monde, route + sélection, Nocturne monde, détail Europe ×8 ; Pixel 7 : accueil, route, Nocturne Caraïbes ×6) ; code `apps/web/src/map/{render.ts, overlay.ts, map.css, palette.ts, AtlasMapEngine.ts}`, `apps/web/src/ui/{CompassRose.tsx, MapInstruments.module.css}`, `apps/web/src/lab/{MapLab.tsx, MapLab.module.css}`, `packages/design-tokens/tokens.json`.

## Impression d'ensemble

La carte elle-même est **réussie** et tient la promesse « atlas d'expédition » : océan céladon, lignes d'eau en signature, côte doublée en bavure d'encre, frontières sépia en tirets, graticule discret, fanions sur mât au lieu d'épingles, route orthodromique vermillon propre (passés à 1,5 px / 85 %, étape courante à 2 px), méridien doré lisible, échelle dynamique fonctionnelle, rose à 16 branches sans couleur. Le thème Nocturne est une vraie « table à la lampe », pas un mode néon. À ×8 en 1:50m (capture 04), la gravure reste nette et le prototype **donne envie de toucher la carte**.

Deux défauts touchent cependant aux principes non négociables (une couleur = un sens ; ne rien révéler du jeu par le visuel), et le cadrage mobile ne respecte pas encore la règle des 70 %.

Tous les ratios ci-dessous ont été **calculés** (WCAG 2.1, luminance relative sRGB, couleurs à opacité aplaties sur leur fond réel).

---

## Tableau de revue

### Carte

| Élément | Constat | Gravité | Correction proposée avec token |
|---|---|---|---|
| Hachures des zones non plantables (Antarctique, Kosovo, Sahara occidental, Somaliland, Chypre du Nord…) — captures 01, 03, 04, 05, 06 | `palette.ts` définit `hatch: vermilion-700` et `render.ts` le peint à 45 % en obliques à 45°. C'est **exactement** le langage de la fausse piste (§5.4 : hachures obliques 45° `vermilion-700` 35 %). Viole §1.4.3 et §11.9 (le vermillon sert à un autre sens). Sur toute vue monde, l'Antarctique devient un large bandeau rougeâtre, l'élément le plus bruyant de l'écran. L'état « non plantable » n'existe pas non plus au §5.4. | **bloquant** | Nouveau token `map-unplantable-hatch` : `sepia-600` à 28 %, obliques **135°** (sens opposé à la fausse piste), pas 6 px, trait 0,75 px. Couleur aplatie en Atlas `#CBBEAB`, contraste 1,5:1 sur `paper-200` (motif volontairement discret ; l'information est portée par la forme hachurée + le libellé « Territoire non plantable » dans la `CampBar`, jamais par la couleur seule). Supprimer `hatch` de `mapPalette`. Ajout d'une ligne « Non plantable » au §5.4 (voir annexe A). |
| Halos des micro-États — captures 01, 05, 07 | Les halos en tirets sont **visibles en permanence** autour des seuls États souverains (Petites Antilles, Pacifique, océan Indien) jusqu'à k < 12. Ils indiquent quelles îles sont des pays (Sainte-Lucie oui, Martinique non) : pour une consigne « un État insulaire de l'océan Indien », la carte désigne les réponses valides. Viole §11.10. En outre, à ×6 (capture 07), la chaîne de cercles qui se chevauchent est un bruit visuel, alors que les îles dépassent déjà la cible de 22 px. | **bloquant** | Garder le halo **fonctionnel** (pick buffer, `microStateHaloPx` = 22) mais le rendre **invisible au repos**. Affichage seulement : (a) au survol ou toucher, pour les halos à moins de `map-halo-reveal-radius` = 48 px du pointeur (fondu `dur-quick`) ; (b) dans la loupe ; (c) en option « Atlas annoté ». Visibilité décidée **par entité** (halo visible seulement si l'emprise projetée de l'entité fait moins de 22 px à l'échelle courante, comme le prévoit `.claude/skills/map-interaction/SKILL.md` §3), et non par le seuil global `k < 12`. |
| Étiquette du méridien « MÉRIDIEN · 30° E » | 11 px, `meridian-500` : contraste **3,17:1** sur `sea-100` et **3,35:1** sur `paper-200`. Viole la règle du §2.1 (l'or n'est jamais du texte sous 18 px) et le seuil AA de 4,5:1 (§10). En Nocturne : 8,8:1, conforme. | à corriger | Libellé en `ink-700` (7,53:1 sur `sea-100`), `type-label-caps`, précédé d'un **losange `meridian-500` de 6 px** (élément graphique, 3,17:1 ≥ 3:1). L'or reste sur le trait et le picto. Token `map-meridian-label` = { color: `ink-700`, marker: `meridian-500`, markerSize: 6 }. |
| Graduations du méridien | Absentes : le §5.2 demande de petites graduations dorées toutes les 10° de latitude. | à corriger | `map.meridian.tickEveryDeg` = 10, `map.meridian.tickLength` = 4 px écran, trait 1 px `meridian-500`, perpendiculaire au méridien projeté. |
| Route : hachures transversales des segments passés | Absentes (capture 02 : segment Lisbonne → Mongolie ; capture 06 : Lisbonne → Islande). Le token `map.route.tickEveryKm` = 500 existe mais n'est pas utilisé. | à corriger | Tic perpendiculaire tous les `map.route.tickEveryKm`, longueur `map.route.tickLength` = 5 px écran (nouveau token), 1 px `vermilion-600` 85 %, uniquement sur les segments passés. |
| Route : losange de traversée du méridien | Absent. L'étape Islande → Madagascar (capture 06) franchit 30° E sans aucun marqueur. | à corriger | Losange plein `meridian-500` de 8 px (`map.route.crossingMarkerSize` = 8) avec un liseré 1 px `paper-100`, posé à l'intersection grand cercle × méridien. Seul endroit où l'or touche la route. |
| Survol d'un pays (capture 04, Hongrie) | `render.ts` peint `ink-900` à 6 % : la Hongrie paraît **grise et froide**, et ne suit pas la spécification (§5.4 : `paper-300` + contour 1 px `ink-700`). En Nocturne, l'encre crème à 6 % éclaircit la surface au lieu de la plier. | à corriger | Remplissage `paper-300` (1,15:1 contre `paper-200` en Atlas comme en Nocturne, le contour `ink-700` portant la distinction). |
| Étiquettes des océans | `ink-500` à 85 % sur `sea-100` donne **3,33:1** en Atlas, sous le seuil AA de 4,5:1 (`ink-500` plein ne donne que 4,36:1). Taille plancher de 9 px, illisible sur mobile. Collisions : « Océan Austral » coupé par le méridien (01–06), « Océan Atlantique » collé à la côte saharienne (05). Étiquettes tronquées au bord de l'écran : « Océan Indi… » (05), « Océan Atlan… » (07). | à corriger | Token `map-label-sea` : Atlas `ink-700` à 80 % (aplati `#63636C`, **4,62:1** sur `sea-100`) ; Nocturne `ink-500` à 85 % (aplati `#857F70`, 4,57:1). `map.label.minPx` = 11. Détourage `map.label.haloWidth` = 3 px en `sea-100` (convention cartographique, il coupe le méridien et le graticule sous la lettre). Masquer une étiquette dont la boîte englobante n'est pas entièrement dans la vue. |
| Parallèles remarquables | Tracés en tirets 4-3 comme prévu, mais **sans l'étiquette italique** demandée au §5.2 (Équateur, Tropique du Cancer…). | à corriger | Étiquettes `map-label-sea` en italique Garamond, `map.label.minPx`, posées à un bord de la vue, masquées si collision. |
| Camp `planted` | L'animation descend de 6 px avec un fondu d'opacité. La spécification (§6.3) demande un enfoncement de 2 px et un petit cercle d'onde ; l'onde manque. L'ombre elliptique est conservée pour tous les états, alors qu'elle est propre à `provisional`. | à corriger | `translateY(-2px) → 0` en `dur-quick`, `ease-stamp` ; onde : cercle `vermilion-600` 1 px, r 2 → 12 px, opacité 0,6 → 0, `dur-paper`, `ease-ink`, supprimée sous `prefers-reduced-motion`. Ombre réservée à `provisional`. |
| Camp `provisional` (02, 04) | Conforme : fanion `paper-100` cerné de vermillon, ondulation légère, croix de visée, pointe d'ancrage exacte. | — | — |
| Camps `historic` / `start` (02, 06) | Conformes. Le numéro en Plex Mono 9 px reste juste lisible. | suggestion | Passer le numéro à 10 px (`type-coord` réduit, token `camp-historic-num-size` = 10). |
| Sélection provisoire (02, 04) | Conforme : lavis `vermilion-600` 10 % + contour 1,5 px (contour contre lavis 3,94:1). | — | — |
| Lignes d'eau en Nocturne (03, 07) | Presque invisibles : `sea-300` Nocturne à 60 % sur `sea-100` donne 1,38:1, et l'œil perçoit moins les faibles écarts dans le sombre. La signature visuelle disparaît. | suggestion | `map.waterLines.opacityNocturne` = [0.85, 0.5, 0.26] (même géométrie). |
| Cadre de carte | Filet simple 1 px `ink-900` plein. Le §5.1 prévoit un double filet à 60 % avec graduations, mais **en vue Atlas** : ce n'est pas exigible en jeu. Le filet plein reste un peu dur au bord des pôles plats. | suggestion | En jeu : `ink-900` à 60 %. Double filet + graduations à livrer avec l'Atlas personnel (phase 2.11). |
| Rose des vents | Conforme (16 branches, `ink-900`/`ink-700`, sans couleur, réinitialise la vue, bouton de 52 px ≥ 44 px). Le « N » en `paper-100` à 6 px est illisible ; il est décoratif et le libellé ARIA porte l'information. | suggestion | Supprimer le « N » ou le placer hors de la rose, en `type-coord` `ink-700`. |
| Échelle graphique | Conforme : dynamique, arrondie à 1/2/5 × 10ⁿ, `type-coord`, inversée correctement en Nocturne. | suggestion | Subdiviser la première moitié en deux cases (barre en 3 cases : ¼ ¼ ½), à la manière des échelles IGN. |
| Ancrage de la projection en mobile | Voir « Cadrage mobile » ci-dessous. | — | — |

### Cadrage mobile et chrome (provisoire, signalé pour la phase 2)

| Élément | Constat | Gravité | Correction proposée avec token |
|---|---|---|---|
| Part de la carte, Pixel 7 au repos (capture 05) | La sphère occupe les lignes 550 à 1650 sur 2202 : **50 %** de la hauteur, contre ≥ 70 % exigé (§1.4.1). Le moteur cadre déjà correctement sur la hauteur ; c'est la somme du chrome (cartouche, recherche, 3 bascules, échelle, odomètre, `CampBar`, soit 7 éléments contre 3 maximum au §7) qui écrase la zone libre. Deux bandes de papier vides (environ 90 px au-dessus, 90 px en dessous) viennent s'y ajouter. | à corriger (devient **bloquant au portail de la phase 2**) | Moteur : exposer `fitInsets` (top/bottom en px) pour que le cadrage de repos s'ajuste à la zone libre réelle, marge `map.fit.marginRatio` = 0.04 conservée. Sur `sm`, autoriser la sphère à passer **sous** la marge haute du cartouche (les pôles sont la marge de l'atlas). Chrome `sm` limité à cartouche, `CampBar` (avec odomètre intégré) et rose ; recherche derrière une icône loupe ; bascules de labo dans un menu. Objectif mesuré par Playwright : sphère ≥ 70 % de la hauteur du viewport. **Arbitrage du §5.1** : en `sm` portrait, « monde entier visible au repos » cède devant la règle des 70 % ; le repos cadre sur la hauteur et centre l'expédition en cours (amendement en annexe A). |
| Odomètre (lab) | Laiton en hex écrits en dur (`#b08d57`, `#e3c98f`, `#8f6d3a`, `#24232b`, `#45434f` dans `MapLab.module.css`), contraire à la « définition de terminé ». Chiffres en 20/28 au lieu de `type-odometer` 28/32. | à corriger | Tokens `material-brass` = { stops: [`#B08D57`, `#E3C98F` 45 %, `#8F6D3A`] } et `brass-ink` = `#24232B` (fixe dans les deux thèmes ; 5,03:1 sur le stop clair, 3,27:1 sur le stop sombre, d'où des chiffres centrés dans la bande claire). Chiffres en `type-odometer`. |
| Coordonnées de la `CampBar` | « 25.000° S · 134.000° E » : point décimal en locale `fr` et trois décimales qui suggèrent une précision fictive (centroïde). | à corriger | `Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })` donne « 25,0° S · 134,0° E », en `type-coord`. |
| Sous-titre du cartouche / bascules (lab) | Instrument Sans en 13 px et 12 px, sous `type-small` 14 px (minimum mobile). Ombre de la `CampBar` mobile écrite en dur (`rgb(36 35 43 / .25)`). | suggestion (chrome provisoire) | `type-small` ; ombre `shadow-paper`. |
| Sceau « Planter le camp » | Conforme : cercle 56 px, relief, picto de tente gravé, état désactivé en gris-papier sans relief (picto `ink-500` sur `paper-300` : 4,02:1, au-dessus du seuil de 3:1 d'un élément graphique), anneau de focus conforme. Picto `paper-100` sur `vermilion-600` : 4,85:1. | — | — |
| Liste « ne jamais faire » (§11) | Pas de Mercator, pas d'épingle en goutte, pas de glassmorphisme ni de néon, pas de pilule, pas d'emoji, pas de confetti, pas de pastiche, polices conformes, animations interruptibles. **Points 9 et 10 en défaut** : voir les deux bloquants. | — | — |

### Non couvert par les captures (à fournir pour la contre-revue)

Loupe d'arpenteur (appui long), camp `invalid`, tracé animé avec la pointe d'encre, focus clavier sur la carte (style « sélection provisoire » attendu, §10), `prefers-reduced-motion`, rendu en Natural Earth I. Je demande une capture de chacun dans la série Playwright de référence.

---

## Décision de projection (point de décision de la phase 1)

**Equal Earth est retenue comme projection par défaut, partout** (jeu, Atlas personnel, carte postale). Natural Earth I ne reste qu'une bascule de laboratoire, à retirer de l'interface produit en phase 2.

Justification :
1. **Équité du jeu.** Equal Earth est équivalente : les aires sont vraies. Natural Earth I est une projection de compromis, non équivalente, qui agrandit relativement les hautes latitudes (Russie, Canada, Scandinavie) au détriment des tropiques, où se trouvent la majorité des pays cibles (Afrique, Asie du Sud-Est, Amérique centrale). Dans un jeu où l'on pointe, où l'on estime et où les consignes parlent de taille et de voisinage, une perception honnête des surfaces fait partie de la règle du jeu. C'est aussi le mot « Précis » de notre identité.
2. **Cohérence de l'identité.** Le design system (§5.1, §6.11), le skill `map-interaction` et la carte postale sont déjà décrits en Equal Earth. Une projection unique rend la silhouette du monde reconnaissable d'un écran à l'autre, jusque sur le partage.
3. **Esthétique.** Les pôles plats et les bords latéraux tendus d'Equal Earth donnent un contour d'atlas sobre et monumental, bien servi par le filet de cadre. Les coins arrondis de Natural Earth I sont plus doux, mais l'écart est mineur au repos et ne compense pas le point 1.
4. **Coût assumé.** Equal Earth écrase un peu les formes de haute latitude (Islande, Scandinavie). La capture 04 montre qu'au zoom de travail (×8, 1:50m) l'Europe se lit parfaitement. Ce coût est absorbé par le zoom, le LOD et la rotation vers l'expédition. En portrait, l'écart de rapport d'aspect entre les deux projections (environ 2,05:1 contre environ 1,92:1) ne change rien au problème de cadrage mobile, qui se règle par le chrome et les `fitInsets`.

Réserve de méthode : aucune capture Natural Earth I n'a été fournie. La décision repose sur les propriétés des deux projections et sur les captures Equal Earth. Le rendu étant partagé (même pile d3-geo), elle ne dépend pas d'un détail de rendu.

---

## Annexe A — amendements au design system (à intégrer en v0.3 par l'AD)

- §5.1 : « En `sm` portrait, le repos cadre sur la hauteur de la zone libre (`fitInsets`) et centre l'expédition en cours ; la règle des 70 % prime sur la visibilité du monde entier. »
- §5.2 / §5.4 : nouvel état **Non plantable** = `map-unplantable-hatch` (`sepia-600` 28 %, obliques 135°, pas 6 px, trait 0,75 px), sans lavis ; libellé « Territoire non plantable » dans la `CampBar`.
- §5.2 : `map-meridian-label` (texte `ink-700`, losange `meridian-500` 6 px), `map.meridian.tickEveryDeg` = 10, `map.meridian.tickLength` = 4.
- §5.3 : `map-label-sea` (Atlas `ink-700` 80 %, 4,62:1 ; Nocturne `ink-500` 85 %, 4,57:1), `map.label.minPx` = 11, `map.label.haloWidth` = 3.
- §6.4 : `map.route.tickLength` = 5, `map.route.crossingMarkerSize` = 8.
- Halos : `map-halo-reveal-radius` = 48 px ; halo invisible au repos (règle ci-dessus).
- §4 : `material-brass` et `brass-ink`.
- §2.2 Nocturne : documenter les valeurs déjà présentes dans `tokens.json` mais absentes du document. Contrastes calculés sur `paper-100` Nocturne `#141B22` : `ink-700` `#C7BEAB` 9,41:1 · `ink-500` `#9A927F` 5,62:1 · `vermilion-700` `#C9573B` 4,06:1 (états pressés uniquement, jamais du texte) · rareté sépia `#C29A6E` 6,73:1 · vert-de-gris `#5FB3A1` 6,99:1 · outremer `#8EA6E8` 7,25:1 · cramoisi `#E07A93` 6,1:1 · `meridian-500` `#D9AE55` 8,38:1. Et `paper-300` `#26343F`, `paper-400` `#33424E`, `sea-200` `#18232B`, `sea-300` `#2E4550`.
- Option `map.waterLines.opacityNocturne` = [0.85, 0.5, 0.26].

---

## Verdict

**⚠️ Validé sous réserve.**

La direction de la carte est validée : matières, traits, route, camps, instruments et thème Nocturne sont au niveau attendu. Le portail AD de la phase 1 est **franchi dès la levée des deux bloquants** (hachure non plantable hors vermillon ; halos invisibles au repos). La levée se vérifie en contre-revue sur les captures 01, 04, 05 et 07 régénérées, complétées des captures manquantes listées plus haut. Les points « à corriger » qui touchent la carte (méridien, route, survol, étiquettes, camp `planted`) doivent être soldés avant le début de la tâche 2.7. Ceux qui touchent le chrome (cadrage mobile, odomètre, coordonnées) sont reportés en phase 2, et le cadrage mobile à 70 % devient un critère bloquant de son portail.

---

## Contre-revue (2026-10-28)

> **Matériel relu :** 14 captures (`review2/` : les 01 à 07 régénérées, plus 08 halo révélé, 09 loupe sur le Vatican, 10 états de camp, 11 tracé en cours, 12 focus clavier sur le Bhoutan, 13 mouvement réduit, 14 Natural Earth I). Vérifications ponctuelles dans `apps/web/src/map/{overlay.ts, render.ts}` et `apps/web/src/lab/MapLab.module.css`. Référence : `docs/design-system.md` v0.3.

### Levée des bloquants

| Élément | Constat | Gravité | Correction proposée avec token |
|---|---|---|---|
| Bloquant 1 : hachure des zones non plantables | **Levé.** `map-unplantable-hatch` (sépia à 135°) est appliqué partout : Antarctique (01, 03, 05, 14), Kosovo (04), Somaliland et Sahara occidental (10). Plus aucun vermillon. L'Antarctique redevient un bord de carte calme, et la hachure ne se confond plus avec la fausse piste. | — | — |
| Bloquant 2 : halos des micro-États | **Levé.** Aucun halo au repos (01, 02, 05, 07 : la chaîne des Petites Antilles est enfin nette). Le halo se révèle autour du pointeur (08) et dans la loupe (09). | — | — |

### Points « à corriger » du premier passage

| Élément | Constat | Gravité | Correction proposée avec token |
|---|---|---|---|
| Étiquette et graduations du méridien | Conformes : libellé `ink-700` avec losange `meridian-500` ; graduations tous les 10°. L'implémentation pose 4 px **de chaque côté** (8 px au total), alors que `map.meridian.tickLength` = 4 visait la longueur totale. Élégant sur desktop (01), un peu appuyé sur mobile (05). | suggestion | Ramener à 2 px de part et d'autre, soit `map.meridian.tickLength` = 4 au total. La v0.3.1 précisera « longueur totale ». |
| Tics de route et losange de traversée | Conformes : tics seulement sur les étapes passées (02, 06, 11), losange de 8 px à chaque traversée, sur l'étape passée comme sur l'étape courante (02, agrandi ; 06). | — | — |
| Survol | Conforme : la Hongrie (04) est en `paper-300`, chaude, sans grisaille. | — | — |
| Coordonnées et odomètre | Conformes : « 25,0° S · 134,0° E », `type-odometer`, `material-brass`. | — | — |
| Camp `planted` | Conforme : plus d'ombre au sol (02, 10, 13). | — | — |
| Étiquettes des océans | Couleur, taille et masquage au bord sont conformes (« Océan Indi… » a disparu). **Reste :** « Océan Austral » est toujours barré par le méridien (01, 02, 03, 05, 06, 14). Le détourage est peint dans le canvas, mais le méridien vit dans le SVG au-dessus : le détourage ne peut pas le couper. | à corriger | Écarter l'ancre de l'étiquette du méridien projeté, d'au moins la demi-largeur du texte + 8 px (`space-2`), sur l'axe des longitudes. Ou dessiner les étiquettes d'océans dans le calque SVG, au-dessus du méridien, avec le même détourage `map.label.haloWidth`. |
| Étiquettes des parallèles | Présentes et bien composées. Trois défauts : (a) **pas de test de collision** : « Tropique du Cancer » chevauche « Océan Atlantique » (05, 06) ; (b) posées **sur les terres** avec un détourage `sea-100`, elles laissent une tache bleutée sur le papier (« Tropique du Cancer » sur l'Inde, 12 ; « Cercle polaire arctique » sur l'Alaska, 01 ; « Équateur » sur la Colombie, 10) ; (c) passent **sous le chrome** (« Tropique du Capricorne » sous l'échelle, 07). | à corriger | Ancrer chaque étiquette de parallèle sur le premier tronçon **maritime** visible depuis la gauche, détourage `sea-100` ; à défaut, détourage `paper-200` sur les terres. Masquer l'étiquette si sa boîte croise une étiquette d'océan ou une zone de chrome (mêmes rectangles que les futurs `fitInsets`). Priorité à l'étiquette d'océan. |
| Camp `invalid` (10, agrandi) | Fanion gris déchiré, mais **la croix manque** (§6.3 : « fanion déchiré gris + croix »). Le remplissage `paper-400` ne fait que 1,39:1 sur `paper-200` ; seul le contour `ink-500` (4,61:1) porte la forme. L'état n'est donc distingué que par une nuance de gris et une déchirure de 2 px, presque la couleur seule. | à corriger | Ajouter une croix de 6 px, trait 1,25 px `ink-700` (7,96:1 sur `paper-200`), centrée sur le pied du mât à la place de la croix de visée. Token `camp-invalid-mark` = { size: 6, stroke: `ink-700`, width: 1.25 }. |

### Nouveaux constats (captures inédites)

| Élément | Constat | Gravité | Correction proposée avec token |
|---|---|---|---|
| Route au fort zoom (13, mouvement réduit, Japon) | Le grand cercle se casse en segments rectilignes avec un **angle visible** (au-dessus de la Corée). Le chemin est projeté une seule fois à l'échelle 1 puis agrandi par la matrice : l'échantillonnage adaptatif de d3 est calibré pour k = 1. Une route d'expédition doit rester une courbe d'encre à tous les zooms. Même risque pour le méridien. | à corriger | Recalculer les chemins de route et du méridien au `settle` (fin de geste) avec `projection.precision(0.5 / k)`, ou densifier les grands cercles par `geoInterpolate` à un pas de `map.route.sampleKm` = 50 km (nouveau token). Garder le chemin à k = 1 pendant le geste. |
| Loupe (09) | Conforme et réussie : décalée au-dessus du doigt, cerclage double `ink-900` / `paper-100`, mire vermillon (sens « focus » autorisé), halo révélé, aucun nom de pays affiché. | — | — |
| Focus clavier (12) | Conforme : le Bhoutan reçoit le style « sélection provisoire » (§10), et la `CampBar` annonce le nom et la distance. | — | — |
| Mouvement réduit (13) | Conforme : route tracée d'un coup, fanion planté sans animation, odomètre à sa valeur finale. | — | — |
| Tracé en cours (11) | La pointe d'encre et le segment courant sortent du cadre : la caméra ne recadre pas départ et arrivée avant le tracé. C'est la chorégraphie du §8, prévue en tâche 2.8 : je le note seulement. | suggestion (phase 2.8) | Recadrage `dur-ink` avant `dur-route`, suivant la séquence de référence du §8. |
| Chrome : transparence du cartouche (07, 10) | Fond `paper-100` à 94 % : la carte transparaît (« Cercle polaire arctique » fantôme en 07, camp `historic` ① visible sous le cartouche en 10). Ce n'est pas du glassmorphisme (pas de flou), mais c'est du bruit, et cela masque à moitié un état de camp. | suggestion (chrome, phase 2.7) | Fond `paper-100` opaque. La caméra évite de poser un camp sous le chrome via les `fitInsets` (déjà reportés). |
| Résidu d'information des halos | Au survol (08), les halos révélés ne désignent toujours que des États souverains : la fuite est réduite au voisinage du pointeur, pas supprimée. C'est le compromis accepté, mais à surveiller avec le Game Designer quand les consignes insulaires arriveront. | suggestion (phase 2, avec GD) | Étendre les halos révélés à **toute** île de moins de `microStateHaloPx` à l'écran, souveraine ou non (les dépendances renvoient leur entité ou « non plantable »). Un halo signifie alors « petite terre », pas « État ». |
| Échelle graphique au-dessus des terres (11) | « 500 km » posé directement sur les côtes du Labrador perd en lisibilité. | suggestion | Détourage `paper-100` de 3 px (`map.label.haloWidth`) derrière le libellé de l'échelle. |

### Projection : confirmation sur la capture 14

La capture en Natural Earth I **confirme** la décision Equal Earth. À cadrage identique, Natural Earth I est plus haute : l'Antarctique passe sous la `CampBar` et l'Arctique touche le cartouche. Elle grossit visiblement la Russie, le Canada et l'Antarctique au détriment de l'Afrique. Rien dans son rendu (coins arrondis plus doux) ne compense la perte d'équivalence. **Equal Earth reste la projection par défaut.**

### Verdict final du portail

**✅ Validé : le portail « revue AD » de la phase 1 est franchi.**

Les deux bloquants sont levés et vérifiés, les règles « une couleur = un sens » et « ne rien révéler du jeu » sont respectées, et les états de la carte non couverts au premier passage (loupe, focus, mouvement réduit) sont conformes. Il ne reste aucun point bloquant.

Les quatre points « à corriger » restants sont du polissage cartographique : étiquette « Océan Austral » et méridien, collisions et détourage des parallèles, croix du camp `invalid`, échantillonnage des courbes au zoom. Ils doivent être soldés **avant la tâche 2.7** et seront vérifiés sur les captures 01, 05, 10 et 13. Toujours reportés au portail de la phase 2 : `fitInsets`, cadrage mobile ≥ 70 % et réduction du chrome mobile, ce dernier point restant **bloquant** à ce portail.
