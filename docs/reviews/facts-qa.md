# Revue QA des faits pays (`content/facts`)

- **Date** : 2026-10-28 | **Relecteur** : qa-balance
- **Périmètre** : 26 faits × 195 entités jouables (`content/facts/facts.json`, généré à partir de Wikidata, de Natural Earth 5.1.2 et de `curated.json`).
- **Méthode** : tableau des 195 pays fait par script, relu fait par fait. Chaque écart a été recoupé avec Wikipédia (texte brut des articles), la Banque mondiale (SP.POP.TOTL 2024) ou un test point-dans-polygone sur `content/geo/*.topo.json`. Les corrections sont faites uniquement dans `content/facts/curated.json`, avec une source pour chacune. Le pipeline utilisé est celui du commit 6fe5442 : un override vaut pour les deux lectures, et `metroOverrides` sert pour la lecture métropolitaine.
- **Résultat** : 140 valeurs corrigées (63 pays dans `overrides`, 4 pays dans `metroOverrides`, OPEP corrigée). `pnpm facts:check` passe. Dans `pnpm vitest run --project facts-pipeline`, 6 tests passent et 1 échoue **par construction** : le test attend 12 membres à l'OPEP, la valeur juste est 11 (voir KO-OPEC).

## 1. Résumé par fait

| Fait | Verdict | Corrections |
|---|---|---|
| areaKm2 | KO corrigé | 13 : MAR, UKR, CYP, SOM (frontières de jure) ; MCO, VAT, NRU, MDV, SGP, TON, KIR, LIE, BHR (micro-États faux de plus de 10 %) |
| northernmostLat | KO corrigé | 1 : ISL (Grímsey) |
| southernmostLat | KO corrigé | 4 : MAR, UKR, GNQ, STP |
| crossesEquator | OK | 0. Le correctif du pipeline (6fe5442) règle les lectures métro de KIR, MDV et STP ; le fait n'est plus territory-sensitive |
| crossesTropicOfCancer | KO corrigé | 2 : TCD (le tropique ne fait que toucher), MAR (seul le Sahara occidental est traversé). 15 pays restent |
| crossesTropicOfCapricorn | OK | 0 (10 pays, conforme à Wikipédia) |
| crossesArcticCircle | KO corrigé | 1 : ISL (Grímsey). 8 pays |
| crossesPrimeMeridian | OK | 0 (8 pays) |
| hemisphereNS | KO corrigé | 2 : GNQ (Annobón), STP (Rolas) → `both` |
| hemisphereEW | KO corrigé | 1 : KIR, dont la lecture métro donnait W à tort → `both` |
| landBorders / borders | KO corrigé | 10 pays : ZMB↔BWA, ESP↔MAR, CAN↔DNK, CYP↔GBR, SOM↔DJI. Plus 2 `metroOverrides` (DNK, GBR) |
| hasLandBorder | KO corrigé | 1 : CYP → true |
| continent / subregion | OK | 0 (M49 conforme ; voir §4 pour l'ambiguïté transcontinentale) |
| landlocked | OK | 0 (44 pays, conforme) |
| doubleLandlocked | OK | 0 (LIE, UZB) |
| drivesOnLeft | OK | 0 (54 pays, conforme) |
| monarchy | OK | 0 (43 pays ; 15 royaumes du Commonwealth en 2026, pas de nouvelle république) |
| population | KO corrigé | 33 pays remplacés par Banque mondiale 2024 (écart supérieur à 10 % ou valeur périmée ; IND était placée sous CHN) |
| highestPointM | KO corrigé | 5 : DNK 3694, GBR 2935, FIN 1324, KWT 306, SEN 648. Plus 3 `metroOverrides` (DNK 171, GBR 1345, AUS 2228) |
| usesEuro | KO corrigé | 1 : ZWE → false |
| currencyDollar | KO corrigé | 1 `metroOverride` : NLD métro = false (le dollar n'existe qu'aux Pays-Bas caribéens) |
| officialLanguages | KO corrigé | 7 : USA, AFG, ATG, ERI, KGZ, MRT, URY |
| flagColors | KO corrigé | 7 : BTN, DMA, ECU, GUY, IRN, STP, ZWE |
| memberOf | KO corrigé | 2 : GBR + commonwealth (56 membres) ; ARE retirée de l'OPEP (11 membres) |

## 2. Rapport de vérification : KO (corrigés dans `curated.json`)

| Élément | Attendu | Observé | Verdict | Source ou preuve |
|---|---|---|---|---|
| USA.officialLanguages | [english] | [spanish] | KO | https://en.wikipedia.org/wiki/United_States (EO 14224, mars 2025) |
| AFG.officialLanguages | [] (pachto, dari) | [arabic] | KO | https://en.wikipedia.org/wiki/Afghanistan |
| ATG.officialLanguages | [english] | [english, spanish] | KO | https://en.wikipedia.org/wiki/Antigua_and_Barbuda |
| ERI.officialLanguages | [] (aucune langue officielle) | [arabic, english] | KO | https://en.wikipedia.org/wiki/Eritrea |
| KGZ.officialLanguages | [russian] | [] | KO | https://en.wikipedia.org/wiki/Kyrgyzstan (Constitution : le russe est langue officielle) |
| MRT.officialLanguages | [arabic] | [arabic, french] | KO | https://en.wikipedia.org/wiki/Mauritania |
| URY.officialLanguages | [spanish] (de facto, comme ARG/CHL/MEX) | [] | KO | https://en.wikipedia.org/wiki/Uruguay |
| BTN.flagColors | orange, white, yellow | + black | KO | https://en.wikipedia.org/wiki/Flag_of_Bhutan |
| IRN.flagColors | green, red, white | + yellow | KO | https://en.wikipedia.org/wiki/Flag_of_Iran |
| STP.flagColors | + black (2 étoiles) | sans black | KO | https://en.wikipedia.org/wiki/Flag_of_S%C3%A3o_Tom%C3%A9_and_Pr%C3%ADncipe |
| ZWE.flagColors | + white (triangle) | sans white | KO | https://en.wikipedia.org/wiki/Flag_of_Zimbabwe |
| GUY.flagColors | + white (liseré) | sans white | KO | https://en.wikipedia.org/wiki/Flag_of_Guyana |
| DMA.flagColors | + purple (perroquet) | sans purple | KO | https://en.wikipedia.org/wiki/Flag_of_Dominica |
| ECU.flagColors | blue, red, yellow | 7 couleurs (armoiries) | KO (cohérence avec COL, VEN, ESP, MEX) | https://en.wikipedia.org/wiki/Flag_of_Ecuador |
| ZWE.usesEuro | false | true | KO | https://en.wikipedia.org/wiki/Zimbabwe (ZiG de jure ; USD et rand de facto) |
| NLD.currencyDollar (métro) | false | true dans les deux lectures | KO | https://en.wikipedia.org/wiki/Euro |
| GBR.memberOf | + commonwealth | absent | KO | https://en.wikipedia.org/wiki/Member_states_of_the_Commonwealth_of_Nations |
| KO-OPEC : opec | 11 membres, sans ARE | 12, avec ARE | KO | https://en.wikipedia.org/wiki/OPEC (les Émirats ont quitté l'OPEP le 1er mai 2026) |
| TCD.crossesTropicOfCancer | false | true | KO | https://en.wikipedia.org/wiki/Tropic_of_Cancer (« touches the northernmost point of Chad ») |
| MAR.crossesTropicOfCancer / southernmostLat / areaKm2 | false / 27.67 / 446 550 | true / 21.42 / 582 384 | KO | https://en.wikipedia.org/wiki/Geography_of_Morocco. La géométrie de MAR contient Laâyoune (test point-dans-polygone) |
| ISL.crossesArcticCircle / northernmostLat | true / 66.57 | false / 66.53 | KO | https://en.wikipedia.org/wiki/Arctic_Circle (Grímsey) |
| GNQ.hemisphereNS / southernmostLat | both / −1.47 | N / 0.96 | KO | https://en.wikipedia.org/wiki/Annob%C3%B3n |
| STP.hemisphereNS / southernmostLat | both / −0.01 | N / 0.02 (alors que crossesEquator = true) | KO | https://en.wikipedia.org/wiki/Ilh%C3%A9u_das_Rolas |
| KIR.hemisphereEW (métro) | both | W (lecture métro centrée sur Kiritimati) | KO | https://en.wikipedia.org/wiki/Kiribati |
| UKR.areaKm2 / southernmostLat | 603 628 / 44.38 | 570 138 / 45.23 | KO | https://en.wikipedia.org/wiki/Ukraine. La Crimée est dans le polygone RUS (voir §5) |
| CYP.areaKm2 | 9 251 (de jure) | 5 710 | KO | https://en.wikipedia.org/wiki/Cyprus |
| SOM.areaKm2 | 637 657 (de jure) | 473 621 | KO | https://en.wikipedia.org/wiki/Somalia |
| MCO / VAT / NRU / MDV / SGP / TON / KIR / LIE / BHR .areaKm2 | 2.08 / 0.49 / 21 / 298 / 744 / 748 / 811 / 160 / 787 | 19 / 0 / 29 / 109 / 513 / 605 / 954 / 137 / 690 | KO | Infobox Wikipédia de chaque pays |
| ZMB↔BWA.borders | voisins (Kazungula) | absents | KO | https://en.wikipedia.org/wiki/Zambia , https://en.wikipedia.org/wiki/Botswana |
| ESP↔MAR.borders | voisins (Ceuta, Melilla) | absents (Ceuta et Melilla fusionnés dans MAR au 50m) | KO | https://en.wikipedia.org/wiki/Spain |
| CAN↔DNK.borders | voisins (île Hans, traité de 2022 ratifié) | absents | KO | https://en.wikipedia.org/wiki/Hans_Island. Lecture métro de DNK = [DEU] |
| CYP↔GBR.borders, CYP.hasLandBorder | voisins (bases souveraines comptées pour GBR, politique v1) / true | absents / false | KO | https://en.wikipedia.org/wiki/Akrotiri_and_Dhekelia. Lecture métro de GBR = [IRL] |
| SOM↔DJI.borders | voisins (de jure, via le Somaliland) | absents | KO | https://en.wikipedia.org/wiki/Djibouti |
| DNK.highestPointM | 3 694 (métro 171) | 171 | KO | https://en.wikipedia.org/wiki/Gunnbj%C3%B8rn_Fjeld |
| GBR.highestPointM | 2 935 (métro 1 345) | 1 345 | KO | https://en.wikipedia.org/wiki/Mount_Paget (Géorgie du Sud, plantable pour GBR) |
| AUS.highestPointM (métro) | 2 228 | 2 745 dans les deux lectures (Mawson Peak, île Heard) | KO | https://en.wikipedia.org/wiki/Mount_Kosciuszko |
| FIN.highestPointM | 1 324 | 1 361 | KO | https://en.wikipedia.org/wiki/Halti |
| KWT.highestPointM | 306 | 140 | KO | https://en.wikipedia.org/wiki/Geography_of_Kuwait |
| SEN.highestPointM | 648 | 531 | KO | https://en.wikipedia.org/wiki/Geography_of_Senegal |
| population (33 pays) | Banque mondiale 2024 | Wikidata 2005–2021 (NIC 2005 ; IRQ, SOM, YEM 2017 ; IND 2020 ; CAN 2021) | KO | `https://data.worldbank.org/indicator/SP.POP.TOTL?locations=<ISO2>`. Ex. : IND 1,33 → 1,45 Md (passe devant CHN 1,40) ; CAN 37,0 → 41,3 M ; IRQ 38,3 → 46,0 M ; SOM 11,0 → 19,0 M. Liste : SOM FSM YEM NIC SLB HND NER GAB SDN MWI TKM IRQ MDV NAM PNG TZA GNB KEN LSO MOZ SLE STP LAO PAK SUR CAN TJK IND NRU ALB BIH PLW MHL |

## 3. Cas douteux (non corrigés)

| Élément | Attendu | Observé | Verdict | Source ou preuve |
|---|---|---|---|---|
| AFG.flagColors | Drapeau de la République (noir, rouge, vert, siège à l'ONU) ou drapeau taliban (blanc, noir) ? | black, white | Douteux (sensible) | https://en.wikipedia.org/wiki/Flag_of_Afghanistan : choix politique à faire par le Game Designer |
| BFA, MLI, NER.officialLanguages | français « langue de travail » depuis 2023–2025 | [] | Douteux | Infobox Wikipédia. Juste en droit, mais un piège pour une consigne « français officiel » |
| MUS, TUV, ARG, CHL, MEX.officialLanguages | langues de facto incluses | inclus | Douteux (règle) | Règle retenue : « officielle de jure ou de facto ». URY a été aligné sur cette règle |
| SRB.highestPointM | 2 169 (Midžor, hors Kosovo) ou 2 656 (Đeravica) ? | 2 658 | Douteux (territoire contesté) | https://en.wikipedia.org/wiki/Serbia. La carte exclut le Kosovo |
| GIN.population, VEN.population | WB 2024 : 14,8 M / 28,4 M | 17,5 M / 31,3 M (Wikidata 2024–2025) | Douteux | Sources récentes et divergentes, non tranché |
| ZWE.currencyDollar | USD de facto | true | Douteux | https://en.wikipedia.org/wiki/Zimbabwe |
| CYP.flagColors | cuivre = brown ou orange ? | brown | Douteux | https://en.wikipedia.org/wiki/Flag_of_Cyprus |
| PRT, BLZ, GTM, FJI.flagColors | prise en compte des écus et armoiries non uniforme | variable | Douteux (règle) | Règle « champs, bandes et charge principale » : à documenter |
| NOR (île Bouvet), DMA/NIC (violet) | Bouvet, dépendance norvégienne à 54° S, absente de la carte | NOR hemisphereNS = N | Douteux | Hors carte, donc non plantable : cohérent avec ce que voit le joueur |
| MDV.highestPointM | 2,4 m ou 5,1 m selon les sources | 5 | Douteux (sans enjeu) | https://en.wikipedia.org/wiki/Maldives |
| Lecture métro par la règle des 1 500 km | Lecture métro = État sans ses dépendances | Coupe des territoires intégrés : Papouasie et Weh (IDN), Nicobar (IND), Açores (PRT), île de Pâques (CHL), Prince-Édouard (ZAF), Gilbert (KIR) | Douteux (pipeline) | `tools/facts-pipeline/src/geometry.ts`, `METRO_MAX_KM`, vérifié par script. Effet : des consignes numériques (superficie, latitudes) sont rejetées à tort. Rejet sans danger, jamais une fausse réponse |

## 4. Faits déconseillés en consigne

1. **continent** : l'appartenance des pays transcontinentaux ou limitrophes est ambiguë pour le joueur (CYP, GEO, ARM, AZE, TUR, KAZ classés AS ; RUS en EU ; EGY en AF). À n'utiliser qu'avec une exclusion explicite de ces 8 pays, ou en consigne `regional` ; préférer `subregion`.
2. **areaKm2, northernmostLat, southernmostLat** : polygones Natural Earth 50m approximatifs (petites îles absentes, ex. Annobón, Grímsey, Diego Ramírez) et lecture métro biaisée (§3). À réserver à des seuils grossiers, loin des valeurs limites.
3. **flagColors** pour les couleurs secondaires (brown, grey, purple, orange) : la règle « armoiries ou non » n'est pas uniforme. Seules les couleurs de champ (red, blue, green, yellow, white, black) sont fiables.
4. **officialLanguages = french** : BFA, MLI et NER ont rétrogradé le français ; le joueur sera piégé. **spanish/english** : mélange de jure / de facto (règle à afficher dans la consigne).
5. **borders / landBorders / hasLandBorder** : les frontières de jure (CYP–GBR, SOM–DJI, ESP–MAR) ne se voient pas sur la carte de facto (les bases souveraines et Ceuta/Melilla ne sont pas distincts au 50m ; le Somaliland est non plantable). Ces faits sont utilisables, mais à exclure des consignes « sans frontière terrestre » tant que la carte ne montre pas ces frontières.
6. **population** : valeurs hétérogènes (Wikidata 2017–2025 + Banque mondiale 2024). Seuils et comparaisons acceptables à ±10 % ; éviter les seuils qui tombent à moins de 10 % d'une valeur.

Faits fiables pour les consignes : landlocked, doubleLandlocked, drivesOnLeft, monarchy, crossesEquator, crossesTropicOfCancer, crossesTropicOfCapricorn, crossesArcticCircle, crossesPrimeMeridian, hemisphereNS, hemisphereEW, usesEuro, currencyDollar, memberOf, subregion.

## 5. Hors périmètre `curated.json` : à traiter par d'autres rôles

| Élément | Attendu | Observé | Verdict | Source ou preuve |
|---|---|---|---|---|
| Crimée sur la carte (`world-50m.topo.json`) | Ukraine (AGNU rés. 68/262), ou unité contestée non plantable | Simferopol, Sevastopol, Yalta, Kertch et Djankoï dans le polygone **RUS jouable** | **KO critique (politique géo)** | Test point-dans-polygone, script de vérification |
| Sahara occidental sur la carte | Entièrement non plantable (politique v1, règle 3) | Laâyoune dans le polygone **MAR jouable** ; seul l'est du mur (Tifariti) est dans SAH | **KO critique (politique géo)** | Idem |
| Akrotiri et Dhekelia | Une seule unité (GBR) | Recouvertes à la fois par CYP (50m) et par WSB/ESB→GBR (10m) | KO (carte) | Idem |
| `tools/facts-pipeline/test/facts.test.ts` | `members('opec')` = 11 | attend 12 | KO (test périmé) | https://en.wikipedia.org/wiki/OPEC |
| `pnpm forge:check` | passe | ENOENT `content/library/prompts.json` (fichier absent) | À vérifier | Exécution locale |
| COK, NIU rattachés à NZL | États librement associés | `reason: dependency` | Douteux (politique) | `content/geo/entities.json` |
