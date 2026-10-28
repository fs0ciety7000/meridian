# Meridian — Systèmes de gameplay

> **Auteur :** Systems Designer (`.claude/agents/systems-designer.md`)
> **Relecteurs :** Game Designer (intention), QA/Balance (équilibrage, cas limites), Tech Lead (implémentation dans `packages/engine`)
> **Statut :** v0.2 — révisée : jeu **à la demande** (expéditions par code, rareté par consigne, plus de daily ni de série). Valeurs numériques = hypothèses à calibrer en playtest
> **Prérequis :** `docs/vision-and-innovations.md`, `docs/architecture.md`

Ce document spécifie **les règles exactes** que `packages/engine` implémente. Toute règle ici doit être déterministe, testable et identique client/serveur. Les paramètres numériques sont regroupés en §11 (`BALANCE`), seule source de vérité des constantes.

---

## 1. Vue d'ensemble des systèmes

```
            ┌──────────────┐
 Contenu ──▶│  Expédition  │ port, méridien, 6 consignes, ordres de mission
            └──────┬───────┘
                   ▼
            ┌──────────────┐   pick (lon,lat,iso3)   ┌──────────────┐
 Carte ────▶│ Résolution   │◀────────────────────────│  Validation  │ prédicat + règles
            │  d'étape     │────────────────────────▶│              │
            └──────┬───────┘                         └──────────────┘
                   ▼
   Distance ─ Méridien ─ Rareté ─ Ordres de mission ─ Renommée
                   ▼
            ┌──────────────┐
            │ Récompenses  │ tampons (passeport), atlas, sceaux, titres, journal
            └──────────────┘
```

---

## 2. Structure d'une expédition

Le jeu se joue **à la demande** : pas de puzzle quotidien. Une expédition est entièrement déterminée par son **code** :

| Source | Code | Origine |
|---|---|---|
| **Catalogue** (Carnet d'expéditions) | `MER-0001`… | fichier écrit à la main, validé en CI |
| **Générée** (Nouvelle expédition) | `MER-` + graine base 32 (ex. `MER-7KQ2`) + difficulté encodée | `generateExpedition(seed, difficulty, library)` — §14 |

Même code ⇒ même expédition (port, méridien, consignes, ordres) sur tous les appareils, hors-ligne compris.

| Élément | Règle |
|---|---|
| **Port de départ** | une ville réelle (nom + lon/lat), choisie par le contenu ou le générateur. C'est le camp 0, il n'appartient à aucune étape et son pays **n'est pas** interdit. |
| **Étapes** | exactement **6**. Étapes 1–5 : consignes fixes. Étape 6 : consigne fixe **ou** contextuelle (§7). |
| **Méridien de l'expédition** | une longitude entière `λm ∈ [-180, 180)`, multiple de 5. |
| **Ordres de mission** | 1 au MVP, 1 à 3 en v1.1 selon la difficulté (§8). |
| **Longue-vue** | 1 utilisation par expédition, 2 en Facile (§9). |
| **Unicité** | un même pays ne peut être utilisé qu'**une fois** par expédition. |

---

## 3. Résolution d'une étape

### 3.1 Saisie
1. Le joueur pose un camp **provisoire** (tap, glisser, loupe ou recherche). Le moteur n'est pas consulté pour la validité : l'UI affiche seulement le nom du pays et la **distance potentielle**. ⚠️ Aucune indication de validité avant confirmation (sinon essai-erreur gratuit).
2. Le joueur confirme : action `CONFIRM_CAMP { lon, lat, iso3 }` — `iso3` est l'entité jouable résolue par `geoContains` (voir `data-model.md` §2 pour la règle territoires → État souverain).

### 3.2 Pré-conditions (refus sans pénalité)
La confirmation est **refusée** (rien ne se passe, une note marginale explique) si :
- le point n'est dans aucune entité jouable (mer, Antarctique, territoire non jouable — §12) ;
- le pays a déjà été utilisé dans cette expédition (« Tu as déjà campé au Pérou ») ;
- le point est dans une **zone contestée** marquée non plantable.

Ces cas ne coûtent rien : ce sont des erreurs de manipulation, pas de connaissance.

### 3.3 Validation
`valid = predicate(leg.predicate, countryFacts[iso3], context)`.

| Résultat | Effet |
|---|---|
| **Valide** | le camp courant devient `(lon, lat)` ; distance d'étape calculée (§4) ; méridien (§5) ; rareté (§6) |
| **Fausse piste** | distance = 0 ; **le camp courant ne bouge pas** (on repart du camp précédent) ; pas de tampon ; le pays reste néanmoins « consommé » (pas de seconde tentative) ; une note marginale donne la raison avec un fait éducatif |

Pas de vies, pas de seconde chance au MVP : une étape ratée coûte la distance de l'étape et la distance *potentielle* de l'étape suivante n'est pas affectée (on repart d'où l'on était).

### 3.4 Abandon / temps / tentatives
- Une expédition standard n'a **pas de limite de temps**. Le temps écoulé est enregistré (récapitulatif), jamais pénalisant.
- Quitter l'app sauvegarde l'état ; on reprend à l'étape en cours **sans limite de durée**. Plusieurs expéditions peuvent être en cours en parallèle (max 5, la plus ancienne est proposée à l'abandon au-delà).
- Abandonner explicitement : étapes restantes « non jouées » (distance 0), pas de tampon pour elles, run non soumis aux classements.
- **Première tentative** : seule la première partie terminée d'un code par un joueur compte pour le classement de l'expédition et les statistiques de rareté. Les parties suivantes du même code sont des **rejeux** : score affiché, mais ni tampon, ni encrage de l'atlas, ni classement.

---

## 4. Distance

- **Formule** : distance orthodromique (haversine) entre le camp précédent valide (ou le port) et le nouveau camp, rayon terrestre moyen `R = 6 371,0088 km`.
- Arrondi : au **kilomètre** à l'affichage ; le moteur conserve des flottants et arrondit le total final (`Math.round`) pour garantir l'égalité client/serveur.
- Bornes : 0 ≤ d ≤ πR ≈ 20 015 km.
- **Implication stratégique** : la distance dépend du *point* choisi dans le pays. Planter au cap Horn plutôt qu'à Santiago change tout. C'est voulu (« camp libre »).
- **Anti-exploitation** : la position est quantifiée à 0,01° (≈ 1 km) avant calcul et stockage → pas de micro-optimisation au mètre, encodage de partage compact.

---

## 5. Méridien de l'expédition (« Traversée »)

- Une étape valide **franchit** le méridien `λm` si l'arc de grand cercle (le plus court) entre les deux camps coupe le demi-méridien de longitude `λm` (et non son antiméridien `λm+180`).
- Calcul : on échantillonne l'arc (`geoInterpolate`, 128 pas) et on détecte un changement de signe de `wrap(lon − λm)` dans `(-180, 180]` **sans** saut de ±360 (qui indiquerait l'antiméridien). Un arc minimal coupe un demi-méridien au plus une fois.
- **Récompense** : `+ BALANCE.meridianBonus` (750) points de renommée par traversée, **2 traversées maximum** comptées par expédition ; un losange doré sur la route ; un **sceau doré** de collection à la première traversée.
- Rôle de design : objectif spatial simple qui pousse les routes à zigzaguer autour d'une ligne différente chaque jour → variété des routes et des partages.

---

## 6. Rareté

### 6.1 Définition — rareté **par consigne**
Sans puzzle commun quotidien, la rareté se mesure au niveau de la **consigne** (`PromptDef`), qui est réutilisée par de nombreuses expéditions (catalogue et générées). Pour une consigne *q* et un pays *c* valide, `n(q,c)` = nombre de **joueurs distincts** ayant planté un camp valide dans *c* la **première fois** qu'ils ont rencontré *q* ; `N(q) = Σ n(q,c)` ; `p(c) = n(q,c) / N(q)`.

- *Première rencontre uniquement* : un joueur contribue **une seule fois** par consigne → impossible de « fabriquer » de la rareté en rejouant, et on mesure le réflexe spontané, pas l'apprentissage.
- *Toutes périodes* : les compteurs sont cumulatifs (pas de fenêtre glissante au MVP) ; une décroissance (demi-vie) pourra être ajoutée si les distributions dérivent.
- *Indépendance du contexte* : la rareté ne dépend pas du port ni du camp précédent (sauf étape contextuelle, §7.2). Elle mesure « qui pense à ce pays pour cette consigne ».

### 6.2 Paliers par part cumulée (robuste au nombre de réponses valides)
1. Trier les pays valides par `p` décroissant (égalités : ordre ISO3 alphabétique pour le déterminisme).
2. Pour chaque pays, calculer la **part cumulée au point milieu** : `m(c) = Σ_{c' avant c} p(c') + p(c)/2`.
3. Palier :

| Palier | Condition | Proportion attendue des réponses |
|---|---|---|
| **Route connue** | `m < 0,50` | ≈ 50 % |
| **Sentier** | `0,50 ≤ m < 0,80` | ≈ 30 % |
| **Confins** | `0,80 ≤ m < 0,95` | ≈ 15 % |
| **Terra incognita** | `m ≥ 0,95` ou `n = 0` | ≈ 5 % |

Pourquoi : un seuil en part absolue (« < 1 % ») se comporte très différemment selon qu'une consigne a 8 ou 60 réponses ; la part cumulée garantit une **distribution stable des paliers** pour toutes les consignes.

### 6.3 Démarrage à froid et lissage (prior bayésien)
`n_eff(q,c) = n_obs(q,c) + α · π(q,c)` où :
- `π(q,c)` = distribution a priori sur les pays valides : `π ∝ salience(c)^β` (salience : notoriété du pays — voir `data-model.md` §3 ; `β` calibré en playtest, initial 1,4) ;
- `α = BALANCE.rarityPriorWeight` = 200 pseudo-réponses.
Hors-ligne (MVP sans backend), `n_obs = 0` : la rareté est entièrement estimée. Le joueur voit l'étiquette « estimée ».

### 6.4 Cycle de vie : encre fraîche → encre sèche
- **Au moment de jouer** : palier **provisoire**, calculé avec le dernier instantané de rareté disponible (cache local ou serveur ; à défaut, prior seul → « estimé »). Le tampon est « encre fraîche ».
- **24 h après la partie** (`BALANCE.inkDryHours`) : le palier est recalculé avec l'instantané courant de la consigne puis **figé** pour ce tampon. À la prochaine ouverture de l'app, les tampons secs « sèchent » (animation regroupée) et peuvent changer de palier (dans les deux sens). C'est un petit moment de retour, sans rendez-vous imposé.
- Le palier figé compte pour le passeport et la renommée définitive. Hors-ligne au-delà de 24 h : le séchage a lieu à la prochaine connexion.

### 6.5 Multiplicateur de renommée
| Palier | Multiplicateur `μ` |
|---|---|
| Route connue | 1,00 |
| Sentier | 1,10 |
| Confins | 1,25 |
| Terra incognita | 1,50 |

---

## 7. Étape contextuelle (étape 6) et mode Chaîne

### 7.1 Règles de contexte
Une consigne contextuelle est une **fonction du camp précédent** qui produit un prédicat :
| Règle | Exemple de texte |
|---|---|
| `neighborOf(prev)` | « Un pays voisin de ton dernier camp » |
| `sameInitial(prev)` | « Un pays dont le nom commence par la même lettre » (langue de l'interface ; voir risque i18n §13) |
| `otherHemisphere(prev, 'NS')` | « Un pays de l'autre hémisphère » |
| `sameContinent(prev)` / `otherContinent(prev)` | « Reste sur le même continent » |
| `returnTowardsPort` | « Rentre : un pays plus proche du port que ton camp actuel » |

Contrainte de contenu : la règle doit produire **≥ 3 réponses valides** pour chaque pays précédent possible ; sinon, repli automatique sur une consigne de secours définie dans l'expédition. Le joueur ne voit **jamais** une consigne impossible.

### 7.2 Rareté contextuelle
Calculée par **sous-groupe** `(q, contextKey)` (ex. pays précédent) si le sous-groupe compte ≥ 30 joueurs ; sinon prior seul.

### 7.3 Mode Chaîne (v1.2)
Chaque étape est contextuelle ; partie sans fin ; 3 fausses pistes = fin. Score = renommée cumulée ; rareté = prior uniquement (pas de comparaison possible).

---

## 8. Ordres de mission

### 8.1 Catalogue (prédicats sur la route complète)
| Id | Texte | Évaluation |
|---|---|---|
| `continentHopper(n)` | « Change de continent au moins *n* fois » | nb de transitions de continent entre camps valides consécutifs (port inclus) |
| `islander(n)` | « Plante *n* camps sur une île » | camp dans un polygone insulaire (`island=true` au niveau du polygone, pas du pays) |
| `equatorShuttle` | « Franchis l'équateur à l'aller et au retour » | ≥ 2 traversées d'équateur |
| `southernSoul` | « Ne quitte jamais l'hémisphère sud » | tous les camps valides lat < 0 |
| `longHaul(km)` | « Une étape de plus de *km* » | max(d) ≥ km |
| `noFalseTrail` | « Aucune fausse piste » | — |
| `coastHugger(n)` | « *n* camps à moins de 50 km d'une côte » | distance au trait de côte (pré-calculée en raster de distance) |
| `meridianWeaver` | « Franchis deux fois le méridien » | ≥ 2 traversées |

### 8.2 Récompense
- Chaque ordre accompli : **+ 5 %** de la renommée de base (somme des `d·μ`), soit au plus **+ 15 %** avec 3 ordres — les ordres orientent sans écraser la distance.
- 1 sceau de cire par ordre (monnaie cosmétique).

### 8.3 Contraintes de contenu
Les ordres d'une même journée ne doivent pas être mutuellement exclusifs avec la majorité des consignes (vérifié par `prompt-forge` : il existe au moins une route valide qui accomplit chacun d'eux).

---

## 9. Longue-vue (indice)

- 1 par expédition (2 en Facile), utilisable avant de confirmer une étape.
- Effet : voile léger sur les **sous-régions ONU (M49)** qui contiennent ≥ 1 réponse valide non encore utilisée. Ne nomme aucun pays.
- Coût : sur cette étape, le palier maximal est **Confins** (la Terra incognita est « déjà cartographiée »). Pas d'autre pénalité.
- Statistique partagée : « longue-vue utilisée » apparaît dans le partage (🔭).

---

## 10. Score : la Renommée

```
base       = Σ_étapes_valides ( d_i × μ(palier_i) )
méridien   = min(traversées, 2) × 750
ordres     = base × 0,05 × nb_ordres_accomplis
Renommée   = round( base + méridien + ordres )
```

- **Affichage** : le récapitulatif montre la **distance** (km) en grand — c'est le fantasme du jeu — et la **Renommée** juste en dessous, qui est le score de comparaison officiel (amis, historique).
- Ordres de grandeur (hypothèses à vérifier) : distance médiane attendue 30–45 000 km ; renommée médiane 35–55 000 ; plafond théorique ≈ 6 × 20 015 × 1,5 × 1,15 + 1 500 ≈ 209 000 (inatteignable en pratique).

---

## 11. Paramètres d'équilibrage (`BALANCE`)

Seule source de vérité, dans `packages/engine/src/balance.ts`. Toute modification passe par QA/Balance et incrémente `BALANCE.version` (enregistrée dans chaque run).

| Paramètre | Valeur initiale | Notes |
|---|---|---|
| `legsPerExpedition` | 6 | |
| `earthRadiusKm` | 6371.0088 | |
| `coordQuantumDeg` | 0.01 | |
| `tierCutoffs` | [0.50, 0.80, 0.95] | parts cumulées |
| `tierMultipliers` | [1.00, 1.10, 1.25, 1.50] | |
| `rarityPriorWeight` (α) | 200 | |
| `salienceExponent` (β) | 1.4 | |
| `contextSubgroupMin` | 30 | |
| `inkDryHours` | 24 | délai avant figeage d'un tampon |
| `maxRunsInProgress` | 5 | expéditions en cours simultanément |
| `generatorMaxRetries` | 64 | rejets déterministes avant repli sur une expédition de secours |
| `meridianBonus` | 750 | |
| `meridianMaxCount` | 2 | |
| `missionBonusRate` | 0.05 | |
| `spyglassPerExpedition` | 1 | 2 en difficulté Facile |
| `spyglassTierCap` | `frontier` | |
| `promptValidCount` | [8, 60] | contrainte de contenu |
| `promptMinContinents` | 3 | sauf consigne régionale |
| `touchSnapRadiusPx` | 12 | carte |
| `microStateHaloPx` | 22 | carte |

---

## 12. Règles d'entités jouables (résumé, détail dans `data-model.md`)

- Une réponse = un **État jouable** (liste fermée, versionnée).
- Les **territoires rattachés** (Guyane, Groenland, Porto Rico, Nouvelle-Calédonie…) **comptent pour leur État souverain** : on peut planter le camp de la France à La Réunion. Stratégiquement riche, à condition que les faits des consignes soient non ambigus (les faits marqués `territorySensitive` ne sont pas utilisables en consigne).
- Antarctique et zones contestées non plantables (refus sans pénalité, §3.2).

---

## 13. Cas limites (liste de référence pour QA)

1. Pin exactement sur une frontière → `geoContains` sur la géométrie haute résolution ; si deux pays, le pays dont le *pole of inaccessibility* est le plus proche (déterministe).
2. Pin dans une enclave (Lesotho dans l'Afrique du Sud, Saint-Marin, Vatican) → la géométrie la plus profonde gagne (les trous des polygones sont respectés).
3. Pin dans un lac intérieur (lac Victoria) → partition des lacs par Natural Earth : lac = pays riverain si la géométrie admin-0 l'inclut ; sinon refus « en eau », snap proposé.
4. Arc traversant l'antiméridien → distance haversine non affectée ; tracé découpé par d3.
5. Deux camps au même point (impossible : pays différents) ; camps très proches (Vatican → Italie, d ≈ 1 km) → valide, distance ~0 : c'est un choix du joueur.
6. Port de départ dans le pays d'une réponse valide → autorisé.
7. Étape contextuelle après une fausse piste → le contexte est le **dernier camp valide** (ou le port).
8. Rejouer un code déjà terminé → rejeu (§3.4) : ni tampon, ni stats, ni classement ; même code ouvert sur deux appareils → la première soumission acceptée par le serveur fait foi.
9. Correction de contenu après publication (consigne erronée) → l'étape est **neutralisée** : toute réponse valide sous l'ancien *ou* le nouveau prédicat est acceptée, recalcul serveur, note dans le passeport.
10. Langue : `sameInitial` dépend de la langue → la règle est évaluée sur le nom dans la langue **de l'interface au démarrage de l'expédition**, et la rareté est calculée par sous-groupe de langue.
11. Code d'expédition générée produit avec une ancienne version de la bibliothèque de consignes → le code embarque `libraryVersion` ; les anciennes bibliothèques restent livrées (compressées) pour rejouer à l'identique.
12. Consigne retirée de la bibliothèque (erreur factuelle) → les expéditions qui l'utilisaient la remplacent par sa consigne de correction ; l'étape est neutralisée (cas 9).

---

## 14. Générateur d'expéditions (« Nouvelle expédition »)

`generateExpedition(seed, difficulty, library) → Expedition`, dans `packages/engine`, déterministe (PRNG mulberry32 seedé).

1. **Port** : tiré parmi ~120 ports (pondéré pour varier les continents).
2. **Méridien** : multiple de 5 tiré uniformément, rejeté s'il est à moins de 20° du port (sinon trivial).
3. **Consignes** : 6 tirées de la bibliothèque selon la difficulté :

| Difficulté | Consignes éligibles (`difficulty` calculée par prompt-forge, 0–1) | Ordres de mission | Longue-vue |
|---|---|---|---|
| Facile | ≤ 0,45 | 1 | 2 |
| Normal | 0,2 – 0,75 | 2 | 1 |
| Expert | ≥ 0,5, dont ≥ 1 ≥ 0,8 | 3 | 1, option « Carnet complet » (toutes les consignes visibles dès le départ → planification de route) |

4. **Contraintes de diversité** : pas deux catégories identiques consécutives, ≥ 4 catégories distinctes, pas deux consignes dont les ensembles de réponses se recouvrent à > 60 %, au plus une consigne régionale, étape 6 contextuelle avec probabilité 0,3 (avec `fallback`).
5. **Ordres de mission** : tirés puis vérifiés atteignables (recherche gloutonne d'une route valide).
6. Échec d'une contrainte → nouvelle graine dérivée `hash(seed, tentative)` ; après `generatorMaxRetries`, expédition de secours issue du catalogue (déterministe).

Le générateur est testé en CI sur 100 000 graines × 3 difficultés : 0 expédition invalide, distribution des catégories et continents surveillée.

---

## 15. Progression (règles)

| Système | Règle |
|---|---|
| **Passeport** | 1 page par État jouable, 4 emplacements (un par palier). Un emplacement est rempli au premier tampon **figé** de ce palier. Pays « maîtrisé » = 4/4. Le compteur total de tampons par palier est conservé. |
| **Atlas personnel** | un pays est encré au premier camp **valide** (hors rejeu). Intensité du lavis = nb d'emplacements remplis (0–4). |
| **Sceaux** | +1 par ordre accompli, +1 par expédition où le méridien est franchi. |
| **Titres** | jalons déclaratifs (ex. `islands ≥ 20`, `continents = 6`, `incognita ≥ 10`) définis dans `content/titles.json`. |
| **Journal de bord** | liste des expéditions terminées (route miniature, score, tampons) ; jalons 10 / 50 / 100 / 500 expéditions. Pas de série quotidienne. |
| **Kilomètres à vie** | somme des distances (hors rejeu) ; jalons « tours de la Terre » (40 075 km). |
| **Classements** | par expédition du catalogue (public, 1re tentative) et par défi (entre les joueurs d'un même code). Pas de classement global au MVP. |

---

## 16. Télémétrie de design (anonyme, opt-out)
Pour l'équilibrage : temps par étape, déplacements du camp provisoire (nb, distance), usage de la longue-vue, taux de fausse piste par consigne, distribution des paliers, partage effectué. Rien de personnel ; agrégé par consigne et par code d'expédition.
