# Revue QA et équilibrage : portail de la phase 2

- **Date** : 2026-10-28 | **Relecteur** : qa-balance
- **Périmètre** : bibliothèque v1 (`content/library/prompts.json`, 136 consignes au départ), 30 expéditions du catalogue, 50 expéditions générées.
- **Critère** (development-plan, phase 2) : « les 30 expéditions du catalogue et la bibliothèque passent prompt-forge ; QA a joué les 30 + 50 générées et aucun fait contesté n'est relevé ».
- **Scripts** (hors dépôt) : `/tmp/claude-0/-home-user-meridian/b28bb239-e1d0-5686-80c1-8927145af87d/scratchpad/qa2/` (`dump.py`, `edges.py`, `edit_prompts.py`, `sim.ts`, `analyze.py`).
- **Réseau** : le réseau était indisponible pendant cette session. Les sources citées sont les articles de référence, sans relecture en ligne ce jour. Les 5 nouvelles valeurs de `curated.json` (§3.3) sont à revérifier en ligne au prochain `pnpm facts snapshot`.

## 1. Verdict

**Critère atteint pour le contenu, avec deux réserves qui relèvent d'autres rôles.**

- `pnpm facts && pnpm forge` : 0 erreur, 0 avertissement. La bibliothèque compte désormais 133 consignes, 120 ports et 30 expéditions.
- `pnpm facts:check` et `pnpm forge:check` passent. `pnpm vitest run --project prompt-forge --project engine --project facts-pipeline` : 49 tests passent sur 49.
- Les 30 expéditions du catalogue et les 50 générées ont été jouées par 4 joueurs synthétiques (§5). Aucune étape ne descend sous 3 réponses restantes. Aucun fait faux connu ne subsiste dans les 133 consignes.
- **Réserve 1 (KO, données)** : la salience de la Palestine vaut 0,005. PSE est donc toujours classée *incognita*, ce qui lui donne un multiplicateur ×1,5 (§6, B2). La correction passe par un nouveau snapshot Wikidata, hors de mon périmètre.
- **Réserve 2 (bug moteur)** : la consigne contextuelle « Un voisin de ton dernier camp » utilise `entity.neighbors`, qui reflète la géométrie de la carte, alors que les consignes `borders.*` utilisent `facts.borders`, qui suit les frontières de jure. Cinq paires de pays sont jugées différemment selon la consigne (§6, B1).

## 2. Doutes du game designer : arbitrages

| Élément | Attendu | Observé | Verdict | Source ou preuve |
|---|---|---|---|---|
| Tropique du Cancer et USA (îles Hawaï du Nord-Ouest) | USA non traversés : le tropique passe en mer, entre Nihoa (23,06° N) et Necker (23,58° N) | `crossesTropicOfCancer` USA = false | OK | https://en.wikipedia.org/wiki/Tropic_of_Cancer : la liste usuelle compte 16 États, sans les USA. Le joueur informé suit cette liste |
| Tropique du Capricorne : Polynésie française et Pitcairn | FRA et GBR non traversés : la ligne passe en mer entre Tubuai et Raivavae, et au nord de toutes les îles Pitcairn | false / false | OK | https://en.wikipedia.org/wiki/Tropic_of_Capricorn (10 États). Aucune consigne « tout entier sous les tropiques » ne concerne FRA, GBR ou USA |
| Équateur : Maldives et Kiribati | Comptés : ils font partie de la liste usuelle des 13 pays, mais la traversée se fait en mer | true | OK, explication corrigée | https://en.wikipedia.org/wiki/Equator. L'ancienne explication disait que l'équateur touchait « un atoll du Sud » des Maldives, ce qui est faux : il passe dans le chenal entre Huvadhu et Fuvahmulah |
| Maurice : langues officielles | Pas de langue officielle de jure ; anglais et français de facto | [english, french] | OK (règle « de jure ou de facto » de facts-qa) | https://en.wikipedia.org/wiki/Languages_of_Mauritius. Accepter MUS ne piège personne : un joueur qui pense « aucune langue officielle » ne la plantera pas |
| Burkina Faso, Mali, Niger : français | Français devenu « langue de travail » (2023–2025) : un piège pour « français officiel » | refusés par `society.french` | KO, corrigé | https://en.wikipedia.org/wiki/Languages_of_Mali , https://en.wikipedia.org/wiki/Burkina_Faso , https://en.wikipedia.org/wiki/Niger. Voir §3.1 |
| Salience de la Palestine | Notoriété élevée (ISR = 0,876) | 0,005 (rang 194 sur 195). Q219060 n'a que 225 sitelinks, au niveau des micro-États | **KO, hors périmètre** | Calcul de palier a priori (`computeRarity`, α = 200, β = 1,4) : PSE est *incognita* dans les 5 consignes où elle est valide (coast-small, subtropical-north, temperate-coast, arab-league, flag.black), alors que ISR et LBN sont *known* ou *trail*. Voir B2 |
| Gibraltar dans les frontières ESP–GBR | Non compté : zone contestée, non plantable et sans État de rattachement, comme la Crimée et le Golan (politique v2). Mais un joueur informé peut compter 5 voisins à l'Espagne | ESP : 4 voisins (AND, FRA, MAR, PRT) | OK sur le fait, piège corrigé | `curated.json` ESP (note), `docs/geo-policy-changelog.md`. L'Espagne est désormais acceptée aussi pour « exactement cinq voisins » (§3.1) |

## 3. Corrections faites

### 3.1 Consignes (`content/library/prompts.json`, libraryVersion 1 conservée)

| Consigne | Problème (preuve) | Correction | Effet sur les réponses |
|---|---|---|---|
| `society.dense` | Seuils au fil du rasoir : KOR fait 97 166 km² dans Natural Earth contre 100 363 km² selon Wikipedia ; ISR compte 9,84 M d'habitants contre environ 10,0 M (CBS, fin 2024) ; AZE 10,18 M ; ARE 9,9 M ou 10,9 M selon la source. Aucun couple de seuils (10–15 M, 50–125 k km²) n'évite toutes ces bordures (balayage `edges.py`) | **Retirée** | Expédition 0014 : jambe 6 → `society.over-100m` |
| `borders.few-people-many-neighbours` | ISR (5 voisins) est valide avec 9,84 M, alors qu'Israël a dépassé 10 M ; AZE est à 1,8 % du seuil. Les autres seuils testés (8, 8,5 et 9 M) tombent sur LAO, AUT, CHE et BLR | **Retirée** | Inutilisée au catalogue |
| `position.mid-200k` | Bornes 200 000 et 300 000 km² : PHL = 300 000 km² (chiffre officiel), ITA = 302 068, KGZ = 199 951, SEN = 196 722 | **Retirée** | Inutilisée au catalogue |
| `society.french` | BFA, MLI et NER refusés alors qu'un joueur informé les jouerait | « Hors Afrique de l'Ouest, le français y est officiel » ; prédicat + `not subregion 011` | 27 → 22 réponses (−BEN, CIV, GIN, SEN, TGO), 4 continents |
| `water.island-north`, `water.island-populous`, `water.island-beyond-tropics`, `position.north-east-islands` | Chypre est une « île-nation » (« island country », https://en.wikipedia.org/wiki/Cyprus) mais était refusée à cause des bases britanniques | Prédicat île := `hasLandBorder = false` **ou** (seul voisin GBR, hors Europe). Seule CYP est concernée. Explications corrigées. `water.island-nation` (« sans frontière terrestre ») reste strict | +CYP pour chacune |
| Toutes les consignes « tout entier entre les tropiques » (11) | Le Tchad (`northernmostLat` 23,45) n'est ni traversé par le tropique (facts-qa) ni « tout entier » tropical : le joueur est refusé dans les deux cas | Borne nord 23,44 → 23,5 (NER, à 23,52, reste exclu : il est traversé) | +TCD pour `climate.tropical-giant` et `climate.tropical-landlocked` |
| `climate.equatorial-north` | La Sierra Leone culmine en latitude à 10,00° N exactement (« between 7° and 10° N ») | `lt 10` → `lte 10` | +SLE |
| `climate.equator` | Explication fausse pour les Maldives | Explication réécrite | Aucun |
| `borders.exactly-five` | Gibraltar : l'Espagne a 4 ou 5 voisins selon qu'on le compte | `any`[5 voisins ; voisin d'AND **et** de MAR], ce qui ne vise que l'Espagne. Explication complétée | +ESP |
| `society.tiny-left`, `society.tiny-republic` | Seuil de 200 000 sur WSM : 200 010 (Wikidata), 205 557 (recensement 2021), environ 218 000 (BM) | Seuil 200 000 → 150 000 (KIR à 134 518 : marge de 10 %) | tiny-left : −LCA (10 réponses). tiny-republic : inchangée (8) |
| `position.under-1000`, `position.micro-beyond-europe`, `climate.tropical-specks` | Seuil de 1 000 km² sur STP : 964 km² (CIA), 1 001 (Wikipedia), 1 042 (NE) | Seuil → 1 500 km² (COM, à 1 679, reste à plus de 10 %). Les identifiants ne changent pas | +STP pour les trois |
| `flag.*` « rien d'autre » (6), `flag.no-red`, `flag.yellow-no-red`, `flag.tiny-no-red`, `flag.yellow-white-no-red`, `flag.red-no-white-blue` | « Sans la moindre touche de rouge » est faux pour le Vatican (cordon rouge des clés), le Guatemala, le Nicaragua et le Salvador (armoiries). Les armoiries étaient ignorées pour ESP, SRB, FJI, BLZ et DOM mais comptées pour HRV | Texte : « …, hors armoiries ». Explication de toutes les consignes drapeau : « Les armoiries (écus, blasons) ne comptent pas ». Faits HRV et PRT alignés (§3.3) | +HRV pour red-white-blue ; −HRV pour black et black-and-blue ; −PRT pour green-yellow-red |
| `position.pacific-isles` | La Nouvelle-Zélande est polynésienne (triangle polynésien), mais refusée | « Un pays insulaire du Pacifique, hors Australie et Nouvelle-Zélande » | Aucun |
| `position.caribbean` | Belize, Guyana, Suriname (CARICOM), Colombie et Venezuela sont « des Caraïbes » au sens large, mais refusés | « Un État insulaire des Caraïbes » | Aucun |
| `position.central-america` | Le Mexique n'est pas en « Amérique centrale » au sens courant en français | « …, Mexique compris » | Aucun |
| `position.ctx-same-continent`, `position.ctx-other-continent` | Pays transcontinentaux ambigus (TUR, CYP, Caucase, KAZ en AS ; RUS en EU ; EGY en AF ; PAN en NA) | Convention ONU ajoutée à l'explication. Afficher le continent dans l'interface reste recommandé (R5) | Aucun |

### 3.2 Expéditions du catalogue

| Expédition | Problème | Correction |
|---|---|---|
| 0014 | `society.dense` retirée | Jambe 6 → `society.over-100m` (Inde, Bangladesh, Pakistan, Indonésie : thème océan Indien) |
| 0004 | `position.south-east` ⊂ `climate.southern` (recouvrement 1,00) | Jambe 5 → `position.large` (recouvrement 0,24) |
| 0007 | `climate.north-of-55` ⊂ `climate.north-of-50` (1,00) | Jambe 5 → `position.giants` (0,56) |
| 0021 | `climate.capricorn` / `climate.deep-south` (0,90) | Jambe 4 → `relief.landlocked-mid-heights` (0,10) |
| 0025 | `water.island-tiny` ⊂ `position.micro-beyond-europe` (1,00) | Jambe 5 → `water.island-right-hand` (0,42) |
| 0023, 0024 | Recouvrements de 1,00 (low-islands ⊂ tropical-specks ; tiny-left ⊂ island-tiny) | **Conservés** : ils sont voulus par la note de design (« ne jamais réutiliser le même »). Il reste au moins 6 réponses à chaque étape (§5) |

Toutes les missions restent réalisables (vérification par recherche gloutonne de prompt-forge).

### 3.3 Faits (`content/facts/curated.json`)

| Élément | Attendu | Observé | Verdict | Source ou preuve |
|---|---|---|---|---|
| VNM.population | 101,3 M (GSO 2024 ; le cap des 100 M a été franchi en 2023) | 96,2 M (Wikidata, recensement 2019) : le Viêt Nam était refusé pour « plus de 100 M » | KO corrigé | https://en.wikipedia.org/wiki/Demographics_of_Vietnam |
| SAU.areaKm2 | 2 149 690 | 1 925 880 (NE, −10 %) : l'Arabie saoudite était valide pour « entre 1 et 2 millions de km² » | KO corrigé | https://en.wikipedia.org/wiki/Saudi_Arabia |
| HRV.flagColors | blue, red, white (armoiries non comptées) | + black, yellow (venus des armoiries) | KO corrigé | https://en.wikipedia.org/wiki/Flag_of_Croatia |
| PRT.flagColors | green, red (sphère armillaire et écu = petites armoiries) | + yellow | KO corrigé (règle) | https://en.wikipedia.org/wiki/Flag_of_Portugal |
| CYP.flagColors | Cuivre (#D57800) lu comme orange autant que brun | brown seul : Chypre était refusée pour « de l'orange » | Douteux, résolu en acceptant | https://en.wikipedia.org/wiki/Flag_of_Cyprus |

## 4. Douteux restants (non corrigés, sans piège à refus)

| Élément | Observé | Verdict | Raison |
|---|---|---|---|
| KAZ.highestPointM 7 010 (`relief.over-7000`) | Khan Tengri : 7 010 m avec la calotte, 6 995 m pour la roche | Douteux | Le Kazakhstan est accepté : un joueur qui pense 6 995 m ne le plantera pas |
| MWI 3 002 m (`relief.southern-heights`, exclu de `landlocked-mid-heights`) | Sapitwa : 3 002 m | OK | Conforme à Wikipedia ; marge de 0,07 % |
| AFG.flagColors (drapeau taliban : black, white) | — | Douteux (sensible) | Aucun refus possible, quel que soit le drapeau auquel pense le joueur (vérifié sur les 21 consignes drapeau) |
| EGY.flagColors contient yellow (aigle de Saladin = armoiries) | — | Douteux (règle) | Aucun effet sur les réponses ; à aligner au prochain passage sur les faits |
| SDN 50,4 M (`climate.tropical-populous`), SVK 49 035 km², BEL 30 528 km² | Marges de 1 à 2 % | OK | Valeurs conformes aux sources de référence ; un joueur informé tranche dans le même sens |
| Recouvrements 0,6–0,82 dans 0001, 0003, 0015 | — | OK | Thèmes voulus ; jamais moins de 12 réponses restantes |

## 5. Parties simulées

Méthode : `reduce` avec un camp planté au point de visée. Il y a 4 joueurs :
- **glouton** : le pays valide le plus lointain ;
- **prudent** : le pays valide le plus célèbre ;
- **aléatoire** : un pays valide au hasard, 20 parties ;
- **pondéré** : un tirage selon salience^1,4, 20 parties. C'est le modèle du joueur informé.

Il y a en tout 80 expéditions et 3 360 parties. Les 50 expéditions générées le sont pour les graines `hash32(20261028, i)`, en alternant facile, normal et expert (17/17/16) ; aucune ne bascule sur l'expédition de secours. Le générateur a aussi été lancé sur 1 800 graines supplémentaires : aucun repli n'a eu lieu, et 28 % des expéditions ont une jambe 6 contextuelle.

| Indicateur | Cible | Catalogue (30) | Générées (50) | Verdict |
|---|---|---|---|---|
| Distance médiane, joueur pondéré (prudent) | 30–45 000 km | 43 700 (40 700) | 49 800 (47 800) | OK au catalogue ; générées 10 % au-dessus |
| Renommée médiane, joueur pondéré (prudent) | 35–55 000 | 51 700 (44 400) | 59 000 (52 900) | OK au catalogue ; générées 7 % au-dessus |
| Paliers, joueur pondéré | 50/30/15/5 | 52/28/15/5 | 50/30/15/5 | OK. C'est attendu par construction : le palier estimé vient du même a priori |
| Paliers, joueur aléatoire | — | 26/24/24/26 | 28/24/23/25 | L'audace paie : renommée +15 à +22 % par rapport au joueur pondéré |
| Ordres, part de la renommée (max) | ≤ 15 % | 4,7 % médiane (13,0 %) | 8,8 % (12,9 %) | OK |
| Méridien franchi au moins une fois, joueur pondéré | 30–60 % | **85 %** | **61 %** | KO au catalogue, limite pour les générées (R2) |
| Étapes avec moins de 3 réponses restantes, tous joueurs | 0 | 0 / 7 560 | 0 / 12 600 | OK ; minimum observé : 3 (MER-KGCR8RG1P, MER-BSA53SG1R, MER-YH0QC1G11, expert) |
| Difficulté du générateur (difficulté moyenne des consignes ; nombre moyen de réponses) | croissante | — | facile 0,32 ; 26 — normal 0,51 ; 16 — expert 0,68 ; 11 | OK (monotone) |
| Taux de fausse piste par consigne | 10–45 % | non mesurable | non mesurable | Les joueurs synthétiques ne se trompent jamais : à mesurer sur les données de bêta |

Taux de réussite des ordres, joueur pondéré qui ne les vise pas (n = nombre de parties) :

| Ordre | Réussite (n) |
|---|---|
| longHaul | 97 % (480) |
| continentHopper | 92 % (620) |
| equatorShuttle | 83 % (420) |
| meridianWeaver | 49 % (660) |
| northernSoul | 35 % (360) |
| southernSoul | 10 % (100) |
| noFalseTrail | 100 % (trivial ici) |

Plus long saut par partie (pondéré), p10/p50/p90 : 9 478 / 14 347 / 18 000 km. Changements de continent (pondéré) : au moins 4 dans 85 % des parties, au moins 5 dans 57 %, 6 dans 22 %.

## 6. Bugs (hors périmètre contenu)

- **B1. `neighborOf` diverge des frontières des faits.** Gravité : moyenne.
  - Reproduction : MER-0018 ou MER-0029, jambe 6 (`borders.ctx-neighbour`). Camp précédent en Syrie, puis planter Israël.
  - Attendu : valide, car `facts.borders` SYR contient ISR et `borders.exactly-five` compte ce voisin.
  - Observé : refusé, car `evalContext` lit `entity.neighbors`.
  - Paires concernées : ISR–SYR, ESP–MAR, SOM–DJI, CAN–DNK, ZMB–BWA (script `dump` des différences).
  - Correctif proposé : `packages/engine/src/predicate.ts` devrait lire `facts.borders` pour `neighborOf`.
  - Indépendant de l'appareil et du navigateur.
- **B2. Salience PSE = 0,005.** Gravité : moyenne (score et sensibilité politique).
  - Reproduction : n'importe quelle consigne valide pour PSE, comme `society.arab-league`. La Palestine reçoit *incognita* (×1,5) alors qu'Israël et le Liban sont *known* ou *trail*.
  - Correctif proposé : ajouter PSE à `curated.salienceItem`, ou prévoir un plancher de salience manuel, puis relancer `pnpm --filter @meridian/facts-pipeline snapshot` (réseau requis).
  - Vérifier aussi les artefacts de salience dus aux sitelinks : TUR = 1,0 et FIN = 0,959 passent devant CHN.

## 7. Recommandations BALANCE (non appliquées)

| Paramètre | Actuel → proposé | Données | Effet attendu | Risque |
|---|---|---|---|---|
| R1 `MISSION_PARAMS.longHaul.km` | [5 000, 7 000, 9 000] → [12 000, 14 000, 16 000] | 97 % de réussite sans viser l'ordre ; p50 du plus long saut = 14 347 km | Réussite sans viser l'ordre d'environ 70/50/35 % : il redevient un ordre | Certains départs isolés peuvent devenir infaisables ; à revalider avec forge et le générateur |
| R1b `MISSION_PARAMS.continentHopper.n` | [2, 3, 4] → [4, 5, 5] | 92 % de réussite sans viser l'ordre ; au moins 4 changements dans 85 % des parties | Réussite d'environ 85/57/57 % | Faible |
| R2 Méridien du catalogue et du générateur | Méridiens du catalogue dans les longitudes peu fréquentées (Pacifique, ±150–175°) pour une partie du carnet ; `MIN_MERIDIAN_DISTANCE_DEG` 20 → 40 | Franchissement de 85 % (catalogue) et 61 % (générées) contre une cible de 30–60 % | Retour dans la cible | Les ordres meridianWeaver deviennent plus durs : revérifier |
| R3 `BALANCE.tierMultipliers` | Garder [1,0 ; 1,1 ; 1,25 ; 1,5] tant que B2 n'est pas corrigé | Un joueur aléatoire fait +15 à +22 % de renommée par rapport au joueur pondéré, une part surtout due aux micro-États à faible salience | — | Rouvrir la question après B2 et les premières statistiques réelles |
| R4 Cible de distance pour le générateur | Cible inchangée ; surveiller l'écart des générées (49,8 k) | Le facile génère des consignes à 26 réponses en moyenne, donc des routes plus libres | — | — |
| R5 Interface (design) | Afficher le continent du dernier camp sous les consignes contextuelles de continent et pour continentHopper | Voir §3.1 : pays transcontinentaux | Supprime le dernier piège de convention | — |
