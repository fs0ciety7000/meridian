# Meridian — Systèmes de gameplay

> **Auteur :** Systems Designer (`.claude/agents/systems-designer.md`)
> **Relecteurs :** Game Designer (intention), QA/Balance (équilibrage, cas limites), Tech Lead (implémentation dans `packages/engine`)
> **Statut :** v0.1 — valeurs numériques = premières hypothèses, à calibrer en playtest
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
            │ Récompenses  │ tampons (passeport), atlas, sceaux, titres, série
            └──────────────┘
```

---

## 2. Structure d'une expédition (Daily)

| Élément | Règle |
|---|---|
| **Port de départ** | une ville réelle (nom + lon/lat), choisie par le contenu. C'est le camp 0, il n'appartient à aucune étape et son pays **n'est pas** interdit. |
| **Étapes** | exactement **6**. Étapes 1–5 : consignes fixes. Étape 6 : consigne fixe **ou** contextuelle (§7). |
| **Méridien du jour** | une longitude entière `λm ∈ [-180, 180)`, multiple de 5. |
| **Ordres de mission** | 1 au MVP, 3 en v1.1 (§8). |
| **Longue-vue** | 1 utilisation par expédition (§9). |
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

### 3.4 Abandon / temps
Le Daily n'a **pas de limite de temps**. Le temps écoulé est enregistré (affiché dans le récapitulatif, jamais pénalisant). Quitter l'app sauvegarde l'état ; on reprend à l'étape en cours le même jour local. Si le jour change, l'expédition non terminée est close avec les étapes restantes en « non jouées » (distance 0, pas de fausse piste comptée pour les stats).

---

## 4. Distance

- **Formule** : distance orthodromique (haversine) entre le camp précédent valide (ou le port) et le nouveau camp, rayon terrestre moyen `R = 6 371,0088 km`.
- Arrondi : au **kilomètre** à l'affichage ; le moteur conserve des flottants et arrondit le total final (`Math.round`) pour garantir l'égalité client/serveur.
- Bornes : 0 ≤ d ≤ πR ≈ 20 015 km.
- **Implication stratégique** : la distance dépend du *point* choisi dans le pays. Planter au cap Horn plutôt qu'à Santiago change tout. C'est voulu (« camp libre »).
- **Anti-exploitation** : la position est quantifiée à 0,01° (≈ 1 km) avant calcul et stockage → pas de micro-optimisation au mètre, encodage de partage compact.

---

## 5. Méridien du jour (« Traversée »)

- Une étape valide **franchit** le méridien `λm` si l'arc de grand cercle (le plus court) entre les deux camps coupe le demi-méridien de longitude `λm` (et non son antiméridien `λm+180`).
- Calcul : on échantillonne l'arc (`geoInterpolate`, 128 pas) et on détecte un changement de signe de `wrap(lon − λm)` dans `(-180, 180]` **sans** saut de ±360 (qui indiquerait l'antiméridien). Un arc minimal coupe un demi-méridien au plus une fois.
- **Récompense** : `+ BALANCE.meridianBonus` (750) points de renommée par traversée, **2 traversées maximum** comptées par expédition ; un losange doré sur la route ; un **sceau doré** de collection à la première traversée.
- Rôle de design : objectif spatial simple qui pousse les routes à zigzaguer autour d'une ligne différente chaque jour → variété des routes et des partages.

---

## 6. Rareté

### 6.1 Définition
Pour une étape *e* et un pays *c* valide, soit `n(e,c)` le nombre de joueurs ayant planté un camp **valide** dans *c* pour *e*, `N(e) = Σ n(e,c)`. La part est `p(c) = n(e,c) / N(e)`.

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

Pourquoi : un seuil en part absolue (« < 1 % ») se comporte très différemment selon qu'une consigne a 8 ou 60 réponses ; la part cumulée garantit une **distribution stable des paliers** pour tous les jours.

### 6.3 Démarrage à froid et lissage (prior bayésien)
`n_eff(e,c) = n_obs(e,c) + α · π(e,c)` où :
- `π(e,c)` = distribution a priori sur les pays valides : `π ∝ salience(c)^β` (salience : notoriété du pays — voir `data-model.md` §3 ; `β` calibré en playtest, initial 1,4) ;
- `α = BALANCE.rarityPriorWeight` = 200 pseudo-réponses.
Hors-ligne (MVP sans backend), `n_obs = 0` : la rareté est entièrement estimée. Le joueur voit l'étiquette « estimée ».

### 6.4 Cycle de vie : encre fraîche → encre sèche
- **Pendant la journée** : palier **provisoire**, recalculé par instantané toutes les 10 min (backend). Le tampon est « encre fraîche ».
- **À la bascule** (fin du dernier fuseau, UTC−12 minuit + 1 h de marge) : instantané **figé**. À la prochaine ouverture, les tampons « sèchent » (animation) et peuvent changer de palier (dans les deux sens). C'est un moment de retour voulu.
- Le palier figé est celui qui compte pour le passeport et la renommée définitive.

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
Calculée par **sous-groupe** `(e, contextKey)` (ex. pays précédent) si le sous-groupe compte ≥ 30 joueurs ; sinon prior seul.

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
| `meridianWeaver` | « Franchis deux fois le méridien du jour » | ≥ 2 traversées |

### 8.2 Récompense
- Chaque ordre accompli : **+ 5 %** de la renommée de base (somme des `d·μ`), soit au plus **+ 15 %** avec 3 ordres — les ordres orientent sans écraser la distance.
- 1 sceau de cire par ordre (monnaie cosmétique).

### 8.3 Contraintes de contenu
Les ordres d'une même journée ne doivent pas être mutuellement exclusifs avec la majorité des consignes (vérifié par `prompt-forge` : il existe au moins une route valide qui accomplit chacun d'eux).

---

## 9. Longue-vue (indice)

- 1 par expédition, utilisable avant de confirmer une étape.
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
| `meridianBonus` | 750 | |
| `meridianMaxCount` | 2 | |
| `missionBonusRate` | 0.05 | |
| `spyglassPerExpedition` | 1 | |
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
8. Changement de jour pendant la partie → voir §3.4.
9. Correction de contenu après publication (consigne erronée) → l'étape est **neutralisée** : toute réponse valide sous l'ancien *ou* le nouveau prédicat est acceptée, recalcul serveur, note dans le passeport.
10. Langue : `sameInitial` dépend de la langue → la règle est évaluée sur le nom dans la langue **de l'interface au démarrage de l'expédition**, et la rareté est calculée par sous-groupe de langue.

---

## 14. Mode Entraînement (Practice)

- Génération : `seed` → 1 port (liste de 120 ports), 6 consignes tirées de la bibliothèque selon une **difficulté** (Facile / Normal / Expert) et des contraintes de diversité (pas deux catégories identiques consécutives, ≥ 4 catégories distinctes).
- Rareté : prior seul. Tampons « d'entraînement » (gris) non comptés au passeport principal ; l'atlas personnel n'est pas encré.
- Option Expert : « Carnet complet » (toutes les consignes visibles dès le départ → planification de route).

---

## 15. Progression (règles)

| Système | Règle |
|---|---|
| **Passeport** | 1 page par État jouable, 4 emplacements (un par palier). Un emplacement est rempli au premier tampon **figé** de ce palier. Pays « maîtrisé » = 4/4. Le compteur total de tampons par palier est conservé. |
| **Atlas personnel** | un pays est encré au premier camp **valide** (Daily ou Archives). Intensité du lavis = nb d'emplacements remplis (0–4). |
| **Sceaux** | +1 par ordre accompli, +1 par première traversée du méridien du jour. |
| **Titres** | jalons déclaratifs (ex. `islands ≥ 20`, `continents = 6`, `incognita ≥ 10`) définis dans `content/titles.json`. |
| **Série** | +1 par jour avec une expédition terminée ; 1 jour de repos gratuit par semaine glissante. |
| **Kilomètres à vie** | somme des distances Daily ; jalons « tours de la Terre » (40 075 km). |

---

## 16. Télémétrie de design (anonyme, opt-out)
Pour l'équilibrage : temps par étape, déplacements du camp provisoire (nb, distance), usage de la longue-vue, taux de fausse piste par consigne, distribution des paliers, partage effectué. Rien de personnel ; agrégé par `puzzle_id`.
