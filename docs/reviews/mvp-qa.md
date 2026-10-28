# Revue QA et équilibrage : MVP (phase 3)

- **Date** : 2026-10-28 | **Relecteur** : qa-balance | **Base** : commit 0d8e60c (+ c9900b0, docs seulement)
- **Périmètre** : MER-0001 réécrite, MER-0031 à MER-0050, consigne `position.africa`, deux points du game designer, 50 expéditions du catalogue et 50 générées rejouées, seuils d'alerte du playtest (tâche 3.6).
- **Scripts** (hors dépôt) : `/tmp/claude-0/-home-user-meridian/b28bb239-e1d0-5686-80c1-8927145af87d/scratchpad/qa3/` : `dump.mjs` (consignes et réponses), `isl.mts` et `partial.mts` (pièges de lecture), `wikiborders.py`, `cmpb.mjs` et `alt.mts` (nombre de voisins), `edit_prompts.py` (corrections), `sim.ts` et `analyze.py` (parties simulées), `decoys.mts` (fausses pistes prédites).
- **Réseau** : disponible. Les sources marquées « (lu ce jour) » ont été relues en ligne le 2026-10-28.

## 1. Verdict

**Contenu prêt pour le playtest, une fois les corrections de ce rapport faites.** Il reste deux réserves de mesure : la télémétrie ne peut pas juger aujourd'hui le critère « Précis », et elle ne voit pas le méridien ni les ordres (§7).

- 37 consignes corrigées (§3). Le motif est le même partout : un joueur informé qui lit la consigne au pied de la lettre plantait un pays que le prédicat refusait. Voici les quatre familles de pièges :
  - « île-nation » refusait l'Indonésie, le Royaume-Uni, l'Irlande, Haïti, la République dominicaine, le Timor oriental, la Papouasie-Nouvelle-Guinée et Brunei ;
  - « austral » ou « tropical » refusait des pays qui débordent (le Brésil pour « Austral et vaste », l'Équateur pour « Dans l'hémisphère sud, un sommet passé 3 000 m ») ;
  - les nombres de voisins dépendaient du Kosovo ou du Sahara occidental ;
  - la consigne « n'importe où en Afrique » acceptait d'être lue comme incluant les Canaries ou la Réunion.
- Les 21 nouveautés (0001, 0031 à 0050) sont justes, une fois ces corrections faites (§2).
- Les 13 recouvrements signalés sont **conservés**. 0007 est **corrigée** (§4).
- 6 200 parties simulées : aucune étape sous 3 réponses restantes. Le franchissement du méridien est de 54 % au catalogue et de 52 % pour les générées (cible 30–60 %). Les ordres pèsent au plus 13,0 % de la renommée. La difficulté du générateur croît bien avec le niveau (§5).
- `pnpm facts && pnpm forge` : 0 erreur, 0 avertissement. `facts:check` et `forge:check` passent. `pnpm vitest run --project prompt-forge --project engine --project facts-pipeline` : 49 tests passent sur 49.

## 2. Revue des nouveautés

| Élément | Attendu | Observé | Verdict | Source ou preuve |
|---|---|---|---|---|
| `position.africa` : prédicat | 54 États africains, Égypte comprise | `continent = AF` : 54 réponses | OK | Membres de l'ONU ; aucun territoire non plantable dans `validIso3` |
| `position.africa` : texte « Plante ton camp n'importe où en Afrique » | Une étape impossible à rater | Les Canaries, Madère, Ceuta, Melilla, la Réunion, Mayotte, Lampedusa et Socotra sont « en Afrique » mais refusés (ESP, PRT, FRA, ITA, YEM). Le Somaliland et le Sahara occidental sont refusés sans pénalité | KO, corrigé | Règle §12 : un territoire compte pour son État. Nouveau texte : « Plante ton camp dans un pays d'Afrique », aligné sur l'aide `coachFirstLeg` (« Touchez un pays d'Afrique ») |
| MER-0001, étapes 2 à 6 | Réponses nombreuses et célèbres, pas de piège | 37 / 33 / 42 / 29 / 31 réponses au minimum restant ; fausses pistes prédites de 0 à 37 % (le drapeau n'est pas modélisé) | OK | `analyze.py`, `decoys.mts`. Méridien à 30° O : 100 % de franchissement, voulu |
| `water.island-*`, `relief.island-peaks`, `relief.tropical-island-peaks`, `flag.island-black`, `position.west-islands`, `position.north-east-islands` (utilisées dans 0031, 0032, 0035, 0036, 0038, 0040, 0042 à 0047, 0049) | « Île-nation » = pays dont le territoire principal est fait d'îles **ou de parties d'îles** | Le prédicat exige « aucune frontière terrestre ». Sont refusés, selon la consigne : l'Indonésie (« le plus grand pays insulaire »), le Royaume-Uni, l'Irlande, Haïti, la République dominicaine, le Timor oriental, la Papouasie-Nouvelle-Guinée et Brunei. Exemples : MER-0040 part de Jakarta et demande « une île-nation de plus d'un million d'habitants » ; MER-0042, au départ de Perth, refuse la PNG pour « grande île-nation » | **KO**, corrigé (12 consignes) | https://en.wikipedia.org/wiki/Island_country (lu ce jour) : « Indonesia is the largest and most populated island country » ; « Ireland and the United Kingdom; the Dominican Republic and Haiti; Indonesia… share islands ». Script `isl.mts` |
| « Austral », « tropical », « dans l'hémisphère sud », « entre l'équateur et 10° N » (13 consignes, dont 0036, 0040, 0042, 0043, 0045, 0047 à 0050) | Le texte dit « tout entier » quand le prédicat l'exige | Le texte ne le disait pas. Pièges relevés : le Brésil pour `position.big-south`, `flag.southern-no-red` et `society.iberian-south` ; l'Équateur (Chimborazo 1,47° S), l'Indonésie (Puncak Jaya 4,08° S) et le Kenya (mont Kenya 0,15° S) pour `relief.southern-heights` ; le Brésil et l'Inde pour `climate.tropical-populous` ; le Mexique (Orizaba, 19° N) pour `climate.tropical-snow` ; les Bahamas pour `relief.tropical-flatlands` ; les Maldives, Sao Tomé, le Ghana et le Costa Rica pour `climate.equatorial-north` | **KO**, corrigé | Script `partial.mts` (lecture « en partie » contre « tout entier », faits `southernmostLat` et `northernmostLat`) |
| Nombre de voisins (0033, 0034, 0036, 0040 à 0042, 0046, 0047, 0048) | Un joueur qui compte les unités dessinées en pointillé (Kosovo, Sahara occidental) n'est pas refusé, comme pour l'Espagne et Gibraltar (phase 2) | Refusés : la Macédoine du Nord et le Monténégro pour « exactement cinq » ; l'Albanie et la Mauritanie pour « exactement quatre » ; l'Algérie pour « sept » ; la Serbie et l'Arabie saoudite pour « au moins huit » ; l'Albanie pour `small-crowded` ; Bahreïn (frontière sur la chaussée) pour `lone-neighbour` et `coast-small` | KO, corrigé (lecture double acceptée) | https://en.wikipedia.org/wiki/List_of_countries_and_territories_by_number_of_land_borders (lu ce jour) : MKD 5, MNE 5, ALB 4, SRB 8, MRT 4, DZA 7, SAU 8, BHR 1. Scripts `cmpb.mjs` et `alt.mts` |
| Afghanistan–Inde (Cachemire) | Accepter 7 voisins pour l'Inde et l'Afghanistan ? | Non retenu : sur la carte, les deux pays ne se touchent pas (Gilgit-Baltistan est administré par le Pakistan). De plus, l'ajout cassait la route gloutonne de l'ordre longHaul 16 000 km de MER-0028 (15 791 km) | Douteux, non corrigé | Même source (AFG 7, IND 7) ; `g28b.mts` |
| `society.opec` (0041) | 11 membres depuis le départ des Émirats arabes unis le 1er mai 2026 | Prédicat juste. L'explication ne citait que l'Angola, alors que les Émirats sont le leurre le plus célèbre | Explication corrigée | https://en.wikipedia.org/wiki/OPEC (lu ce jour) ; `curated.json` (note opec) |
| `climate.cancer` et `climate.either-tropic` au départ d'Honolulu (0044) | Liste usuelle de 16 États, sans les États-Unis | Les États-Unis sont refusés : le tropique passe en mer entre Nihoa et Necker. C'est le même cas que l'équateur aux Maldives, comptées parce qu'elles figurent dans la liste usuelle | OK sur le fait (liste usuelle), explication complétée | Revue phase 2 §2. Accepter les États-Unis ou la France (Australes) rendrait la consigne ambiguë entre lecture entière et métropolitaine, ce que forge rejette |
| Les autres consignes de 0031 à 0050 | Faits justes, listes complètes | Vérifiées une à une (`dump.mjs`) : OTAN 32, Commonwealth 56, monarchies 43, enclavés 44, tropiques 15 + 10, équateur 13, sommets, drapeaux, bandes de latitude, langues | OK | Sources de `facts.json` ; revues facts-qa et phase 2 |
| « Pièges attendus » des notes de design de 0031 à 0050 | Pièges de savoir, pas de lecture | Ceux qui portaient sur « île-nation » (Royaume-Uni, Irlande, Indonésie) ou sur « austral » (le Brésil) sont devenus des questions de savoir explicites (« sans frontière terrestre », « tout entier ») | OK après correction | Les `designNote` sont internes et n'ont pas été modifiées |
| Ordres de 0031 à 0050 | Réalisables | forge le vérifie par recherche gloutonne ; selon le type d'ordre, un joueur informé qui le vise le réussit dans 94 à 100 % des parties | OK | §5.3 |

## 3. Corrections faites

Fichiers modifiés : `content/library/prompts.json` (libraryVersion 1 conservée, car la bibliothèque n'est pas encore publiée) et `content/expeditions/0007.json`. `library-v1.json` et `catalog.json` ont été régénérés par forge. `curated.json` est inchangé. Le script est `qa3/edit_prompts.py`.

| Consignes | Correction | Effet sur les réponses |
|---|---|---|
| 12 consignes « île-nation » | Texte « Sans frontière terrestre, … ». Exemple : « Sans frontière terrestre, tout entier au nord de l'équateur ». Explication : « Les îles partagées (Irlande, Hispaniola, Bornéo, Timor, Nouvelle-Guinée) donnent une frontière terrestre ». Chypre reste acceptée, et ses explications le disent | Aucun |
| 13 consignes de bande ou d'hémisphère | Texte « Tout entier au sud de l'équateur / sous les tropiques / entre l'équateur et le 10e parallèle nord, … ». L'explication nomme le leurre (le Brésil, l'Inde, le Mexique, les Bahamas) | Aucun |
| `position.africa` | « Plante ton camp dans un pays d'Afrique » | Aucun |
| `climate.cancer`, `climate.either-tropic`, `society.opec` | Explication complétée (Hawaï ; les Émirats sortis en 2026) | Aucun |
| `borders.exactly-four` | + Albanie, Mauritanie (prédicat `any`, chaque pays étant identifié par une paire de voisins unique) | 25 → 27 |
| `borders.exactly-five` | + Macédoine du Nord, Monténégro | 24 → 26 |
| `borders.exactly-seven`, `borders.seven-plus` | + Algérie | 9 → 10 ; 19 → 20 |
| `borders.eight-plus` | + Serbie, Arabie saoudite | 10 → 12 |
| `borders.small-crowded` | + Albanie | 9 → 10 |
| `borders.lone-neighbour`, `water.coast-small` | + Bahreïn | 10 → 11 ; 18 → 19 |

Ces 8 consignes perdent de 0,02 à 0,05 de difficulté (par exemple `small-crowded` passe de 0,64 à 0,59, `lone-neighbour` de 0,77 à 0,73). Les plus longs textes : « Sans frontière terrestre, tout entier tropical, sommet passé 1 000 m » (68 caractères, contre 66 au maximum jusqu'ici) et « Tout entier au sud de l'équateur, drapeau rouge, blanc et bleu » (62). L'AD doit les vérifier sur l'écran de 360 px.

## 4. Points du game designer : arbitrages

| Élément | Attendu | Observé | Verdict | Preuve |
|---|---|---|---|---|
| 0007 (Facile), étape 5 : `position.giants`, difficulté 0,58 | Facile ≤ 0,45 (bande du générateur, §14) : seule 0007 en sortait parmi les 16 faciles | Maximum des autres faciles : 0,45 | KO, corrigé | Étape 5 → `relief.over-5000` (difficulté 0,25, 27 réponses, recouvrement maximal 0,32 ; Denali, Logan et Elbrouz collent au thème « Grand Nord »). L'ordre northernSoul reste réalisable (forge) |
| Recouvrements > 0,6 dans 13 expéditions de 0002 à 0030 : 0002 (0,65), 0003 (0,72), 0004 (0,62), 0007 (0,72), 0009 (0,68), 0010 (0,68), 0011 (0,64), 0012 (0,67), 0015 (0,82), 0021 (0,80), 0023 (1,00), 0024 (1,00), 0026 (0,67) | La règle des 60 % est une contrainte de **diversité du générateur** (§14.4). Elle ne fait pas partie des validations du catalogue (data-model §10). Le risque qu'elle couvre, c'est-à-dire une étape épuisée ou redondante, se mesure | Réponses restantes minimales sur 6 200 parties et 5 joueurs : 22, 20, 16, 17, 16, 23, 10, 5, 11, 9, 5, 9, 7 | **Conservés** | Les recouvrements suivent le thème de chaque carnet (Nord et OTAN, Caraïbes et petits pays de l'Ouest). Aucune étape ne descend sous 5 réponses. Les sous-ensembles de 0023 et 0024 étaient déjà voulus en phase 2 |

## 5. Parties simulées

Méthode : `reduce` avec le camp planté au point de visée. Il y a 5 joueurs :
- **glouton** : le pays valide le plus lointain ;
- **prudent** : le pays valide le plus célèbre ;
- **aléatoire** : un pays valide au hasard, 20 parties ;
- **pondéré** : un tirage selon salience^1,4, 20 parties. C'est le joueur informé.
- **visé** : comme le joueur pondéré, mais il choisit parmi les réponses qui servent l'ordre ciblé (20 parties, en alternant l'ordre ciblé).

En tout, 100 expéditions et 6 200 parties. Les 50 expéditions générées le sont pour les graines `hash32(20261028, i)`, en alternant facile, normal et expert. Aucune ne bascule sur l'expédition de secours, et `BALANCE` v2 est utilisé.

### 5.1 Distance, renommée, paliers, méridien

| Joueur | Distance médiane, catalogue / générées (km) | Renommée médiane | Paliers known/trail/frontier/incognita (%) | Méridien franchi au moins une fois | Au moins deux fois |
|---|---|---|---|---|---|
| Pondéré | **44 600 / 48 100** | **51 200 / 56 200** | 51/28/15/5 · 51/30/14/5 | **54 % / 52 %** | 29 % / 32 % |
| Prudent | 43 600 / 49 000 | 46 100 / 54 400 | 100/0/0/0 | 64 % / 72 % | 38 % / 30 % |
| Aléatoire | 47 900 / 51 400 | 62 100 / 66 200 | 26/24/24/26 · 29/26/22/23 | 63 % / 58 % | 37 % / 34 % |
| Visé | 55 600 / 55 500 | 66 100 / 66 800 | 47/28/17/8 | 71 % / 66 % | 50 % / 48 % |
| Glouton | 94 100 / 94 200 | 120 900 / 124 600 | 30/18/23/29 | 88 % / 90 % | 68 % / 70 % |

- Cibles (§10) : distance 30–45 000 km et renommée 35–55 000. Le catalogue est dans la cible. Les générées la dépassent un peu, de 7 % pour la distance et de 2 % pour la renommée, comme en phase 2 (R4 : à surveiller).
- Méridien : le catalogue passe de 85 % (phase 2) à **54 %**, dans la cible de 30–60 %. Exceptions voulues : 0001 et 0013 (100 %).
- Renommée du joueur aléatoire par rapport au joueur pondéré : +21 % au catalogue et +18 % pour les générées. L'audace paie, sans écraser.
- Part des ordres dans la renommée : 4,7 % en médiane, **13,0 % au maximum** (cible ≤ 15 %).

### 5.2 Difficulté du générateur (600 graines par niveau)

| Niveau | Difficulté moyenne des consignes | Réponses moyennes | Replis | Étapes contextuelles |
|---|---|---|---|---|
| Facile | 0,311 | 26,9 | 0 | 171 |
| Normal | 0,506 | 16,4 | 0 | 170 |
| Expert | 0,681 | 11,0 | 0 | 176 |

La difficulté croît bien avec le niveau.

### 5.3 Ordres de mission : réussite sans viser l'ordre (joueur pondéré) et en le visant (joueur visé)

| Ordre | Non visé | Visé |
|---|---|---|
| continentHopper 4 / 5 | 83 % / 61 % | 100 % / 100 % |
| equatorShuttle | 80 % | 100 % |
| longHaul 12 000 / 14 000 / 16 000 | 71 % / 54 % / 40 % | 100 % / 100 % / 95 % |
| meridianWeaver | 33 % | 99 % |
| northernSoul | 37 % | 100 % |
| southernSoul | 7 % | 100 % |
| noFalseTrail | 100 % (les joueurs synthétiques ne se trompent pas) | — |

Le joueur visé est une borne haute : il connaît toutes les réponses. Les ordres sont désormais de vrais ordres, alors qu'en phase 2 longHaul était réussi à 97 % sans le viser.

### 5.4 Réponses restantes minimales par étape (tous joueurs)

- Catalogue, par étape (1 à 6) : 8, 7, 7, 5, 6, **3**.
- Générées : 8, 7, 7, 7, 7, **3**.
- Aucune étape sous 3. Les 4 étapes sous 5 sont toutes des étapes 6 « voisin du dernier camp » (0039, 0047, MER-KGCR8RG1P, MER-XKZJHG81C) : la règle garantit au moins 3 réponses, sinon elle passe à la consigne de secours.

## 6. Seuils d'alerte du playtest

Lecture : `GET /api/telemetry/summary?minN=15` (docs/deployment.md §6). Pour une consigne, `n` est le nombre d'étapes jouées. Comme les intervalles sont larges, on n'alerte « rouge » que si l'intervalle de Wilson à 95 % sort de la cible.

### 6.1 Seuils

| Critère MVP | Champ du résumé | Vert | Orange : à regarder | Rouge : à corriger |
|---|---|---|---|---|
| Fausse piste par consigne : 10–45 % | `prompts[].falseTrailRate`, `prompts[].n` | 10–45 % | Valeur hors de 10–45 % avec n ≥ 15 | Au-dessus de 45 % de façon certaine : ≥ 73 % si n = 15, ≥ 70 % si n = 20, ≥ 63 % si n = 30, ≥ 60 % si n = 50. Sous 10 % de façon certaine : il faut n ≥ 50 avec 0 fausse piste, ce qui est hors de portée du playtest |
| Onboarding | `expeditions[code=MER-0001]` : `legFalseTrailRate`, `completionRate` | ≤ 20 % ; ≥ 90 % | 20–30 % ; 80–90 % | > 30 % ou < 80 %. `position.africa` doit rester sous 5 % : une seule fausse piste à l'étape 1 mérite un verbatim (Q3) |
| Temps médian : 3–6 min | `expeditions[].medianDurationMs` (`finished` ≥ 10), et médiane globale pondérée par `finished` | 3–6 min | 2,5–3 ou 6–7,5 min ; un code au-delà de 9 min | Médiane globale < 3 min ou > 6 min sur au moins 100 expéditions terminées |
| Recoupement du temps | `prompts[].meanMs` | ≤ 45 s | 45–75 s | > 75 s : la consigne est trop dure à trouver sur la carte. Si 6 × la moyenne par étape dépasse 1,5 × la médiane, les pauses gonflent `durationMs` (§7, T3) |
| « Précis » : < 2 % de camps ratés | `plantFailed.total` / Σ `expeditions[].legs` | < 2 % | — | ≥ 2 %. Tant que T1 n'est pas corrigé, tout `not_playable` ou `disputed` est un **bug** : l'interface ne devrait pas laisser confirmer. Le critère se lit sur la question Q2 (camps ratés / camps posés) |
| Paliers ≈ 50/30/15/5 | Σ `prompts[].tiers` | known 40–60 % | — | known > 60 % ou < 40 % (voir 6.3) |
| Abandons | `expeditions[].completionRate` | ≥ 80 % | 70–80 % | < 70 % : chercher l'étape où l'on abandonne (`legFalseTrailRate`) |

**Volume.** 15 joueurs × 10 expéditions donnent environ 900 étapes pour 134 consignes, soit **moins de 10 étapes par consigne en moyenne** : la plupart des consignes n'atteindront pas n = 15. Pour mesurer les consignes prioritaires, on impose un **parcours commun** que tous jouent en 1re tentative : MER-0001, 0012, 0025, 0040, 0042 et 0044 (18 des 27 consignes de la liste ci-dessous, et n = 15 par consigne avec 15 joueurs). Viser 20 joueurs ou plus, et lire aussi les taux **par famille** de consignes (6.2).

### 6.2 Consignes à surveiller en priorité

Le taux prédit vient d'un modèle (`decoys.mts`), ce ne sont pas des données. Le joueur informé (pondéré par salience^1,4) y choisit entre les réponses valides et les leurres d'une lecture approximative : seuil à ±15 %, « en partie » au lieu de « tout entier », un voisin de plus ou de moins, une ligne qui passe à moins de 2 à 3°. Le modèle sert à **classer** les consignes. Ses valeurs absolues sont probablement trop hautes, et il ne modélise ni les drapeaux ni les appartenances.

| Priorité | Consignes (taux prédit ; expéditions) | Raison | Si rouge |
|---|---|---|---|
| 1. Fausse piste prédite extrême (> 55 %) | `borders.tropical-pair` (86 % ; 0025, 0050) ; `borders.lone-neighbour` (78 % ; 0027, 0047 en secours) ; `climate.southern-tropics` (75 % ; 0011, 0014, 0042, 0045) ; `climate.equatorial-north` (73 % ; 0024, 0025, 0030, 0047, 0050) ; `climate.tropical-giant` (71 % ; 0027) ; `borders.exactly-four` (63 %) ; `borders.exactly-seven` (61 %) ; `borders.exactly-five` (57 % ; 5 expéditions) ; `relief.four-thousanders` (57 %) ; `relief.southern-heights` (56 % ; 5 expéditions) | Leurres célèbres : le Mexique, le Viêt Nam, l'Inde et le Brésil pour les bandes de latitude ; nombres de voisins comptés de mémoire | Les comptes exacts (`exactly-*`) deviennent des seuils (« au moins / au plus »). Les bandes : réserver la consigne à l'Expert, ou la retirer du pool Normal |
| 2. Consignes reformulées (vérifier que la correction tient) | Les 12 « Sans frontière terrestre », les 13 « Tout entier … », `position.africa` | Elles étaient des pièges de lecture (§2) | Si une consigne dépasse encore 45 %, regarder les pays plantés à tort dans les verbatims (Q4). La télémétrie n'enregistre pas le pays planté (§7, T4) |
| 3. Leurres de drapeaux et de faits récents (non modélisés) | `flag.blue-white-only` (l'Argentine et l'Uruguay ont un soleil jaune) ; `flag.red-white-only` (7 expéditions) ; `flag.green-yellow-red` et `flag.blue-yellow-red` (l'Arménie est-elle orange ou jaune ?) ; `flag.yellow-white-no-red` (écu rouge de Brunei) ; `society.opec` (les Émirats sont sortis en mai 2026) | La règle « hors armoiries » et les faits très récents | Explication plus nette ; si cela persiste, retirer le leurre de la question (texte) |
| 4. Fausse piste prédite trop basse (< 10 %) | `position.africa` (voulu) ; `society.monarchy` (43 réponses) ; `society.commonwealth` (56) ; `water.landlocked` (44) ; `water.island-nation` (38) ; `flag.no-red` (44) ; `flag.black` (45) ; `society.spanish` (20) | Réponses nombreuses et célèbres | Pas d'action en Facile (ce sont des consignes Faciles). Si l'une d'elles sert en Normal ou en Expert, la sortir de ce pool |

### 6.3 Que changer dans `BALANCE` selon le résultat

Toute modification incrémente `BALANCE.version` (v2 → v3) et repasse cette simulation.

| Observation (playtest) | Paramètre | Actuel → proposé | Effet attendu | Risque |
|---|---|---|---|---|
| known > 60 % (les joueurs se concentrent plus sur les pays célèbres que ne le prévoit l'a priori) | `salienceExponent` (β) | 1,4 → 1,6 | Moins de pays dans le premier palier cumulé de 50 %, donc un retour vers 50/30/15/5 | Les micro-États deviennent encore plus souvent *incognita*. Corriger d'abord B2 (salience de la Palestine) |
| known < 40 % | `salienceExponent` | 1,4 → 1,2 | Effet inverse | — |
| incognita > 10 % et renommée médiane > 60 000 (chasse aux pays obscurs) | `tierMultipliers.incognita` | 1,5 → 1,4 | Faible : le multiplicateur moyen passe de 1,214 à 1,188 pour le joueur aléatoire et de 1,081 à 1,076 pour le pondéré (calcul sur les paliers du §5.1). L'écart de renommée passe d'environ +21 % à environ +19 % | L'audace paie un peu moins. Si l'écart observé dépasse +30 %, il faut aussi toucher à `frontier` (1,25 → 1,2) |
| Rouges concentrés sur les consignes Expert à 8–9 réponses | `promptValidCount` | **Inchangé** ([8, 60]) | Le passer à [10, 60] ferait rejeter par forge 23 consignes, dont 20 utilisées au catalogue | Corriger plutôt par le contenu : reformuler la consigne ou la retirer du pool Normal |
| Temps > 6 min, avec `spyglassRate` > 30 % sur les consignes lentes | `spyglassPerExpedition.normal` | 1 → 2 | Moins de temps de recherche | Palier plafonné à *frontier* plus souvent |
| Méridien, ordres | `meridianBonus` (750), `missionBonusRate` (0,05) | **Inchangés** | Simulation dans les cibles : 54 % de franchissement, ordres ≤ 13 % | Non mesurables en télémétrie aujourd'hui (§7, T2) |

## 7. Bugs et lacunes de mesure (hors périmètre contenu)

- **T1. `plant_failed` n'est presque jamais émis.** Gravité : haute pour le critère « Précis ».
  - Reproduction : toucher la mer, une zone non plantable ou un pays déjà utilisé.
  - Attendu : un événement `plant_failed`.
  - Observé : `PlayView.onPick` affiche un indice sans rien émettre. Le sceau est désactivé (`canPlant = plantable`), donc `CONFIRM_CAMP` n'est jamais refusé, et `CAMP_REFUSED`, la seule source de `plant_failed` (`apps/web/src/game/store.ts`, `report()`), ne se produit jamais. `plantFailed.total` vaudra environ 0, quel que soit le vécu des joueurs.
  - Correctif proposé : émettre `plant_failed` dans `onPick` pour `sea` (à moins de N px d'une terre), `unplantable`, `already_used` et `snapped`. Encore mieux, ajouter un bouton « Je n'ai pas pu planter ici ».
  - Tous appareils.
- **T2. Le méridien et les ordres sont absents de la télémétrie.** `expedition_finished` ne porte ni `meridianCrossings` ni `missionsDone`. La calibration du bonus méridien (plan 3.6) est donc impossible. Correctif proposé : ajouter ces deux entiers bornés.
- **T3. `durationMs` mesure `finishedAt − startedAt`.** Une partie reprise le lendemain compte ses pauses, jusqu'à 24 h. Lire la médiane, pas la moyenne. Correctif proposé : la somme des `leg.ms`.
- **T4. `leg_resolved` ne porte pas `attempt`.** Les rejeux et défis abaissent le taux de fausse piste d'une consigne. Correctif proposé : ajouter `attempt`, et pour une fausse piste, le pays planté (ISO3, sans donnée personnelle) afin de voir les leurres.
- **B2 (phase 2), toujours ouvert.** Salience de la Palestine = 0,005 (rang 194) : elle reste *incognita*, au multiplicateur ×1,5.

## 8. Douteux restants (aucun refus injuste connu)

| Élément | Observé | Verdict | Raison |
|---|---|---|---|
| KHM `southernmostLat` 10,41 (`climate.sahel-caribbean-belt`) | Les îles Poulo Wai sont à 9,9° N : le Cambodge n'est pas « tout entier » au-dessus de 10° N | Douteux | Accepté par excès d'indulgence : aucun joueur n'est refusé |
| Afghanistan–Inde | 6 ou 7 voisins chacun, selon qu'on compte le Cachemire | Douteux | Voir §2 : on suit ce que montre la carte |
| ARM (orange) et MHL (orange) pour les consignes « jaune » | Abricot et orange des drapeaux officiels | Douteux | À regarder dans les verbatims (6.2, priorité 3) |
| BRN `flagColors` avec du rouge (emblème) | « Hors armoiries (écus, blasons) » : l'emblème de Brunei n'est pas un écu | Douteux | Brunei est refusé pour `flag.yellow-white-no-red` ; un seul cas |
| Registre de langue | Les consignes tutoient (« Plante ton camp »), l'interface vouvoie (« Touchez un pays ») | Cosmétique | À trancher par l'AD ou le GD |
