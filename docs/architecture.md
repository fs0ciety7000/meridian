# Meridian — Architecture technique

> **Auteur :** Tech Lead (`.claude/agents/tech-lead.md`)
> **Relecteurs :** Art Director (contraintes de rendu), Systems Designer (moteur de jeu)
> **Statut :** v0.2 — révisée après retours : auto-hébergement Coolify/Docker, pas de Supabase, jeu à la demande (pas de daily), évaluation d'OpenMapTiles
> **Nom de code du jeu :** *Meridian* — un atlas d'expédition

Ce document fixe la stack, la structure du projet, la façon dont la carte est rendue et manipulée, et le déploiement. Il est volontairement écrit **avant** l'implémentation pour que tu puisses aller chercher des skills/bibliothèques existants (section 9).

### Journal des révisions
| Version | Changement |
|---|---|
| v0.1 | Proposition initiale (Supabase, Cloudflare Pages, daily) |
| v0.2 | **Déploiement Docker sur Coolify** (`coolify.fs0ciety.org`), domaine `*.cardormedia.com` via Cloudflare ; **backend Node + Hono + SQLite** (PocketBase en alternative) ; **jeu à la demande** : expéditions identifiées par un code, rareté par consigne ; **OpenMapTiles évalué** (§2.2) |

---

## 0. Hypothèses de jeu qui contraignent l'architecture

1. **On joue quand on veut.** Une expédition = un port de départ + 6 étapes (« legs »), chacune avec une consigne. Elle est identifiée par un **code** (`MER-7KQ2`) : soit issue d'un **catalogue** d'expéditions écrites à la main, soit **générée à la demande** à partir d'une graine. Même code ⇒ même expédition pour tout le monde (partage, défis).
2. **On répond en plantant un camp sur la carte** : n'importe où dans un pays qui satisfait la consigne. Distance d'étape = distance orthodromique entre deux camps. → **la carte est le contrôleur principal**.
3. **Rareté par consigne** : proportion des joueurs ayant choisi tel pays pour telle consigne, toutes expéditions confondues (les consignes sont réutilisées d'une expédition à l'autre). Amorcée par une estimation hors-ligne.
4. **Collection persistante** : passeport de tampons, atlas personnel qui s'encre.
5. **Mobile d'abord.**

Conséquences techniques :
- **Hit-testing géographique précis**, y compris micro-États et îles.
- **Contrôle total du style cartographique** — c'est l'identité du jeu.
- **Moteur de règles isomorphe** (navigateur + serveur Node) pour recalculer les scores côté serveur.
- **Générateur d'expéditions déterministe** partagé client/serveur (même graine ⇒ même expédition).

---

## 1. Stack recommandée (résumé)

| Couche | Choix | Alternatives écartées |
|---|---|---|
| Langage | **TypeScript strict** partout (front, back, outils) | — |
| Build / dev | **Vite 6** | Next.js (SSR inutile pour un jeu client) |
| UI | **React 19** | Svelte 5 (écosystème de skills plus mince), Solid |
| Carte | **d3-geo + d3-geo-projection + d3-zoom**, rendu **Canvas 2D** (fond) + **SVG** (couche interactive) | MapLibre GL + OpenMapTiles (§2.2), Leaflet, deck.gl, Phaser/Pixi |
| Données géo | **Natural Earth** (domaine public) → **TopoJSON** via **mapshaper** | OpenMapTiles/OSM (§2.2), GADM (licence restrictive) |
| Moteur de jeu | **Package TS pur** (`packages/engine`) : reducer déterministe + générateur d'expéditions seedé | XState (option) |
| État UI | **Zustand** | Redux Toolkit, Jotai |
| Animation | **Motion** pour l'UI ; animations de carte en code (rAF) | GSAP |
| Styles | **CSS Modules + variables CSS (tokens)** générées depuis le design system | Tailwind |
| Persistance locale | **IndexedDB via Dexie** + `localStorage` (préférences) | — |
| **Backend** | **Node 22 + Hono + SQLite** (better-sqlite3, **Drizzle ORM**), un seul conteneur | **PocketBase** (alternative sérieuse, §2.4), Supabase (écarté), Postgres (surdimensionné au départ) |
| Sauvegarde BDD | **Litestream** → stockage S3-compatible (**Cloudflare R2**) | sauvegardes manuelles de volume |
| **Déploiement** | **Docker** (image unique multi-stage) sur **Coolify** (`coolify.fs0ciety.org`) | Cloudflare Pages / Vercel (écartés) |
| DNS / CDN | **Cloudflare** (proxy, cache, Brotli, TLS) sur un sous-domaine de `cardormedia.com` | — |
| Mobile | **PWA** installable + hors-ligne (vite-plugin-pwa / Workbox) ; **Capacitor** en phase 6 | React Native |
| i18n | `Intl.DisplayNames` (noms de pays, zéro donnée) + **i18next** ; FR + EN dès le MVP | — |
| Tests | **Vitest**, **Playwright** (E2E + régression visuelle) | Cypress |
| Qualité | ESLint + Prettier + `eslint-plugin-boundaries` | — |
| Monorepo | **pnpm workspaces** | Nx |

---

## 2. Justification des choix structurants

### 2.1 Pourquoi d3-geo + Canvas/SVG

C'est la décision la plus importante du projet. Le cahier des charges impose un rendu **« atlas / document cartographique »** :

| Besoin | d3-geo (Canvas/SVG) | MapLibre GL (+ tuiles vectorielles) | Leaflet |
|---|---|---|---|
| Projections d'atlas (Equal Earth, Natural Earth, Winkel Tripel) | ✅ natif | ❌ Mercator + globe uniquement | ❌ Mercator |
| Style « encre et papier » (hachures, côtes doublées, *water lines*, grain) | ✅ contrôle pixel total | ⚠️ limité au langage de style | ⚠️ médiocre |
| Vue monde entière lisible sur mobile | ✅ | ⚠️ Mercator exagère les pôles | ⚠️ |
| Zoom profond (rue) | ❌ inutile pour nous | ✅ | ✅ |
| Poids client | ~40 Ko gz | ~220 Ko gz + tuiles | ~45 Ko gz + tuiles |
| Hors-ligne | ✅ un fichier TopoJSON | ⚠️ tuiles à embarquer | ⚠️ |
| Infra | ✅ fichiers statiques | ⚠️ serveur ou archive de tuiles | ⚠️ |

Le jeu n'a **jamais** besoin d'aller au niveau d'une rue : le zoom utile va du monde entier à un archipel (≈ ×1 à ×40). **d3-geo nous donne l'identité visuelle ; c'est le différenciateur.**

### 2.2 OpenMapTiles : bonne idée ? — **Pas pour le cœur du jeu ; éventuellement plus tard, sous une autre forme**

[OpenMapTiles](https://openmaptiles.org) est un **schéma + une chaîne de production de tuiles vectorielles** à partir d'OpenStreetMap, conçu pour être affiché par **MapLibre GL** (ou Mapbox GL). C'est un excellent projet, mais il répond à un besoin que Meridian n'a pas.

| Critère | Constat pour Meridian |
|---|---|
| **Niveau de détail** | Pensé pour les rues, bâtiments, POI. Nous avons besoin de ~200 polygones de pays du monde entier à ×1–×40. Aux bas niveaux de zoom, OpenMapTiles s'appuie d'ailleurs largement sur **Natural Earth** — la source que nous utilisons déjà directement. |
| **Projection** | Tuiles Web Mercator (affichage Mercator ou globe dans MapLibre). Incompatible avec l'esthétique d'atlas (Equal Earth) et avec notre design system (« jamais de Mercator »). |
| **Style** | Le style passe par la *style spec* MapLibre : pas de hachures procédurales, *water lines* ni effets d'encre au niveau voulu. |
| **Hit-testing** | Les tuiles sont découpées et simplifiées par zoom : la validation précise « ce point est-il en Gambie ? » serait moins fiable que `geoContains` sur notre géométrie maîtrisée. |
| **Frontières** | Les frontières OSM suivent la politique OSM (« ligne de contrôle sur le terrain »). Nous voulons maîtriser **notre** politique géo (pointillés, zones non plantables). |
| **Infra / coût** | Générer soi-même : PostGIS + import OSM, gourmand (heures à jours pour la planète). Télécharger des tuiles prêtes : via MapTiler, sous conditions de licence. Servir : `tileserver-gl` ou équivalent = un service de plus sur Coolify. |
| **Licence** | Données OSM sous **ODbL** + attribution « © OpenMapTiles © OpenStreetMap contributors » obligatoire à l'écran. Natural Earth est dans le domaine public, sans attribution imposée. |
| **Poids** | MapLibre ≈ 220 Ko gz + tuiles, contre ≈ 40 Ko + 60 Ko de TopoJSON aujourd'hui. Notre budget JS initial (180 Ko) serait dépassé à lui seul. |

**Décision :** pas d'OpenMapTiles pour l'écran de jeu, le passeport ou l'atlas.

**Usage futur pertinent** : un éventuel mode **« Carnet de terrain »** (v2+) où l'on zoome jusqu'au paysage réel autour de ses camps. Dans ce cas, je recommanderais plutôt **MapLibre + [Protomaps](https://protomaps.com) (format PMTiles)** : une seule archive de tuiles servie en statique par requêtes HTTP Range, sans serveur de tuiles, hébergeable sur Coolify ou Cloudflare R2. On peut l'utiliser avec le schéma OpenMapTiles ou celui de Protomaps, et habiller le style en « atlas » dans la mesure du possible. C'est un **point d'extension** (§9), pas une dépendance du MVP.

### 2.3 Pourquoi Canvas **et** SVG
- **Canvas 2D** : terres, mers, côtes, frontières, hachures, graticule, textures — massif et statique pendant un geste. ~250 polygones re-projetés : 60 fps sur mobile milieu de gamme en 110m, 50m au-delà d'un seuil de zoom.
- **SVG** : épingles (camps), route, étiquettes, focus clavier — peu nombreux, interactifs, accessibles (`aria-*`), nets en haute densité.
- **Pick buffer** (Canvas hors écran, couleur = index pays) : identification O(1) sous le doigt pour le survol ; **validation finale** par `geoContains` sur la géométrie précise (§4.4).

Phaser/Pixi ne sont pas nécessaires (pas de sprites nombreux ni de physique). Pixi reste un point d'extension pour des effets d'encre/particules.

### 2.4 Backend : Hono + SQLite (recommandé) vs PocketBase

Le backend fait peu de choses : (1) recevoir les expéditions terminées et les **rejouer avec `packages/engine`** pour valider le score, (2) agréger la rareté par consigne, (3) servir le catalogue et les classements par expédition, (4) synchroniser le profil (optionnel).

| Critère | **Node + Hono + SQLite** | **PocketBase** |
|---|---|---|
| Rejouer le moteur TS côté serveur | ✅ import direct de `packages/engine` (même code, mêmes tests) | ⚠️ logique serveur en Go ou en JS via `pb_hooks` (moteur goja, pas Node) : il faut bundler le moteur en CommonJS et vérifier la compatibilité → **spike obligatoire** |
| Un seul langage / un seul monorepo | ✅ | ⚠️ Go ou JS « goja » |
| Auth | à écrire : **jeton d'appareil anonyme** (UUID + JWT signé) ; e-mail/passkey plus tard | ✅ e-mail, OAuth2 intégrés ; ❌ pas d'auth anonyme native (contournement : comptes invités générés) |
| Interface d'admin | ❌ (contenu dans git + script CLI, suffisant) | ✅ très confortable |
| Temps réel | inutile pour le MVP | ✅ inclus |
| Déploiement Coolify | ✅ dans la même image que le front | ✅ service en un clic dans Coolify, mais un conteneur de plus |
| Sauvegarde | Litestream → R2 | Sauvegardes intégrées + Litestream possible |
| Migrations | Drizzle (TS, versionnées dans git) | migrations JS PocketBase |

**Recommandation : Node + Hono + SQLite.** Le critère décisif est la **validation serveur par le même moteur TypeScript** : c'est ce qui garantit l'intégrité des classements par expédition, sans maintenir deux implémentations. Le contenu (faits, consignes, catalogue) vit dans git, donc l'admin de PocketBase apporte peu.

**Si tu préfères PocketBase** (admin, auth e-mail/OAuth clé en main) : c'est viable. La phase 0 inclut alors un **spike d'une demi-journée**, avec un critère simple : « `packages/engine` bundlé avec esbuild s'exécute dans `pb_hooks` et rejoue 1 000 runs à l'identique de Node ». En cas d'échec, on revient à Hono.

SQLite suffit largement : écritures rares (une par expédition terminée), lectures agrégées et mises en cache. Mode WAL, un seul processus d'écriture. Passage à Postgres seulement si besoin de plusieurs instances.

### 2.5 Pourquoi React + Zustand + moteur pur
- **React** : écosystème, skills et agents existants ; la carte **n'est pas** rendue par React (composant hôte + API impérative).
- **Moteur pur** : `reduce(state, action) → { state, events }` et `generateExpedition(seed, library) → Expedition`, déterministes, sans DOM ni horloge, exécutés **à l'identique dans le navigateur et dans le serveur Node**.
- **Zustand** : état du moteur + état UI (caméra, panneaux), sélecteurs fins.

---

## 3. Structure du projet

```
meridian/
├── apps/
│   ├── web/                         # PWA React (Vite)
│   │   ├── public/{geo,textures,fonts}/
│   │   └── src/
│   │       ├── app/                 # routes, providers, bootstrap, PWA
│   │       ├── map/                 # ⟵ cœur cartographique (voir §4)
│   │       │   ├── AtlasMap.tsx, projection.ts, camera.ts, picking.ts, lod.ts
│   │       │   ├── layers/          # paper, ocean, land, borders, graticule, hatching, labels
│   │       │   └── overlays/        # camps, route, méridien, loupe
│   │       ├── ui/                  # composants du design system
│   │       ├── features/
│   │       │   ├── expedition/      # écran de jeu
│   │       │   ├── catalog/         # carnet d'expéditions + nouvelle expédition + saisie de code
│   │       │   ├── passport/  atlas/  share/
│   │       ├── store/  persistence/  services/  i18n/  styles/
│   └── server/                      # API Node + Hono (sert aussi le front buildé)
│       ├── src/
│       │   ├── routes/              # /api/expeditions, /api/runs, /api/rarity, /api/players
│       │   ├── db/                  # schéma Drizzle, migrations, accès
│       │   ├── jobs/                # recalcul des instantanés de rareté
│       │   └── auth/                # jetons d'appareil (JWT)
│       └── drizzle/                 # migrations SQL générées
├── packages/
│   ├── engine/                      # règles, score, rareté, objectifs, générateur — TS pur, isomorphe
│   ├── geo/                         # utilitaires géo partagés
│   ├── content-schema/              # schémas Zod + contrat d'API
│   └── design-tokens/               # tokens JSON → CSS vars / TS
├── content/
│   ├── countries/  prompts/
│   └── expeditions/                 # catalogue : 0001.json, 0002.json…
├── tools/
│   ├── geo-pipeline/  prompt-forge/  rarity-bootstrap/
├── deploy/
│   ├── Dockerfile                   # multi-stage : build web + server → image runtime
│   ├── docker-compose.yml           # dev local + référence Coolify (app + litestream)
│   └── litestream.yml
├── docs/
└── .claude/{agents,skills}/
```

**Règles de frontière** (`eslint-plugin-boundaries`) :
- `packages/engine` n'importe que `packages/geo` et `packages/content-schema`.
- `apps/web/src/map` n'importe pas `features/`.
- `apps/server` importe `packages/*`, jamais `apps/web`.
- `tools/` n'est jamais importé par les apps.

---

## 4. Gestion de la carte

### 4.1 Données

| Jeu | Source | Usage | Poids cible (gz) |
|---|---|---|---|
| `world-110m.topo.json` | Natural Earth 1:110m admin-0 | vue monde, zoom < ×3 | ≈ 60 Ko |
| `world-50m.topo.json` | Natural Earth 1:50m admin-0 | zoom ≥ ×3, **validation des réponses** | ≈ 250 Ko (différé) |
| `micro-10m.topo.json` | Natural Earth 1:10m filtré (pays < 2 000 km², petites îles) | micro-États, archipels | ≈ 40 Ko |
| `countries.json` | `content/countries` | faits, ISO, continents, voisins, centroïdes, point de visée | ≈ 30 Ko |

Pipeline (`tools/geo-pipeline`, Node, en CI) : téléchargement Natural Earth (version figée + checksum) → politique de frontières (`data-model.md` §2.3) → `mapshaper -simplify` topologique → TopoJSON → métadonnées (centroïde, *pole of inaccessibility* via `polylabel`, bbox, voisins, surface, îles) → `geo-manifest.json` hashé (cache immuable).

### 4.2 Projection
- **Equal Earth** par défaut ; **Natural Earth I / Winkel Tripel** en option « atlas ancien ».
- **Rotation λ** animée pour centrer l'expédition (route Pacifique) ; antiméridien géré par d3.
- **Globe orthographique** au récapitulatif.

### 4.3 Caméra : zoom / pan
- **d3-zoom** : molette, pinch, double-tap, drag, inertie ; échelle ×1 → ×40, translation bornée.
- Pendant le geste : transformation appliquée au Canvas (`ctx.setTransform`) et au groupe SVG, **sans re-projection** ; re-projection + LOD après le geste (debounce ~120 ms).
- `camera.flyTo(bbox | country | point)` : interpolation de van Wijk (`d3.interpolateZoom`).
- Mobile : un doigt = pan, deux doigts = zoom, **appui long = loupe**, tap = sélection provisoire.

### 4.4 Pays cliquables et validation
1. **Survol / tap provisoire** : pick buffer → surbrillance instantanée.
2. **Tolérance tactile** : point en mer → pays le plus proche dans un rayon de 12 px écran, *snap* sur la côte ; **halo de touche** de 22 px pour les micro-États.
3. **Validation définitive** : `d3.geoContains` sur la géométrie 50m (10m pour micro-États) avec `projection.invert`. Seul ce résultat part au moteur.

Accessibilité : **recherche de pays** (combobox ARIA) → vol de caméra + épingle au point de visée, déplaçable au clavier (flèches ±0,5°, Maj ±5°).

### 4.5 Épingles, route, loupe
- **Camp** (SVG, ancré lon/lat) : `provisional` → `planted` → `invalid` → `historic`.
- **Route** : arcs de grand cercle (`d3.geoInterpolate`, 64 pts/étape) ; animation « tracé à l'encre » synchronisée à l'odomètre.
- **Loupe d'arpenteur** : appui long → Canvas circulaire ×4 au-dessus du doigt avec réticule.
- **Méridien de l'expédition** : `LineString` de longitude mise en exergue.

### 4.6 Rendu des matières
- **Papier** : texture tuilée AVIF ≤ 80 Ko en CSS sous le Canvas, `multiply` ; vignettage CSS.
- **Encre** : côtes dessinées deux fois ; *water lines* pré-calculées dans un Canvas hors écran par LOD et recomposées pendant le geste.
- **Relief** (optionnel) : ombrage pré-rendu reprojeté une fois par rotation, mis en cache.
- **Budget** : 16 ms/frame pendant un geste (Pixel 6a / iPhone 12) ; couches trop coûteuses gelées en bitmap.

### 4.7 API du composant carte
```ts
<AtlasMap
  projection="equalEarth"
  camps={Camp[]}  route={RouteLeg[]}
  highlight={{ iso3?: string; region?: ContinentCode }}
  revealedCountries={Set<ISO3>}
  mode="play" | "review" | "atlas"
  onProvisionalPick={(pick: GeoPick) => void}
  onConfirmPick={(pick: GeoPick) => void}
  ref={mapApi}     // flyTo, rotateTo, fitRoute, snapshot(): Promise<Blob>
/>
```

---

## 5. Expéditions, graines et contenu (jeu à la demande)

### 5.1 Deux sources d'expéditions, un seul format
| Source | Identifiant | Production | Usage |
|---|---|---|---|
| **Catalogue** (« Carnet d'expéditions ») | `MER-0001`, `MER-0002`… | écrites et validées à la main (`content/expeditions/0001.json`) | expéditions soignées, thématiques, classements publics |
| **Générées** (« Nouvelle expédition ») | `MER-7KQ2` (graine encodée en base 32 Crockford, 4 à 6 caractères + difficulté) | `generateExpedition(seed, difficulty, promptLibrary)` dans `packages/engine` | jeu illimité, défis entre amis |

Les deux produisent le même objet `Expedition`. Le **code** suffit à reconstruire l'expédition à l'identique, sur n'importe quel appareil, hors-ligne compris (le générateur et la bibliothèque de consignes sont embarqués).

### 5.2 Générateur
- PRNG seedé (mulberry32) **dans le moteur**.
- Tire un port (liste de ~120 ports), un méridien (multiple de 5), 6 consignes respectant les contraintes de diversité (§ gameplay-systems) et 1 à 3 ordres de mission atteignables.
- Les contraintes sont vérifiées **au moment de la génération** (rejet + nouvelle graine dérivée, déterministe) ; la bibliothèque de consignes est elle-même validée en CI.
- La bibliothèque est versionnée (`libraryVersion`), incluse dans le code d'expédition : une ancienne graine reste rejouable à l'identique.

### 5.3 Validation du contenu en CI (`tools/prompt-forge validate`)
Chaque consigne : 8–60 réponses valides, ≥ 3 continents (sauf consigne régionale), faits sourcés, aucun fait `territorySensitive`. Chaque expédition du catalogue : contraintes de diversité, ordres atteignables. Le générateur est testé sur 100 000 graines : 0 expédition invalide.

### 5.4 Distribution
Bibliothèque de consignes + catalogue embarqués dans l'app (≈ 50–100 Ko gz, mis en cache par le service worker) ; nouvelles entrées du catalogue récupérées via `/api/expeditions` (cache CDN).

---

## 6. Persistance, backend et synchronisation

### 6.1 Local (source de vérité du joueur)
- **Dexie** : `runs`, `stamps`, `passport`, `atlas`, `profile`, `outbox` (soumissions en attente de réseau).
- `localStorage` : préférences.

### 6.2 Serveur (Node + Hono + SQLite)
| Endpoint | Rôle | Cache |
|---|---|---|
| `POST /api/players` | crée un joueur anonyme, renvoie un jeton d'appareil (JWT signé) | non |
| `POST /api/runs` | soumet une expédition terminée ; le serveur **régénère/charge l'expédition, rejoue le run avec `packages/engine`**, refuse toute divergence, enregistre, incrémente les compteurs de rareté | non |
| `GET /api/rarity?prompts=…` | instantanés de rareté par consigne | `s-maxage=300` (Cloudflare) |
| `GET /api/expeditions` | catalogue (métadonnées) | `s-maxage=3600` |
| `GET /api/expeditions/:code/board` | classement d'une expédition (catalogue) ou d'un défi (amis) | `s-maxage=60` |
| `GET /api/health` | sonde Coolify | non |

- **Job interne** (`setInterval` / `croner`) : recalcul des instantanés de rareté toutes les 10 min.
- **Anti-abus** : limite de débit par jeton et par IP (en-tête `CF-Connecting-IP`), une seule contribution aux statistiques de rareté par (joueur, consigne).

### 6.3 Flux d'une partie
```
Choisir/générer une expédition (hors-ligne OK) → jouer (engine local, rareté = dernier instantané en cache ou estimation)
  → fin → POST /api/runs (ou outbox si hors-ligne) → GET rarity → tampons « encre fraîche »
  → 24 h plus tard : tampons « encre sèche » (palier figé, voir gameplay-systems §6.4)
```

---

## 7. Déploiement : Docker + Coolify + Cloudflare

### 7.1 Image
`deploy/Dockerfile`, multi-stage :
1. `node:22-alpine` + pnpm : `pnpm install --frozen-lockfile`, build `packages/*`, `apps/web` (Vite → `dist/`), `apps/server` (esbuild → `server.mjs`).
2. Runtime `node:22-alpine` : `server.mjs` + `web/dist` + migrations ; utilisateur non-root ; `HEALTHCHECK` sur `/api/health`.

Le serveur Hono sert `/api/*` **et** les fichiers statiques du front (en-têtes de cache appropriés, voir 7.4). **Un seul conteneur applicatif** : simple à opérer sur Coolify.

### 7.2 Coolify (`coolify.fs0ciety.org`)
- Ressource **Docker Compose** (ou Dockerfile) branchée sur le dépôt GitHub, déploiement automatique sur `main` (webhook / GitHub App Coolify). Les tests tournent dans GitHub Actions ; Coolify ne fait que construire et déployer.
- **Volume persistant** `/data` → `meridian.db` (SQLite, WAL).
- **Sidecar Litestream** (même compose) : réplication continue de `meridian.db` vers un bucket **Cloudflare R2** ; restauration automatique au démarrage si la base est absente.
- Variables (secrets Coolify) : `JWT_SECRET`, `DATABASE_PATH=/data/meridian.db`, `PUBLIC_ORIGIN`, `R2_*` (Litestream).
- Environnement de recette : second service Coolify sur une branche `staging` (sous-domaine distinct).

### 7.3 Cloudflare (`cardormedia.com`)
- Sous-domaine (**à confirmer**, proposition : `meridian.cardormedia.com`, et `meridian-staging.cardormedia.com`) : enregistrement A/AAAA vers le serveur Coolify, **proxifié** (nuage orange).
- **SSL/TLS « Full (strict) »**. Certificat d'origine au choix : Let's Encrypt émis par Traefik/Coolify via **challenge DNS-01 Cloudflare** (jeton API limité à la zone), ou **Cloudflare Origin Certificate** installé dans Coolify. Le challenge HTTP-01 derrière le proxy est fragile : à éviter.
- Option : n'accepter sur le serveur que les IP Cloudflare (pare-feu) pour ne pas exposer l'origine.

### 7.4 Règles de cache
| Chemin | Règle |
|---|---|
| `/assets/*`, `/geo/*`, `/fonts/*`, `/textures/*` (noms hashés) | `Cache-Control: public, max-age=31536000, immutable` → mis en cache par Cloudflare |
| `/index.html`, `/sw.js`, `/manifest.webmanifest` | `no-cache` (sinon les mises à jour de la PWA restent bloquées) |
| `/api/rarity`, `/api/expeditions*` | `s-maxage` court (cache edge), `max-age=0` navigateur |
| `/api/*` (le reste) | `no-store`, contourner le cache |
Désactiver **Rocket Loader** (casse les modules ES). Brotli géré par Cloudflare.

---

## 8. Mobile, performance, accessibilité (exigences techniques)
- **PWA** : manifest, service worker (Workbox), cache-first pour géo/polices/textures/bibliothèque de consignes, network-first pour la rareté ; **jeu entièrement hors-ligne** (génération + engine locaux).
- **Budgets** : JS initial ≤ 180 Ko gz ; géo initiale ≤ 80 Ko gz ; LCP ≤ 2,0 s en 4G ; 60 fps pendant les gestes.
- `100dvh`, *safe areas*, pas de pull-to-refresh pendant les gestes.
- Accessibilité : recherche de pays, clavier complet, `aria-live`, `prefers-reduced-motion`, contrastes AA.
- **Capacitor (phase 6)** : même build web, plugins Haptics et Share.

---

## 9. Points d'extension — skills et bibliothèques à importer

Les skills marqués ✅ existent à ma connaissance ; les autres sont des pistes de recherche.

| Domaine | Bibliothèques | Skills / outils à importer ou chercher |
|---|---|---|
| Carte vectorielle d3 | `d3-geo`, `d3-geo-projection`, `d3-zoom`, `topojson-client`, `polylabel` | Chercher « d3 / data visualization » ; ✅ `dataviz` (disponible dans cette session) pour couleurs/légendes |
| Pipeline géo | `mapshaper`, `@turf/turf`, `world-atlas` | Chercher « GIS / geospatial / mapshaper » |
| Tuiles (extension « Carnet de terrain ») | `maplibre-gl`, `pmtiles`, Protomaps basemaps (ou schéma OpenMapTiles) | Chercher « MapLibre », « PMTiles / Protomaps » |
| Effets 2D (extension) | `pixi.js` v8 | Chercher « PixiJS » |
| UI premium | `motion`, `@radix-ui/react-*`, `cmdk` | ✅ `frontend-design` (dépôt `anthropics/skills`) ; ✅ `design:design-system`, `design:accessibility-review`, `design:ux-copy` |
| Tokens | Style Dictionary | ✅ `theme-factory` (dépôt `anthropics/skills`) |
| Backend | `hono`, `@hono/node-server`, `drizzle-orm`, `better-sqlite3`, `jose` (JWT), `croner` | Chercher « Hono », « Drizzle », « SQLite » |
| Backend (alternative) | PocketBase | Chercher « PocketBase » |
| Déploiement | Docker, Coolify, Litestream, Cloudflare | Chercher « Dockerfile / Docker best practices », « Coolify », « Cloudflare » ; ✅ `engineering:deploy-checklist` |
| Tests | `vitest`, `@playwright/test`, `fast-check` | ✅ `webapp-testing` (dépôt `anthropics/skills`) ; ✅ `engineering:testing-strategy` |
| PWA | `vite-plugin-pwa`, `workbox` | Chercher « PWA / service worker » |
| État | `zustand` | — |
| Mobile natif (phase 6) | `@capacitor/*` | Chercher « Capacitor » |

Nos propres skills (`.claude/skills/`) : `architecture`, `map-interaction`, `design-system`, `gameplay-systems`, `data-model` — ils encodent nos conventions et complètent les skills génériques.

---

## 10. Risques et mitigations

| # | Risque | Mitigation |
|---|---|---|
| R1 | **Frontières contestées** | Politique écrite (`data-model.md` §2.3), pointillés, zones non plantables, jamais en consigne |
| R2 | Micro-États / îles au doigt | Loupe, halo, snap côtier, recherche textuelle |
| R3 | Perf des textures sur mobile | Couches gelées en bitmap, budgets en CI, mode « matière allégée » automatique |
| R4 | **Démarrage à froid de la rareté** | Prior (notoriété × réponses valides), mélange bayésien ; la rareté par consigne accumule vite les données car les consignes sont réutilisées |
| R5 | Erreurs factuelles | Faits sourcés, CI, bouton « signaler », neutralisation rétroactive d'une consigne |
| R6 | Proximité avec Farflung | Camp libre, passeport, atlas personnel, méridien, DA d'atlas, jeu à la demande |
| R7 | **Triche / farming de rareté** (rejouer une expédition connue) | Rejeu serveur ; une seule contribution aux stats par (joueur, consigne) ; une expédition déjà jouée se rejoue en « entraînement » (pas de tampon, pas de classement) ; classements par expédition sur la 1re tentative |
| R8 | **Serveur unique auto-hébergé** (panne, perte de données) | Le jeu fonctionne hors-ligne (outbox) ; Litestream → R2 ; sonde de santé Coolify ; restauration testée en phase 3 |
| R9 | Configuration TLS derrière Cloudflare | Full (strict) + DNS-01 ou Origin Certificate ; vérifié dans la checklist de déploiement |
| R10 | Cache CDN qui fige la PWA | Règles §7.4 ; `sw.js` et `index.html` jamais mis en cache |
| R11 | Poids des polices et textures | Sous-ensembles woff2, AVIF ≤ 80 Ko, préchargement ciblé |
| R12 | d3 impératif dans React | Carte encapsulée derrière une API impérative, tests visuels |
| R13 | Licences | Natural Earth (domaine public), polices OFL, inventaire `docs/licenses.md` ; si un jour OSM/OpenMapTiles : attribution ODbL |

---

## 11. Décisions ouvertes
1. **Hono + SQLite** (recommandé) **vs PocketBase**.
2. **Sous-domaine** exact sur `cardormedia.com` (proposition : `meridian.`).
3. **Projection par défaut** : Equal Earth vs Natural Earth I (tranchée par l'Art Director sur prototype).
4. **Monorepo pnpm** dès le départ (recommandé).
