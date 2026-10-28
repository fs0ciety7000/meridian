# Revue Art Director : MVP public (portail de la phase 3)

> **Relecteur :** Art Director (`.claude/agents/art-director.md`)
> **Date :** 2026-10-28
> **Référence :** `docs/design-system.md` v0.3, en particulier §6.11 (carte postale), §8 (chorégraphie) et §11. Suivi de `docs/reviews/phase-2-art-direction.md` (réserves R1 à R6, points C3 à C6).
> **Build relu :** `0d8e60c`, extrait par `git archive` et reconstruit hors du dépôt (`pnpm build`, serveur sur le port 4191). Pendant la revue, l'arbre de travail du dépôt a changé (HEAD est passé à `c9900b0`, modifications non commitées dans `App.tsx`, `Launcher.tsx`, `store.ts`…) et `apps/web/dist` a été reconstruit à 21:52. **Ce build intermédiaire ne démarre pas** (`Cannot read properties of undefined (reading 'units')`, page blanche). Aucune capture de cette revue n'en provient.
> **Matériel :** environ 110 captures Playwright (Chromium, hors dépôt), desktop 1440 × 900 et Pixel 7, thème Atlas, FR. Parcours d'un nouveau joueur : lanceur, onboarding `MER-0001`, fausse piste à l'étape 1, longue-vue, chorégraphie image par image (13 images sur 3,3 s en desktop, 7 en Pixel 7), récapitulatif, carte postale téléchargée (PNG 1080 × 1350), passeport, écran de défi, `/a-propos`, matière allégée. Son : préférence absente par défaut, donc désactivé (`sound.ts`).
> **Code relu :** `apps/web/src/ui/game/postcard.ts`, `screens/{PlayView, SummaryView, ExpeditionScreen, PassportScreen, Launcher}.tsx`, `ui/Stamp.tsx`, `ui/game/{Odometer, PromptCartouche, MarginNote}.tsx`, `ui/game/game.module.css`, `map/render.ts` (longue-vue), `game/{sound, material}.ts`, `public/manifest.webmanifest`.

## Verdict

**❌ Non signée en l'état. La signature sera acquise dès la levée des trois bloquants B1 à B3**, vérifiée sur les captures de référence `03` et `12` et sur une nouvelle séquence de chorégraphie. Il n'y aura pas de nouvelle revue complète.

Le MVP est beau, et il l'est désormais aussi en portrait. La chorégraphie raconte enfin l'encre dans le bon ordre : cadrage, tracé, tampon, retour au monde, en 3,3 s mesurées. Le récapitulatif cadre toute la route. La longue-vue ne trace plus que le contour des sous-régions. Les tampons de 40 px se lisent. La carte postale a l'allure d'un vrai recto ancien et elle est **partageable**, à une exception près : son oblitération, l'élément qui signe l'objet, est mal composée. Les trois bloquants tiennent chacun en quelques lignes, mais deux d'entre eux touchent le premier contact d'un nouveau joueur, et le troisième l'objet qu'il partagera.

## Bloquants

| # | Élément | Constat | Gravité | Correction proposée avec token |
|---|---|---|---|---|
| B1 | `MarginNote`, `sm` (R1 et R3 de la phase 2, à solder avant ce portail) | **R1 non soldée.** Le `line-clamp` a été remplacé par un `max-height` posé sur l'élément qui porte le padding, si bien que la 5e ligne déborde toujours dans le padding bas : « Portugal ou à la France » apparaît coupé à mi-hauteur (réf. `03`). **R3 non soldée.** La note reste au-dessus du carnet ouvert et masque la fin de la liste, les ordres de mission et les boutons. C'est la **première fausse piste de l'onboarding** (`MER-0001`, explication de 196 caractères) : tout nouveau joueur qui rate l'étape 1 voit ce défaut. | bloquant | Le texte va dans un `<span>` intérieur (`display: -webkit-box; -webkit-line-clamp: 4; overflow: hidden`), le padding reste sur le `<p>`. Ouvrir le carnet masque la note (`{!logOpen && <MarginNote …/>}` sur `sm`), et le carnet passe au-dessus dans l'empilement. Token à ajouter : `margin-note-sm` = { background: `paper-100`, border: `paper-400`, maxLines: 4, lineHeight: 20 }. |
| B2 | Carte postale : oblitération (§6.11) | Le texte « 28 OCT. 2026 » sort du filet intérieur et vient toucher l'anneau extérieur. Le cercle chevauche la dentelure du timbre, et le « 6 » se perd dans les pointillés (réf. `12`). Le libellé « MERIDIAN » exigé par le §6.11 manque. C'est l'élément qui fait « carte postale » : en l'état, il fait brouillon. | bloquant | Composer l'oblitération en **texte sur l'arc** : « MERIDIAN · MER-0001 » en haut de l'anneau, en `type-label-caps` dans la famille `mono`, 14 px, `letter-spacing: .14em`. La date est centrée dans le cercle intérieur en `type-coord` à 15 px, sur une largeur maximale de 2 × rInner − 12. Déplacer le centre pour que l'anneau ne mange que le coin bas-gauche du timbre, sur 24 px au plus et jamais sur le tampon. Encre `ink-900` à 70 %, soit `#636163` aplati : **5,46:1** sur `paper-100` (calculé). Token à ajouter : `postcard.postmark` = { r: 62, rInner: 48, overlapMax: 24, ink: `ink-900`, inkOpacity: 0.7 }. |
| B3 | `Odometer` pendant la chorégraphie (§6.5, §8) | Pendant le cadrage (0 à 0,65 s), l'odomètre affiche **déjà le total final** (4 887), puis **recule** à 146 ou 362 quand le tracé démarre, et remonte. Reproduit en desktop et en Pixel 7, à chaque étape valide. Un instrument qui recule dément ce que la chorégraphie raconte. Cause : `PlayView.tsx` l. 358, `traced` vaut 0 pendant la phase `flight`, donc la valeur affichée retombe sur `totalKm`. | bloquant | `const odometerKm = resolving?.valid && resolving.phase !== 'stamp' ? totalKm - lastLegKm + traced : totalKm;` (le compteur reste sur le total précédent pendant le cadrage). Critère : sur la séquence image par image, la valeur affichée ne décroît jamais. |

## À corriger

| # | Élément | Constat | Gravité | Correction proposée avec token |
|---|---|---|---|---|
| C1 | Tap « Toucher pour passer » | Le tap qui passe la chorégraphie est **aussi lu comme un choix sur la carte**. Après la 6e étape, le récapitulatif mobile affiche le Brésil en sélection provisoire, avec lavis et contour vermillon et un fanion `provisional` à Rio. Le vermillon y prend un sens parasite (§1.4.3). Reproduit deux fois, absent quand on ne tape pas. | à corriger | Tant que `resolving` est non nul, `onPick` et `onConfirm` sont ignorés (garde dans `PlayView`, ou `engine.setPickEnabled(false)`). `SummaryView` appelle `engine.setProvisional(null)` au montage. |
| C2 | Écran de défi (C6 de la phase 2, partiellement soldé) | La carte est bien derrière le cartouche, mais celui-ci est centré et **cache le port de départ** (Rio, ancre `start`) en desktop comme en Pixel 7 : la seule information de carte de l'écran disparaît. En mobile, le code se coupe sur le tiret (« MER- / 0001 »). La distance est en Fraunces et non en `type-odometer`. | à corriger | Sur `sm`, le cartouche se pose en bas, comme la feuille du lanceur. Sur `lg`, il va dans la marge droite, comme le panneau du récapitulatif. Il est mesuré par `useMapInsets` et passé en `homeInsets`, pour que le port et le méridien tiennent dans la zone libre. Code en `font.mono`, `white-space: nowrap`. Distance en `type-odometer` (28/32), `type-odometer-sm` sur `sm`. |
| C3 | Passeport (C4 et C5 de la phase 2) | Les tampons sont rendus à **56 px**, juste au-dessus du seuil `size < 56` de la variante compacte. En desktop, l'ISO fait environ 8 px et « encre fraîche » environ 5 px : ni l'un ni l'autre ne se lit (réf. `10`). Le nom du palier est bien là. La **date** manque (§6.8), et les fiches gardent leur ombre portée (§11.4). | à corriger | Seuil de la variante compacte : `size <= stamp.inline.maxSize`. Token à ajouter : `stamp.inline` = { maxSize: 64, isoPx: 26 (en unités de viewBox) }. Date sous le palier en `type-coord`, `ink-700`. Retirer `shadow-paper` des fiches et séparer les pays par un filet 1 px `paper-400`. |
| C4 | Note de geste de l'onboarding (`coachFirstLeg`) | « Appuyez sur le **sceau rouge** » : à cet instant, le sceau est désactivé, donc couleur papier. Le texte désigne un élément par une couleur qu'il n'a pas (§10). « Touchez » s'affiche aussi sur desktop. La note disparaît au bout d'environ 5 s, même si le joueur n'a encore rien fait. Sur desktop, elle est posée sur la carte sans papier, et les côtes de Sibérie traversent le texte (réf. `07`). | à corriger | FR : « Choisissez un pays d'Afrique, ajustez au besoin, puis pressez le sceau « Planter le camp ». » La note reste affichée jusqu'au premier camp provisoire, puis s'efface en `dur-quick`. Sur `lg`, même traitement papier que `margin-note-sm` (fond `paper-100`, filet `paper-400`, `shadow-paper`). |
| C5 | `CampBar`, `sm` | Dès que l'odomètre passe à 4 chiffres, l'invite « Touchez un pays » se casse sur **3 lignes** dans une colonne d'environ 70 px (réf. `04`). | à corriger | Invite en `type-small` 14/20 avec `white-space: nowrap`. En dessous de 360 px de largeur utile, elle laisse la place et ne reste que dans le lecteur d'écran. Odomètre en `type-odometer-sm` (22/28). |
| C6 | Carte postale, hors oblitération (§6.11, §2.1, §10) | (a) Le palier Sentier est dessiné en **rectangle à coins arrondis** (`roundRect`), alors que l'application et le §2.1 utilisent des coins coupés. (b) La rosace Terra incognita n'a pas d'étoile centrale. (c) Les camps sont des pastilles vermillon pleines : ni les cercles numérotés `historic`, ni l'ancre `start`. (d) Pas de losange de traversée du méridien. (e) Environ 48 px entre « 638 » et « km », ce qui se lit comme une double espace. (f) Le palier n'est jamais écrit, alors que la rareté doit passer par l'encre, la forme et le libellé (§10). | à corriger | (a) Reprendre le polygone de `Stamp.tsx` (`14,6 86,6 94,14 …`, à l'échelle). (b) Étoile `meridian-500`. (c) Camps en cercles numérotés `ink-900` sur `paper-100` (§6.3 `historic`) et ancre au port. (d) Losanges `meridian-500` à 2 × `map.route.crossingMarkerSize`. (e) Écart avant l'unité = 0,5ch, unité en 48 px (moitié de la distance), comme `bigUnit`. (f) Sous le timbre, le nom du palier en `type-label-caps` `ink-700` (8,61:1 sur `paper-100`, calculé). Token à ajouter : `postcard.unitScale` = 0.5. |
| C7 | Longue-vue (R4 soldée) | Le contour fusionné est juste. En portrait, en revanche, les petites îles des sous-régions indiquées (Antilles, Açores, Cap-Vert) deviennent des **pâtés noirs**, parce que les tirets doublés recouvrent tout le trait de côte. Le mouvement est trop appuyé pour le « Calme » du §1.3. | à corriger | Pour une unité indiquée dont l'emprise projetée fait moins de `map.halo.sizePx` (22 px), tracer un seul anneau en tirets de 22 px de diamètre (`ink-700`, 1,5 px, tirets 6-3), à la place du contour. Token à ajouter : `map.countryState.hint.minFeaturePx` = 22. |
| C8 | Vol de caméra (en « plus tard » depuis la phase 2) | Pendant le recul vers le monde, le bitmap gelé à faible définition s'affiche agrandi : côtes en escalier (vu sur la capture du carnet ouvert après la fausse piste). Ce défaut se voit désormais à chaque fin d'étape, puisque la chorégraphie revient au monde. | à corriger | Garder la couche 50m jusqu'au `settle`, ou faire un fondu enchaîné (`dur-quick`) entre le bitmap gelé et le rendu fin. Ne jamais agrandir un bitmap au-delà de ×1,5. |
| C9 | Récapitulatif (C10 de la phase 2) | Ordres de mission toujours affichés avec le glyphe « ☑ ». « Renommée **46 878** » est en Fraunces gras, à côté de la distance en Plex Mono : deux systèmes de chiffres et une troisième graisse. | à corriger | Case SVG à la plume en `ink-900` et sceau `meridian-500` de 12 px (spécification de la phase 2). Renommée en `font.mono` 400 avec `.digitGroup`. |
| C10 | `/a-propos` | Le titre de page (20 px) est **plus petit** que les intertitres (22 px). Le bouton de télémétrie est en Garamond 13 px, sous `type-small` 14. | à corriger | h1 en `type-cartouche` (24/30), h2 en `type-title` (20/26). Bouton en `type-small` (Instrument Sans 14/20), cible de 44 px. La lecture longue en Garamond 18 est acceptée sur cette page éditoriale. |
| C11 | Lanceur : ligne de réglages | Sept liens en ligne. Sur Pixel 7, leurs cibles font environ 24 px de haut, sous les 44 px du §10. Le libellé « Son » ne dit pas s'il active ou s'il indique un état. | à corriger | Libellés d'action : « Activer le son » / « Couper le son ». Sur `sm`, `min-height: 44px` par lien, avec un retour à la ligne par groupe (Passeport · English · Thème / Matière · Son · À propos). |

## Suggestions

| Élément | Constat | Correction proposée avec token |
|---|---|---|
| Carte postale : composition | Une zone vide d'environ 440 × 140 px à droite de la distance. | Y poser la légende de route : « 5 camps · méridien 30° O franchi » en `type-label-caps` `ink-700`, avec le losange `meridian-500`. Le QR facultatif du §6.11 irait au même endroit. |
| Récapitulatif desktop | La moitié basse du panneau droit est vide. Le panneau fait colonne de tableau de bord. | Ajuster la hauteur du panneau à son contenu (`align-self: start`), avec le filet double conservé. |
| Icône PWA | Anneau `ink-900` de 24 px et graticule gris épais : lourd à côté du trait fin de la rose des vents. | Anneau de 12 px, graticule en `ink-500` à 60 %, méridien et camp inchangés. |
| Cadrage desktop, carnet ouvert | Le carnet (300 px) masque encore l'ouest de l'Amérique du Nord au repos (C9 de la phase 2). | Prendre `insets.left` dans `homeTransform` sur `lg`. |

## Réserves de la contre-revue de phase 2

| # | Objet | Statut | Preuve |
|---|---|---|---|
| R1 | Clamp de la note de marge | **Non soldée** (B1) | Réf. `03` : la 5e ligne est coupée sous le filet. |
| R2 | Explication complète de la fausse piste | **Soldée** | Le carnet porte l'explication entière en italique `sepia-600` (6,05:1 sur `paper-200`, calculé). |
| R3 | Note par-dessus le carnet ouvert | **Non soldée** (B1) | Capture du carnet ouvert en Pixel 7 : la note masque la fin de la liste. |
| R4 | Longue-vue : contour extérieur des sous-régions | **Soldée** (reste C7) | Réf. `08` : les frontières intérieures restent en sépia, le contour fusionné est en tirets `ink-700`. |
| R5 | Milliers en Plex Mono | **Soldée** | « 40 638 », groupes séparés de 0,25ch, dans l'odomètre et le récapitulatif. |
| R6 | Récapitulatif cadré sur la route | **Soldée** | Réf. `05` et `09` : les six camps et toute la route sont dans la zone libre, en mobile comme en desktop. |

Points C de la phase 2 : **C3** (chorégraphie) est soldé, à B3 près. **C4** (tampons < 48 px) est soldé dans le cartouche et le récapitulatif, mais pas au passeport (C3 ci-dessus). **C5** et **C6** sont partiellement soldés (C3 et C2 ci-dessus). **C11** (feuille basse à crans du carnet) reste ouvert : le carnet est toujours un panneau de 55 % de la hauteur.

## Conformités relevées

- **Chorégraphie (§8)**, mesurée image par image en desktop : cadrage du départ et de l'arrivée de 0 à 0,65 s ; tracé et rouleaux jusqu'à environ 1,5 s ; tampon dans le cartouche à environ 1,75 s, avec le libellé du palier ; consigne suivante à 2,75 s ; retour au monde achevé à 3,3 s. Total sous 3,5 s, et un tap passe tout. Le lavis et le tampon arrivent après le tracé.
- **Portrait** : la carte occupe environ 72 % de la hauteur au repos à l'étape 1 (de 125 à 730 px sur 839). Chrome réduit au cartouche, à la rose et à la `CampBar`.
- **Tampons < 56 px** : « ATG » se lit dans le cartouche (environ 40 px) et dans le récapitulatif desktop (44 px). L'octogone double et la rosace gardent leur forme.
- **Palier au passeport** : le libellé en petites capitales est présent sous chaque emplacement.
- **Carte postale** : Equal Earth recadré sur la route, toujours en thème Atlas, filet double, papier vergé, timbre portant le palier le plus rare, six mini-tampons dont la fausse piste en croix `vermilion-700` (6,7:1, calculé). Aucune donnée personnelle. Le rendu est identique en desktop et en mobile, donc déterministe.
- **Onboarding** : « Commencer le premier carnet » est l'action principale pour un nouveau joueur, « Nouvelle expédition » passe en secondaire. En mobile, la note de geste est posée sur papier au-dessus de la `CampBar`.
- **Son** désactivé par défaut. Retour haptique limité à la pose du camp et au tampon (§9).
- **Matière allégée** : grain et papier retirés, lignes d'eau conservées. La signature visuelle tient.
- **PWA** : `theme_color` et `background_color` en `paper-100`, icônes normales et maskable.
- **§11** : pas de Mercator, d'épingle en goutte, de pilule, de confetti ni d'emoji dans le chrome (ils restent dans le texte de partage, ce qui est autorisé). Aucune animation non interruptible. Aucun nom de pays ni aucune couleur ne révèle une réponse avant le choix.

## Captures de référence figées

`docs/reviews/reference/`, 12 PNG, 2,04 Mo au total, build `0d8e60c`, thème Atlas, FR, parcours `MER-0001` (fausse piste à l'étape 1, puis Antigua-et-Barbuda, Autriche, Andorre, Australie, Angola ; 40 638 km).

| Fichier | Écran |
|---|---|
| `01-pixel-launcher-first-time.png` | Lanceur, nouveau joueur |
| `02-pixel-onboarding-leg1.png` | Étape 1 au repos, note de geste |
| `03-pixel-false-trail-note.png` | Fausse piste et note de marge (montre B1) |
| `04-pixel-resolution-stamp.png` | Chorégraphie : tampon posé (montre C5) |
| `05-pixel-summary.png` | Récapitulatif |
| `06-pixel-challenge.png` | Écran de défi (montre C2) |
| `07-desktop-onboarding-leg1.png` | Étape 1 au repos, carnet ouvert |
| `08-desktop-spyglass.png` | Longue-vue |
| `09-desktop-summary.png` | Récapitulatif |
| `10-desktop-passport.png` | Passeport (montre C3) |
| `11-desktop-challenge.png` | Écran de défi |
| `12-postcard-mer-0001-1080x1350.png` | Carte postale téléchargée, sans perte (montre B2) |

Pour tenir le budget de 3 Mo, les captures d'écran sont réduites en palette de 256 couleurs, sans tramage. Les **couleurs des tokens sont forcées dans la palette**, ce qui garde exactes les teintes vermillon, or, encres de rareté, encre et papier. Les captures Pixel 7 sont ramenées à la résolution CSS (412 × 839). La carte postale est conservée sans perte. Ces images sont une **référence de revue**, pas une base de comparaison au pixel. Les références de régression visuelle restent celles des tests Playwright.

## Tokens à intégrer en v0.4 du design system

`margin-note-sm` (B1, étendu à `lg` par C4) · `postcard.postmark` (B2) · `postcard.unitScale` (C6) · `stamp.inline.maxSize` (C3) · `map.countryState.hint.minFeaturePx` (C7). Ils s'ajoutent à ceux déjà annoncés en phase 2 (`map.fit.maxHomeKSm`, `map.countryState.validOutline`, `map.countryState.hint`, `legLog.tab`, `stamp.inline`, `type-odometer-sm`). L'AD les intègre au design system à la levée des bloquants.

## Pour signer

1. B1 : régénérer la réf. `03`, plus la même scène carnet ouvert. Aucune ligne coupée, et la note est masquée quand le carnet est ouvert.
2. B2 : régénérer la réf. `12`. L'oblitération est lisible et ne touche pas le tampon.
3. B3 : une séquence de chorégraphie image par image, dans laquelle la valeur de l'odomètre ne décroît jamais.

Les points C1 à C11 doivent être soldés avant la v1.1. C1 (tap qui pose un camp) et C2 (port masqué) sont prioritaires.
