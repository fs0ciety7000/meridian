# Meridian — Design System cartographique

> **Auteur :** Art Director (`.claude/agents/art-director.md`)
> **Relecteurs :** Tech Lead (faisabilité de rendu, budgets), QA/Balance (accessibilité)
> **Statut :** v0.2 — à valider sur prototype (révision : jeu à la demande, codes d'expédition)
> **Prérequis :** `docs/architecture.md` (§4.6 matières), `docs/vision-and-innovations.md`

Ce document est la **source de vérité visuelle**. Les tokens qu'il définit seront codés dans `packages/design-tokens` et exposés en variables CSS. Toute valeur visuelle en dur dans le code est un défaut.

---

## 1. Direction artistique

### 1.1 Concept : « La table des cartes de l'expédition »
Le joueur est penché sur une **table de cartographe** : un grand atlas ouvert au centre, entouré de ses instruments — un cartouche gravé qui énonce la consigne, un odomètre en laiton, un carnet de route, des tampons, une boîte de sceaux. L'interface n'est pas *posée sur* la carte : elle est **dans la marge** de la carte, comme les annotations d'un explorateur.

### 1.2 Références (pour l'esprit, jamais copiées)
- Atlas de la fin XIXe–milieu XXe : Stieler, Times Atlas (1922), Bartholomew — lettrage en petites capitales, hydrographie en italique, *water lines*.
- Cartes de l'IGN et de Swisstopo — précision, hiérarchie typographique, sobriété des couleurs.
- National Geographic (cartes papier des années 1960–80) — cartouches, échelles, rose des vents.
- Carnets de voyage et passeports anciens — tampons encrés, papier vergé, coins usés.
- Produits numériques premium contemporains (Apple Weather, Things, Linear) — pour la **retenue**, la fluidité et la précision du mouvement.

### 1.3 Les cinq mots
**Gravé · Encré · Précis · Chaleureux · Calme.**
Si un élément est *brillant, ludique-cartoon, bruyant, flottant ou générique*, il est hors sujet.

### 1.4 Principes
1. **La carte occupe ≥ 70 % de l'écran** à tout moment du jeu, sur tous les formats.
2. **Matière avant décor** : la texture vient du papier et de l'encre (grain, bavure, foulage), pas d'ornements ajoutés.
3. **Une couleur = une signification.** Le vermillon est la route du joueur, l'or est le méridien, les quatre encres de tampon sont la rareté. Rien d'autre ne les emprunte.
4. **Le mouvement raconte l'encre** : les choses se *tracent*, se *tamponnent*, *sèchent* ; elles ne rebondissent pas.
5. **Sobriété typographique** : trois familles, des petites capitales espacées, des chiffres tabulaires.

---

## 2. Palette

### 2.1 Thème « Atlas » (clair, par défaut)

| Token | Hex | Usage |
|---|---|---|
| `paper-100` | `#F7F1E5` | fond de page, panneaux |
| `paper-200` | `#F1E8D6` | **terres** (base) |
| `paper-300` | `#E6D9BF` | terres survolées, papier plié |
| `paper-400` | `#D6C5A3` | séparateurs, bord de cartouche |
| `sea-100` | `#DCE5E0` | **océan** (base, céladon pâle) |
| `sea-200` | `#C3D3CE` | lignes d'eau, lacs |
| `sea-300` | `#9DB5AF` | trait des lignes d'eau proches de la côte |
| `ink-900` | `#24232B` | texte principal, traits de côte (encre ferro-gallique, jamais `#000`) |
| `ink-700` | `#45434F` | texte secondaire |
| `ink-500` | `#6B6763` | graticule, légendes |
| `sepia-600` | `#6A513B` | frontières, annotations manuscrites |
| `vermilion-600` | `#B5452B` | **route du joueur**, camp actif, focus, CTA principal |
| `vermilion-700` | `#93361F` | état pressé |
| `meridian-500` | `#A27624` | **méridien de l'expédition**, sceaux de traversée (or) |
| `danger-wash` | `#B5452B` @ 18 % + hachure | fausse piste (toujours avec motif, jamais couleur seule) |

**Encres de rareté (tampons)** — toujours associées à une **forme** :

| Palier | Nom | Encre | Hex | Forme du tampon |
|---|---|---|---|---|
| 1 | Route connue | Sépia | `#7A5C3E` | cercle simple |
| 2 | Sentier | Vert-de-gris | `#2F7A6B` | rectangle à coins coupés |
| 3 | Confins | Outremer | `#2C4A9A` | octogone à double filet |
| 4 | Terra incognita | Cramoisi + or | `#8E1F3A` / `#A27624` | rosace dentelée (16 pointes) + étoile centrale |

Contrastes calculés (WCAG 2.1) sur `paper-100` : `ink-900` 13,8:1 · `ink-700` 8,6:1 · `sepia-600` 6,5:1 · `ink-500` 5,0:1 · `vermilion-600` 4,9:1 · sépia `#7A5C3E` 5,5:1 · vert-de-gris 4,5:1 · outremer 7,3:1 · cramoisi 7,8:1 · `meridian-500` 3,6:1. L'or n'est **jamais** utilisé pour du texte courant — uniquement pour des traits, pictos et petites capitales ≥ 18 px (seuil 3:1, WCAG 1.4.3/1.4.11). Thème Nocturne : encre crème 13,3:1, vermillon 5,3:1, sépia 4,9:1.

### 2.2 Thème « Nocturne » (sombre) — *la table de cartes à la lampe*

| Token | Hex |
|---|---|
| `paper-100` | `#141B22` (papier bleu nuit, pas noir) |
| `paper-200` (terres) | `#1E2A33` |
| `sea-100` (océan) | `#0F161C` |
| `ink-900` (texte, côtes) | `#E9E1CF` (encre crème) |
| `sepia-600` (frontières) | `#9C8467` |
| `vermilion-600` (route) | `#E2694B` |
| `meridian-500` | `#D9AE55` |

Le thème sombre conserve les textures (grain inversé, opacité réduite de moitié) ; ce n'est **pas** un mode « néon ».

### 2.3 Aquarelle des pays encrés (atlas personnel)
Un lavis par continent, très désaturé (opacité 22–35 % sur `paper-200`) : Afrique `#C98B4F`, Europe `#7C8DB0`, Asie `#B8705D`, Amériques `#7FA07A`, Océanie `#5E9AA6`, Antarctique `#A7B3B8`. Uniquement dans la vue **Atlas personnel** et le récapitulatif — jamais pendant une étape (ne pas donner d'indice).

---

## 3. Typographie

Toutes les polices sont **OFL** (licence libre, auto-hébergées, sous-ensembles latin + latin étendu).

| Rôle | Famille | Pourquoi |
|---|---|---|
| **Titrage / cartouches** | **Fraunces** (variable : `opsz`, `SOFT`, `WONK`) | Serif « old style » contemporaine, contrastée, avec une chaleur qui évoque la gravure sans pastiche. L'axe `opsz` donne de beaux titres ET de petites tailles. |
| **Lettrage de carte** | **EB Garamond** (petites capitales, italique) | Convention cartographique : pays en PETITES CAPITALES espacées, mers et fleuves en *italique*. Garamond est la référence des atlas européens. |
| **Interface / texte courant** | **Instrument Sans** | Grotesque sobre, très lisible en petite taille, ne concurrence pas les serifs ; utilisée pour boutons, réglages, textes d'aide. |
| **Chiffres / coordonnées** | **IBM Plex Mono** | Distances, coordonnées, numéro d'expédition : esprit « instrument d'arpentage », chiffres tabulaires. |

### Échelle (base 16 px, ratio 1,25)
| Token | Taille / interligne | Famille | Usage |
|---|---|---|---|
| `type-display` | 40/44 | Fraunces opsz 72, SOFT 50 | titre du récapitulatif |
| `type-cartouche` | 24/30 | Fraunces opsz 36 | **texte de la consigne** |
| `type-title` | 20/26 | Fraunces | titres de panneau |
| `type-body` | 16/24 | Instrument Sans | texte courant |
| `type-small` | 14/20 | Instrument Sans | aides, légendes (minimum mobile) |
| `type-label-caps` | 12/16, `letter-spacing: .14em`, `font-variant-caps: all-small-caps` | EB Garamond | étiquettes de carte, surtitres |
| `type-odometer` | 28/32, `tabular-nums` | IBM Plex Mono | distance |
| `type-coord` | 12/16, `tabular-nums` | IBM Plex Mono | coordonnées, échelle |

Règles : jamais plus de 2 graisses par écran ; pas de capitales pleines en Instrument Sans (seulement petites capitales Garamond) ; option d'accessibilité « Lecture facilitée » qui remplace Fraunces/Garamond par Instrument Sans.

---

## 4. Matières et textures

| Matière | Implémentation | Contraintes |
|---|---|---|
| **Papier** | texture vergée tuilée 512 px, AVIF, `multiply` à 35 % | ≤ 80 Ko ; pas de taches de café ni de déchirures (cliché) |
| **Grain** | bruit monochrome 256 px, 6 % | désactivable (« matière allégée ») |
| **Foulage** | `box-shadow: inset 0 1px 0 rgba(255,255,255,.5), inset 0 -1px 0 rgba(0,0,0,.06)` sur cartouches | simule le papier embossé |
| **Bord de feuille** | `clip-path` à bord légèrement irrégulier (deckle) sur les panneaux principaux uniquement | max 2 éléments à bord irrégulier par écran |
| **Ombre de papier** | `0 1px 1px rgba(36,35,43,.08), 0 6px 18px -6px rgba(36,35,43,.18)` | jamais d'ombre grise dure, jamais de flou > 24 px |
| **Laiton** (odomètre, boussole) | dégradé linéaire 3 stops `#B08D57 → #E3C98F → #8F6D3A` + trait `ink-900` | réservé aux 2 instruments ; pas de laiton ailleurs |
| **Encre de tampon** | SVG du tampon + masque de bruit (encrage irrégulier 85–100 %), rotation aléatoire ±6° (seedée) | le tampon doit rester lisible à 32 px |

---

## 5. Style de carte

### 5.1 Projection et cadrage
- **Equal Earth** par défaut, monde entier visible au repos avec marge de 4 % ; rotation vers l'expédition en cours.
- **Récapitulatif** : globe orthographique, ombrage doux (dégradé radial `sea-100 → sea-200`), halo d'atmosphère *papier* (pas de bleu ciel).
- **Cadre** : filet double (1 px + 0,5 px, `ink-900` 60 %) autour de la carte en vue Atlas, avec **graduations de longitude/latitude** tous les 15° dans la marge (`type-coord`).

### 5.2 Couches (de bas en haut)

| Couche | Style |
|---|---|
| Océan | `sea-100` + grain |
| Lignes d'eau | 3 contours décalés de la côte à 2 / 5 / 9 px écran, `sea-300`, opacité 60 / 35 / 18 %, épaisseur 0,6 px — **signature visuelle** |
| Graticule | tous les 15°, 0,4 px, `ink-500` 25 % ; équateur, tropiques et cercles polaires en tirets 4-3 avec étiquette italique |
| Terres | `paper-200` |
| Relief (optionnel) | ombrage gris-sépia multiply 12 %, uniquement à zoom ≥ ×3 |
| Frontières | 0,6 px `sepia-600`, tiret 3-1,5 ; **frontières contestées** : pointillé 1-2 |
| Traits de côte | 0,9 px `ink-900` + double 0,4 px décalé 1 px à 40 % (bavure d'encre) |
| Méridien de l'expédition | 1,5 px `meridian-500`, petites graduations dorées toutes les 10° de latitude, étiquette « MÉRIDIEN · 30° E » en petites capitales |
| Étiquettes | voir 5.3 |
| Route | voir §6.4 |
| Camps | voir §6.3 |

### 5.3 Étiquettes
- **En jeu** : aucune étiquette de pays par défaut (préserve la difficulté). Les océans sont étiquetés en *italique Garamond* espacé, `sea-300` → `ink-500`. Le nom du pays apparaît **après** le tap provisoire, dans le cartouche de sélection.
- **Option « Atlas annoté »** (aide) et **vue Atlas personnel** : pays en petites capitales Garamond, taille proportionnelle à la surface projetée (3 paliers), placés au *pole of inaccessibility*, masqués si collision.

### 5.4 États d'un pays
| État | Rendu |
|---|---|
| Repos | `paper-200` |
| Survol (desktop) | `paper-300` + contour 1 px `ink-700` |
| Sélection provisoire | lavis `vermilion-600` 10 % + contour 1,5 px `vermilion-600` |
| Validé | lavis de l'**encre du palier de rareté** 18 % (apparaît en fondu « l'encre se répand », 600 ms) |
| Fausse piste | hachures obliques 45° `vermilion-700` 35 % + contour pointillé |
| Atlas : non visité | hachures fines croisées `ink-500` 12 % (*terra incognita*) |
| Atlas : visité | lavis aquarelle du continent |

### 5.5 Instruments sur la carte
- **Échelle graphique** (bas gauche) : barre alternée noir/blanc, **mise à jour avec le zoom**, en km (ou miles selon la locale). Fonctionnelle, pas décorative.
- **Rose des vents** (haut droit, 48 px) : indique le nord de la projection ; tap = réinitialiser la vue. Dessin fin à 16 branches, `ink-900`, sans couleur.

---

## 6. Composants

Chaque composant est spécifié par : rôle, anatomie, états, comportement mobile. Les noms entre parenthèses sont les noms de composants React.

### 6.1 Cartouche de consigne (`PromptCartouche`)
- **Rôle** : énonce la consigne de l'étape. Inspiré du cartouche de titre des cartes anciennes.
- **Anatomie** : surtitre `type-label-caps` (« ÉTAPE 3 / 6 · CONSIGNE ») ; texte `type-cartouche` (≤ 2 lignes, 60 caractères visés) ; filet double ; coins ornés **minimes** (un simple fleuron 8 px) ; à droite, un pictogramme de catégorie (relief, eau, frontière, climat, culture).
- **Placement** : haut-centre, largeur max 560 px ; mobile : pleine largeur moins 16 px, collé sous la *safe area*.
- **États** : `entering` (se déplie verticalement comme un papier plié, 320 ms), `active`, `resolved` (se replie à une ligne, avec le tampon obtenu à droite).

### 6.2 Barre d'action (`CampBar`)
- **Rôle** : confirmer la réponse.
- **Anatomie** : nom du pays sélectionné (Fraunces 18) + coordonnées (`type-coord`) + **distance potentielle** depuis le camp précédent ; bouton **« Planter le camp »** en forme de **sceau de cire** vermillon (cercle 56 px, relief, picto tente gravé) ; bouton secondaire « Longue-vue » (indice).
- **États du bouton** : désactivé (sceau gris-papier, pas de relief), prêt, pressé (enfoncement 2 px + son de cire), confirmé (s'efface).
- **Mobile** : barre basse ancrée, hauteur 88 px + safe area, **zone de pouce**.

### 6.3 Camp / épingle (`Camp`)
- **Pas une goutte Google Maps.** Un **fanion** triangulaire sur un mât, 28 px de haut, pointe d'ancrage exacte en bas (un point de 3 px + croix fine de visée).
- États : `provisional` (contour vermillon, fanion qui flotte légèrement, ombre portée au sol elliptique) ; `planted` (fanion plein vermillon, s'enfonce de 2 px avec un petit cercle d'onde) ; `invalid` (fanion déchiré gris + croix) ; `historic` (petit cercle numéroté ①②③ en `ink-900` sur `paper-100`) ; `start` (ancre de port).
- Taille de cible tactile : 44 × 44 px invisible autour.

### 6.4 Route d'expédition (`RouteLine`)
- Grand cercle, 2 px `vermilion-600`, extrémités rondes ; segment en cours d'animation avec **pointe d'encre** (petit disque 3 px qui avance).
- Segments passés : 1,5 px, opacité 85 %, avec **petites hachures transversales** tous les 500 km (comme les traits d'échelle d'une route de voyage).
- Traversée du méridien : un losange doré 8 px sur la ligne.
- Fantôme (ami) : 1,5 px `ink-700` en tirets 2-4.

### 6.5 Odomètre de distance (`Odometer`)
- **Rôle** : distance cumulée. Instrument en laiton à rouleaux (chiffres `type-odometer`), suffixe « km ».
- Les rouleaux tournent pendant le tracé de la route (synchronisé, ease `ink`) ; le gain d'étape apparaît au-dessus en `+ 8 412` puis se fond.
- Placement : haut-gauche (desktop), intégré au-dessus de la `CampBar` (mobile).

### 6.6 Chronomètre (`ExpeditionClock`)
- **Rôle** : temps écoulé (expédition standard, non punitif) / temps restant (mode Sprint).
- **Forme** : petit **cadran solaire** circulaire 40 px : l'ombre du gnomon tourne. En Sprint, l'arc restant se vide et passe au vermillon sous 10 s (avec un tic sonore optionnel).
- Le texte exact (`mm:ss`) est disponible au survol / lecteur d'écran.

### 6.7 Carnet de route (`LegLog`)
- **Rôle** : liste des étapes : n°, consigne courte, pays, km, tampon.
- Desktop : colonne gauche repliable 280 px, papier ligné (lignes `sea-200` 1 px tous les 24 px). Mobile : feuille basse (*bottom sheet*) à 3 crans (fermé / 40 % / 90 %) avec onglet en forme de marque-page.

### 6.8 Tampon (`Stamp`)
- 4 formes (§2.1) × encre ; contenu : code ISO3 en petites capitales + date + nom du palier.
- Animation d'obtention : descend de 120 % à 100 % en 140 ms (ease `stamp`), micro-secousse de l'écran 2 px, rotation finale seedée, **retour haptique** léger, bruit sec de tampon.
- « Encre fraîche » (provisoire) : bord légèrement baveux + brillance humide (dégradé spéculaire 6 %) ; « encre sèche » (figé, 24 h après la partie) : mat. Transition jouée à la première ouverture du passeport ou de l'accueil après le séchage (regroupée si plusieurs tampons ont séché).

### 6.9 Passeport (`PassportBook`)
- Livre à double page ; une page = un pays : silhouette du pays gravée (trait seul) + 4 emplacements de tampon en filigrane.
- Navigation : feuilletage horizontal (geste), index alphabétique et par continent ; tourner la page = 280 ms, pas de courbure 3D excessive.

### 6.10 Récapitulatif (`ExpeditionSummary`)
- Globe orthographique plein écran qui tourne lentement le long de la route ; panneau inférieur : distance totale (`type-display`), 6 tampons alignés, ordres de mission (sceaux), méridien franchi.
- CTA : **« Envoyer la carte postale »** (partage) ; secondaire : « Ouvrir le passeport ».

### 6.11 Carte postale de partage (`ShareCard`)
- 1080 × 1350 : recto façon carte postale ancienne — atlas Equal Earth centré sur la route, timbre en haut à droite (le tampon le plus rare de l'expédition), oblitération ronde « MERIDIAN · MER-7KQ2 · 28 OCT 2026 » (date de la partie), QR discret du lien de défi en option, distance en Plex Mono, 6 mini-tampons. Aucune donnée personnelle par défaut.

### 6.12 Recherche de pays (`CountrySearch`)
- Combobox accessible façon **registre** : liste en Garamond, initiales en petites capitales, sélection = vol de caméra. Raccourci `/` sur desktop.

### 6.13 Ordres de mission (`MissionOrders`)
- Enveloppe cachetée (sceau doré) ; ouverte = liste de 1–3 ordres avec case à cocher dessinée à la plume ; ordre accompli = sceau de cire doré qui se pose.

### 6.14 Notes marginales (`MarginNote`) — remplace les toasts
- Petite note manuscrite (Fraunces italique 15, `sepia-600`) qui apparaît dans la marge avec un trait de flèche à la plume vers l'élément concerné. Ex. « Fausse piste : le Népal n'a pas de littoral… mais il est enclavé ! » Durée 3,5 s, jamais plus d'une à la fois.

### 6.15 Accueil / lanceur d'expédition (`ExpeditionLauncher`)
- **Rôle** : choisir quoi jouer, sans quitter la carte. L'accueil **est** l'atlas personnel (planisphère encré) ; le lanceur est un cartouche dans la marge.
- **Anatomie** : bouton principal **« Nouvelle expédition »** (sceau vermillon) + sélecteur de difficulté en trois crans gravés (Facile / Normal / Expert) ; lien **« Carnet d'expéditions »** (catalogue) ; champ **« J'ai un code »** (Plex Mono, format `MER-XXXX`, validation à la frappe) ; défis reçus en attente (enveloppes cachetées, max 3 visibles).
- **Carnet d'expéditions** : liste façon table des matières d'atlas — numéro en Plex Mono, titre en Fraunces, thème en petites capitales, mini-carte de la région, état (non jouée / tampon le plus rare obtenu).
- **Mobile** : feuille basse à 2 crans ; la carte reste visible au-dessus.

### 6.16 Lien et écran de défi (`ChallengeCard`)
- Quand on ouvre un lien de défi : cartouche « *Ana* te défie · MER-7KQ2 · 31 480 km » + bouton « Relever le défi ». La route de l'ami **n'est jamais montrée avant** que le joueur ait planté le camp correspondant.
- Au récapitulatif : les deux routes superposées (vermillon pour le joueur, `ink-700` en tirets pour l'ami), comparaison étape par étape en tableau compact.

---

## 7. Espacement, grille, formes

- **Unité de base 4 px** ; échelle : 4, 8, 12, 16, 24, 32, 48, 64.
- **Marges de chrome** : 16 px mobile, 24 px tablette, 32 px desktop, + `safe-area-inset`.
- **Rayon** : 2 px (papier coupé) par défaut, 0 px pour cartouches et passeport, cercle pour sceaux et instruments. **Pas de boutons pilule.**
- **Filets** : 1 px pour séparateurs, double filet (1 + 0,5, écart 2 px) pour encadrer.
- **Densité** : jamais plus de 3 éléments de chrome visibles simultanément sur mobile pendant une étape (cartouche, barre de camp, odomètre). Tout le reste dans le carnet de route.
- **Points de rupture** : `sm` < 600 px (portrait, sheet), `md` 600–1024 (cartouche + carnet flottant), `lg` > 1024 (carnet en colonne, carte élargie).

---

## 8. Mouvement

| Token | Valeur | Usage |
|---|---|---|
| `ease-ink` | `cubic-bezier(.22,.7,.18,1)` | tracés, apparitions de papier |
| `ease-stamp` | `cubic-bezier(.5,0,.75,0)` puis arrêt sec | descente du tampon |
| `ease-camera` | interpolation de van Wijk (d3) | vols de caméra |
| `dur-quick` | 140 ms | survols, pressions |
| `dur-paper` | 320 ms | dépliage des cartouches, sheets |
| `dur-ink` | 600 ms | lavis de pays, encre qui sèche |
| `dur-route` | 900–1600 ms (proportionnel à la distance, plafonné) | tracé d'étape |
| `dur-flight` | 1200–1800 ms | changement d'étape |

Règles :
- **Séquence de résolution d'une étape** (chorégraphie de référence) : sceau pressé (140) → caméra recadre départ+arrivée (600) → route tracée + odomètre (≤ 1600) → lavis du pays (600, chevauché) → tampon (140 + 200 repos) → cartouche se replie (320) → vol vers la prochaine consigne. **Total ≤ 3,5 s, entièrement passable par tap.**
- Aucun rebond élastique, aucune particule colorée, aucun confetti.
- `prefers-reduced-motion` : tracés instantanés, pas de vols de caméra (coupe directe + fondu 120 ms), pas de secousse, tampons en fondu.

---

## 9. Son et haptique (brève)
Palette sonore « bureau d'expédition » : froissement de papier, plume, sceau de cire, tampon, rouleaux d'odomètre. Volume bas, désactivé par défaut sur mobile si le téléphone est en silencieux, réglage dédié. Haptique : uniquement à la pose du camp et au tampon.

---

## 10. Accessibilité (exigences)

- Contraste texte ≥ 4,5:1 (≥ 3:1 pour les grands titres et les éléments graphiques porteurs de sens).
- **Jamais la couleur seule** : rareté = encre + forme + libellé ; fausse piste = hachure + icône + texte.
- Mode daltonien : palette alternative de tampons (sépia / orange / bleu / noir) en plus des formes.
- Cibles tactiles ≥ 44 px ; loupe pour la précision ; recherche textuelle comme alternative complète au pointage.
- Focus visible : anneau 2 px `vermilion-600` décalé de 2 px ; sur la carte, le pays focalisé reçoit le style « sélection provisoire ».
- Taille de texte : respecte le zoom navigateur jusqu'à 200 % sans casser la carte (le chrome passe en sheet).
- Lecteurs d'écran : la consigne, la sélection et le résultat sont annoncés (`aria-live="polite"`) ; la carte expose un résumé textuel (« Camp 3 : Bolivie, 8 412 km depuis le camp précédent »).
- Option « Lecture facilitée » (sans-serif partout) et « Matière allégée » (sans grain ni textures).

---

## 11. Ce qu'il ne faut jamais faire

1. ❌ **Projection de Mercator** ou tuiles de carte routière (OSM/Google) dans l'écran de jeu.
2. ❌ **Épingle en goutte** de type Google Maps ou marqueur Leaflet par défaut.
3. ❌ Glassmorphism, néon, dégradés brillants, ombres grises dures, fond `#000` ou `#FFF` purs.
4. ❌ Boutons pilule colorés, coins arrondis > 4 px sur les panneaux, cartes UI « flottantes » génériques type dashboard.
5. ❌ Emoji dans le chrome de l'interface (autorisés seulement dans le texte de partage).
6. ❌ Confettis, étoiles qui jaillissent, écrans « WIN! », mascottes.
7. ❌ Pastiche « parchemin de pirate » : taches de café, brûlures, dragons, police gothique, papier déchiré partout.
8. ❌ Panneaux qui couvrent plus de 30 % de la carte pendant une étape (sauf feuille du carnet ouverte volontairement).
9. ❌ Utiliser le vermillon, l'or ou une encre de rareté pour un autre sens que le leur.
10. ❌ Afficher le nom ou la couleur d'un pays d'une façon qui révèle la réponse avant que le joueur l'ait choisie.
11. ❌ Polices hors des quatre familles définies ; texte en capitales pleines en sans-serif.
12. ❌ Animations > 2 s non interruptibles.

---

## 12. Tokens (extrait, source de `packages/design-tokens`)

```json
{
  "color": {
    "paper": { "100": "#F7F1E5", "200": "#F1E8D6", "300": "#E6D9BF", "400": "#D6C5A3" },
    "sea":   { "100": "#DCE5E0", "200": "#C3D3CE", "300": "#9DB5AF" },
    "ink":   { "900": "#24232B", "700": "#45434F", "500": "#6B6763" },
    "sepia": { "600": "#6A513B" },
    "vermilion": { "600": "#B5452B", "700": "#93361F" },
    "meridian":  { "500": "#A27624" },
    "rarity": { "known": "#7A5C3E", "trail": "#2F7A6B", "frontier": "#2C4A9A", "incognita": "#8E1F3A" }
  },
  "font": {
    "display": "Fraunces, 'Iowan Old Style', Georgia, serif",
    "map": "'EB Garamond', Garamond, serif",
    "ui": "'Instrument Sans', system-ui, sans-serif",
    "mono": "'IBM Plex Mono', ui-monospace, monospace"
  },
  "space": [0, 4, 8, 12, 16, 24, 32, 48, 64],
  "radius": { "paper": "2px", "none": "0", "seal": "50%" },
  "motion": {
    "ease": { "ink": "cubic-bezier(.22,.7,.18,1)", "stamp": "cubic-bezier(.5,0,.75,0)" },
    "duration": { "quick": 140, "paper": 320, "ink": 600, "routeMax": 1600, "flight": 1500 }
  },
  "map": {
    "coast": { "width": 0.9, "echoWidth": 0.4, "echoOffset": 1 },
    "waterLines": { "offsets": [2, 5, 9], "opacity": [0.6, 0.35, 0.18], "width": 0.6 },
    "graticuleStepDeg": 15,
    "border": { "width": 0.6, "dash": [3, 1.5], "disputedDash": [1, 2] },
    "route": { "width": 2, "pastWidth": 1.5, "tickEveryKm": 500 }
  }
}
```
