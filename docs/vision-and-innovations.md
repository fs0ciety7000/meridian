# Meridian — Vision & innovations

> **Auteur :** Game Designer (`.claude/agents/game-designer.md`)
> **Contributions :** Systems Designer (faisabilité des systèmes), Art Director (traduction visuelle)
> **Statut :** v0.1 — à valider
> **Prérequis :** `docs/architecture.md`

---

## 1. Vision

> **Meridian est une expédition quotidienne de cinq minutes à travers un atlas vivant.**
> Chaque jour, tout le monde part du même port avec les mêmes six consignes. Tu réponds en **plantant ton camp sur la carte**, n'importe où dans un pays qui convient. Plus tu vas loin, plus ta route est longue ; plus ton choix est rare, plus ton tampon est précieux. Ton passeport se remplit, ton atlas personnel s'encre, et ta route du jour devient une petite carte que tu as envie de montrer.

### Les trois promesses
1. **Savoir, puis oser.** La culture géographique ouvre des options ; l'audace (choisir le pays lointain, l'île oubliée) les rend payantes.
2. **La carte est le jeu.** On ne tape pas une réponse dans une liste : on la *pose* sur le monde. Chaque geste laisse une trace d'encre.
3. **Un objet que l'on garde.** Chaque journée produit un artefact — une route, des tampons, une page d'atlas — qui a de la valeur esthétique, pas seulement un score.

### Public
- **Cœur** : joueurs de daily games (Wordle, Worldle, Travle, Globle, Farflung) — sessions courtes, partage social.
- **Extension** : amateurs de cartes, de voyages, de collection (philatélie, carnets de voyage) qui viennent pour la beauté et restent pour la collection.
- **Ton** : curieux, élégant, jamais condescendant. On apprend un fait par jour sans quiz scolaire.

### Piliers de design (arbitrage en cas de conflit, dans l'ordre)
1. **Map-first** — si une décision éloigne le regard de la carte, elle est rejetée ou reformulée.
2. **Équité du daily** — tout le monde joue la même expédition ; aucune mécanique ne dépend de la chance.
3. **Lisible en 10 secondes** — un nouveau joueur comprend la première étape sans tutoriel textuel.
4. **Profondeur optionnelle** — l'optimisation (placement du camp, rareté, objectifs) est une couche pour ceux qui la cherchent.
5. **Premium sans friction** — pas de pub interstitielle, pas de dark patterns, pas de compte obligatoire.

---

## 2. Core loop

### 2.1 Boucle d'une étape (≈ 30–60 s)
```
Lire la consigne (cartouche)
   → Explorer la carte (pan/zoom, la caméra s'est déjà orientée depuis le dernier camp)
   → Poser un camp provisoire (tap) — le pays s'illumine, la distance potentielle s'affiche
   → Ajuster (déplacer le camp dans le pays pour aller plus loin)
   → Confirmer « Planter le camp »
   → Révélation : validité ✓/✗, route tracée à l'encre, km ajoutés, rareté estimée (tampon)
```

### 2.2 Boucle quotidienne (≈ 4–6 min)
```
Ouvrir → Port de départ du jour + Méridien du jour
   → 6 étapes → Récapitulatif (route complète en vue globe, distance, tampons)
   → Partage (texte + carte postale) → Passeport mis à jour
   → Le lendemain : les tampons « sèchent » (rareté figée), nouvelle expédition
```

### 2.3 Boucle méta (semaines)
```
Collectionner des tampons (pays × rareté) → encrer l'atlas personnel
   → Débloquer des cartouches (faits cachés, vignettes d'atlas)
   → Ordres de mission hebdomadaires → titres d'explorateur
```

---

## 3. Différenciation

| Farflung et les daily géo | Meridian |
|---|---|
| On choisit un pays (réponse discrète) | **On plante un camp à une position précise** : la distance dépend de *où* dans le pays → micro-décision spatiale à chaque étape |
| Score = un nombre | Score + **artefact** : route dessinée, carte postale partageable, passeport |
| Rareté affichée | **Rareté qui « sèche »** : provisoire pendant la journée, figée à minuit, le tampon change d'encre dans le passeport |
| Interface fonctionnelle | **Direction artistique d'atlas** : papier, encre, gravure, cartouches, tampons en relief |
| Progression faible | **Atlas personnel** qui s'encre pays par pays + passeport à 4 niveaux par pays |
| Mercator / listes | Projections d'atlas (Equal Earth), rotation vers l'expédition, globe au récapitulatif |
| Rien ne relie les jours | **Méridien du jour** + ordres de mission + saisons thématiques |

Une phrase pour le pitch : **« Le daily géo où ta réponse est un lieu, pas un mot. »**

---

## 4. Idées de gameplay explorées

Chaque idée est évaluée sur : **Valeur** (plaisir/différenciation), **Coût** (technique + contenu), **Risque**, et **Décision** (MVP / v1.x / plus tard / rejetée). Les idées marquées ★ sont des propositions originales du studio.

### 4.1 ★ Camp libre — la distance pin-à-pin
- **Principe** : la réponse est une position (lon/lat) dans le pays, pas le pays. La distance d'étape est le grand cercle entre deux camps.
- **Pourquoi** : transforme chaque réponse en micro-puzzle spatial (« si je choisis le Chili, je plante au Cap Horn ou à Arica selon la prochaine étape ? »). Rend la carte indispensable.
- **Garde-fou** : on ne connaît pas l'étape suivante à l'avance → pas de calcul optimal trivial ; mais la *carte des consignes* de l'expédition peut être révélée en option « Carnet complet » (mode Expert).
- **Décision : MVP** — c'est le cœur de l'identité.

### 4.2 Route visuelle d'expédition
- **Principe** : chaque étape trace un arc de grand cercle à l'encre ; au récapitulatif, la route complète tourne sur un globe.
- **Valeur** : retour visuel immédiat, base du partage (carte postale).
- **Décision : MVP**.

### 4.3 Rareté dynamique (« l'encre sèche »)
- **Principe** : 4 paliers selon la part des joueurs ayant fait le même choix pour la même consigne : **Route connue**, **Sentier**, **Confins**, **Terra incognita**. Provisoire en journée, figée à minuit.
- **Amorçage** : estimation a priori (notoriété × nombre de réponses valides) tant que l'échantillon est faible.
- **Décision : MVP en rareté estimée (hors-ligne) ; v1.1 dynamique** (backend).

### 4.4 Passeport de tampons
- **Principe** : une page par pays ; 4 emplacements de tampon (un par palier de rareté). Un pays est « maîtrisé » quand ses 4 tampons sont obtenus.
- **Valeur** : collection à long terme, raison de revenir, objectif lisible.
- **Décision : MVP** (local).

### 4.5 ★ Atlas personnel encré
- **Principe** : un planisphère « vierge » (gravure en grisé) où chaque pays visité se colore à l'aquarelle/encre. Les pays jamais visités restent en *terra incognita* hachurée.
- **Valeur** : progression la plus visuelle possible, fond d'écran de l'écran d'accueil.
- **Décision : MVP (version simple : encré / non encré), v1.x (intensité selon nb de tampons)**.

### 4.6 ★ Méridien du jour
- **Principe** : chaque expédition met en avant une longitude (ex. 30°E). Franchir ce méridien entre deux camps rapporte une **Traversée** (bonus fixe + marque sur la route). Donne son nom au jeu.
- **Valeur** : objectif spatial simple, crée des routes variées, signature visuelle forte (ligne dorée).
- **Décision : MVP**.

### 4.7 Ordres de mission (objectifs secondaires)
- **Principe** : 3 ordres par jour, ex. « Change de continent 3 fois », « Plante 2 camps sur une île », « Franchis l'équateur aller-retour », « Ne quitte jamais l'hémisphère sud ». Récompense : **sceaux de cire** (monnaie de cosmétiques / titres).
- **Risque** : pousser à des choix contradictoires avec la distance → c'est voulu (arbitrage), mais les ordres ne valent jamais plus de ~15 % du score.
- **Décision : MVP (1 ordre), v1.1 (3 ordres)**.

### 4.8 Consignes contextuelles / mode chaîne
- **Principe** : la consigne suivante dépend du camp précédent (« un voisin de ton dernier pays », « un pays dont le nom commence par la dernière lettre du précédent »).
- **Tension** : dans le daily, des consignes divergentes rendent la rareté incomparable.
- **Décision** : **Daily** = consignes fixes + **une seule étape contextuelle** (la 6e, « Retour au port » ou « Pays voisin ») dont la rareté est calculée par sous-groupe ; **Mode Chaîne** complet en v1.2.

### 4.9 Biomes et climats
- **Principe** : chaque pays porte des biomes dominants (Köppen simplifié : tropical, aride, tempéré, continental, polaire, montagne). Collection « Carnet naturaliste » ; ordres de mission (« traverse 4 climats »).
- **Décision : v1.2** (données à fiabiliser).

### 4.10 Cartouches rares (faits cachés)
- **Principe** : un tampon Confins ou Terra incognita débloque un **cartouche** — vignette illustrée + un fait remarquable sur le pays. Collection de 200+ cartouches.
- **Coût** : contenu illustré important → générer d'abord en texte + vignette typographique, illustrations progressives.
- **Décision : v1.1 (texte), v2 (illustrations)**.

### 4.11 Fantôme d'expédition (versus asynchrone)
- **Principe** : un lien de partage encode ta route ; ton ami la voit en pointillé sur sa carte pendant qu'il joue (après avoir planté chaque camp, pour éviter la copie). Comparaison étape par étape.
- **Valeur** : social sans serveur temps réel, très map-first.
- **Décision : v1.1** (encodage dans l'URL, aucun backend requis).

### 4.12 Expédition commune (coopératif léger)
- **Principe** : chaque semaine, la communauté (ou un groupe d'amis) cumule ses kilomètres vers un objectif (« faire 40 fois le tour de la Terre ») ; un tracé collectif apparaît sur la carte d'accueil.
- **Décision : v2**.

### 4.13 ★ Loupe d'arpenteur et précision
- **Principe** : appui long = loupe ×4. Bonus cosmétique « Arpenteur » si le camp est à < 25 km d'une frontière/côte extrême du pays (aller au bout du monde, littéralement).
- **Décision : loupe MVP ; bonus v1.x**.

### 4.14 ★ Longue-vue (indice unique)
- **Principe** : une fois par expédition, la longue-vue révèle sur la carte les **régions** (pas les pays) qui contiennent des réponses valides, en voile léger. Utilisée = pas de tampon Terra incognita sur cette étape.
- **Valeur** : rattrapage pour débutants sans casser l'équité.
- **Décision : MVP**.

### 4.15 Génération de consignes assistée
- **Principe** : outil interne (`tools/prompt-forge`) qui compose des prédicats sur la base de faits, calcule le nombre de réponses, la dispersion géographique et une difficulté estimée ; un humain valide.
- **Décision : MVP (outil interne, CLI)**.

### 4.16 Idées rejetées (et pourquoi)
- **Chronomètre punitif sur le daily** : contraire à « savoir puis oser » et à l'accessibilité. Le temps est enregistré et affiché, jamais pénalisant (voir mode Sprint).
- **Indices payants** : contraire au pilier 5.
- **Classement mondial au MVP** : triche facile, peu de valeur ; amis d'abord.

---

## 5. Modes

| Mode | Contenu | Statut |
|---|---|---|
| **Expédition du jour** (Daily) | Port de départ, 6 étapes, méridien du jour, 1–3 ordres de mission, rareté partagée | **MVP** |
| **Entraînement** (Practice) | Expéditions procédurales, seed libre, difficulté réglable, rareté estimée, pas de tampon de passeport (tampons d'entraînement à part) | **MVP** |
| **Archives** | Rejouer les expéditions passées (tampons gris « d'archive ») | v1.1 |
| **Fantôme** | Jouer le daily contre la route d'un ami | v1.1 |
| **Chaîne** | Consignes générées à partir du camp précédent, partie sans fin jusqu'à 3 fausses pistes | v1.2 |
| **Sprint « Course contre le soleil »** | 10 consignes, chronomètre (cadran solaire), score = km/minute | v1.2 |
| **Expédition commune** | Objectif hebdo coopératif | v2 |

---

## 6. Progression & collection

### 6.1 Ce que le joueur accumule
| Élément | Source | Affichage |
|---|---|---|
| **Kilomètres** | toutes les étapes valides | compteur à vie, « tours de la Terre » (40 075 km) |
| **Tampons** | pays × palier de rareté | passeport (page par pays, 4 emplacements) |
| **Atlas encré** | premier camp valide dans un pays | planisphère d'accueil |
| **Sceaux de cire** | ordres de mission, traversées du méridien | monnaie cosmétique |
| **Cartouches** | tampons Confins / Terra incognita | album (v1.1) |
| **Titres** | jalons (ex. « Cartographe des îles » : 20 pays insulaires tamponnés) | sous le nom dans le partage |

### 6.2 Cosmétiques (jamais d'avantage de jeu)
Encres de route (sépia, indigo, vermillon, or), styles de camp (tente, fanion, cairn, ancre), papiers d'atlas, projections alternatives débloquées (Winkel Tripel, Natural Earth, Dymaxion en easter egg). Débloqués par sceaux ou jalons, **jamais achetables au MVP**.

### 6.3 Série (streak)
Série de jours joués, présentée comme un **journal de bord** (pages consécutives). Un « jour de repos » gratuit par semaine (le carnet reste ouvert) pour éviter l'anxiété de série.

---

## 7. Partage

1. **Texte** (copier-coller universel) :
```
MERIDIAN · Expédition 142
🧭 31 480 km · ✦ Méridien franchi
⬜🟫🟦🟪⬛🟦
Route : Lisbonne → Mongolie → Bolivie → Nouvelle-Zélande → …
```
(les carrés codent les paliers de rareté, avec une forme alternative pour daltoniens dans les réglages)

2. **Carte postale** (image 1080×1350) : la route sur l'atlas, les 6 tampons, la distance, le numéro d'expédition — générée côté client via `AtlasMap.snapshot()`. C'est l'outil d'acquisition principal : elle doit être **belle même pour quelqu'un qui ne connaît pas le jeu**.

---

## 8. Ce que le MVP doit prouver
1. Planter un camp au doigt est **agréable et précis** (y compris pour Malte ou Tuvalu).
2. La micro-décision « où dans le pays » est **comprise et appréciée** (tests : ≥ 50 % des joueurs déplacent au moins une fois leur camp provisoire dès la 3e expédition).
3. La carte postale est **partagée spontanément** (objectif : ≥ 15 % des parties terminées).
4. On revient le lendemain pour voir son tampon « sécher » (D1 ≥ 40 %).
