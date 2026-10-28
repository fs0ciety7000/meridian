# Meridian — Architecture technique

> **Auteur :** Tech Lead (`.claude/agents/tech-lead.md`)
> **Relecteurs :** Art Director (contraintes de rendu), Systems Designer (moteur de jeu)
> **Statut :** v0.1 — proposition à valider avant toute implémentation
> **Nom de code du jeu :** *Meridian* — un atlas d'expédition quotidien

Ce document fixe la stack, la structure du projet et la façon dont la carte est rendue et manipulée. Il est volontairement écrit **avant** la vision détaillée et le design system pour que tu puisses aller chercher des skills/bibliothèques existants (section 8) avant l'implémentation.

---

## 0. Hypothèses de jeu qui contraignent l'architecture

L'architecture repose sur un petit nombre d'hypothèses de gameplay (détaillées dans `vision-and-innovations.md` et `gameplay-systems.md`) :

1. **Une expédition quotidienne** identique pour tous : un point de départ + 6 étapes (« legs »), chacune avec une consigne (« un pays enclavé », « un pays traversé par l'équateur »…).
2. **On répond en plantant un camp sur la carte** : le joueur place une épingle *n'importe où* dans un pays qui satisfait la consigne. La distance de l'étape = distance orthodromique (grand cercle) entre deux camps. → **la carte est le contrôleur principal**, pas un décor.
3. **Rareté** : chaque réponse est classée selon la proportion de joueurs ayant choisi le même pays pour la même consigne (amorcée par une estimation hors-ligne, puis dynamique).
4. **Collection persistante** : passeport de tampons par pays, atlas personnel qui « s'encre » au fil des expéditions.
5. **Mobile d'abord** : la moitié au moins des sessions se jouera au doigt, sur 6 pouces.

Conséquences techniques :
- Il faut un **hit-testing géographique précis** (point-dans-polygone), y compris pour les micro-États et les îles.
- Il faut un **contrôle total du style cartographique** (projection, papier, encre, hachures) — c'est l'identité du jeu.
- Le **moteur de règles doit être isomorphe** (client + serveur) pour recalculer les scores côté serveur.
- Le **contenu quotidien est déterministe** et validé en CI.

---

## 1. Stack recommandée (résumé)

| Couche | Choix | Alternatives écartées |
|---|---|---|
| Langage | **TypeScript strict** partout | — |
| Build / dev | **Vite 6** | Next.js (SSR inutile pour un jeu client), Webpack |
| UI | **React 19** | Svelte 5 (excellent mais écosystème de skills/agents plus mince), Solid |
| Carte (rendu + projection) | **d3-geo + d3-geo-projection + d3-zoom**, rendu **Canvas 2D** (fond) + **SVG** (couche interactive) | MapLibre GL (Mercator/globe, tuiles), Leaflet (raster, Mercator), deck.gl, Phaser/Pixi |
| Données géo | **Natural Earth** (domaine public) → **TopoJSON** via **mapshaper** | GADM (licence restrictive), OSM (trop lourd) |
| Calculs géo | **d3-geo** (`geoDistance`, `geoContains`, `geoInterpolate`) + **@turf/turf** ponctuellement (pipeline uniquement) | — |
| Moteur de jeu | **Package TS pur** (`packages/engine`), reducer déterministe, zéro dépendance DOM | XState (option si la machine d'état grossit) |
| État UI | **Zustand** (slices) | Redux Toolkit (verbeux), Jotai |
| Animation | **Motion** (ex-Framer Motion) pour l'UI ; animations de carte en code (rAF) | GSAP (licence OK depuis 2024, mais doublon) |
| Styles | **CSS Modules + variables CSS (tokens)** générées depuis le design system | Tailwind (s'oppose au rendu « matière » sur mesure, mais acceptable pour la mise en page) |
| Persistance locale | **IndexedDB via Dexie** (profil, passeport, historique) + `localStorage` (préférences) | — |
| Backend (rareté, sync) | **Supabase** (Postgres + RLS + Edge Functions Deno + auth anonyme) | Cloudflare Workers + D1 (très bon aussi, voir §6.4) |
| Hébergement front | **Cloudflare Pages** (ou Vercel) — statique + CDN | — |
| Mobile | **PWA** installable + hors-ligne (vite-plugin-pwa / Workbox) ; **Capacitor** en phase 3 pour les stores | React Native (réécriture de la carte) |
| i18n | `Intl.DisplayNames` pour les noms de pays (zéro donnée) + **i18next** pour l'UI ; FR + EN dès le MVP | — |
| Tests | **Vitest** (engine, geo), **Playwright** (E2E + régression visuelle de la carte) | Cypress |
| Qualité | ESLint + Prettier + `eslint-plugin-boundaries` (frontières entre packages) | — |
| Monorepo | **pnpm workspaces** (léger, pas de Turborepo au départ) | Nx (surdimensionné) |

---

## 2. Justification des choix structurants

### 2.1 Pourquoi d3-geo + Canvas/SVG et pas MapLibre / Leaflet

C'est la décision la plus importante du projet. Le cahier des charges impose un rendu **« atlas / document cartographique »**. Cela exige :

| Besoin | d3-geo (Canvas/SVG) | MapLibre GL | Leaflet |
|---|---|---|---|
| Projections d'atlas (Equal Earth, Natural Earth, Winkel Tripel) | ✅ natif (`d3-geo-projection`) | ❌ Mercator + globe uniquement | ❌ Mercator |
| Style « encre et papier » (hachures, traits de côte doublés, ombres portées, grain) | ✅ contrôle pixel total | ⚠️ limité aux propriétés de style, pas de motifs procéduraux complexes | ⚠️ via plugins, médiocre |
| Vue monde entière lisible sur mobile | ✅ | ⚠️ Mercator exagère les pôles | ⚠️ idem |
| Zoom profond (rue) | ❌ inutile pour nous | ✅ | ✅ |
| Poids | ~40 Ko gz (modules d3 ciblés) | ~220 Ko gz | ~45 Ko gz + tuiles |
| Hors-ligne | ✅ un seul fichier TopoJSON | ⚠️ tuiles à embarquer | ⚠️ tuiles |
| Hit-testing pays | ✅ `geoContains` + pick buffer | ✅ `queryRenderedFeatures` | ⚠️ |

Le jeu n'a **jamais** besoin de zoomer au niveau d'une rue : le zoom utile va du monde entier à un archipel (≈ ×1 à ×40). MapLibre résoudrait un problème que nous n'avons pas et nous enfermerait dans Mercator, qui est l'anti-thèse esthétique d'un atlas. **d3-geo nous donne l'identité visuelle ; c'est le différenciateur.**

MapLibre reste un **point d'extension** (§8) pour un éventuel mode « Carnet de terrain » avec relief réel (terrain DEM) — hors MVP.

### 2.2 Pourquoi Canvas **et** SVG (rendu hybride en couches)

- **Canvas 2D** pour ce qui est massif et statique pendant une interaction : terres, mers, traits de côte, frontières, hachures, graticule, textures. ~250 polygones, re-projetés à chaque frame de zoom : Canvas tient 60 fps sur mobile milieu de gamme avec la résolution 110m, et en 50m au-delà d'un seuil de zoom.
- **SVG** pour ce qui est peu nombreux, interactif et doit rester net/accessible : épingles (camps), route d'expédition, étiquettes, cartouches, focus clavier. Le SVG permet `aria-*`, le focus, les transitions CSS et un rendu vectoriel parfait sur écrans haute densité.
- **Pick buffer** (Canvas hors écran) : chaque pays dessiné avec une couleur unique encodant son index → `getImageData` sous le doigt = identification O(1). Sert au survol et au feedback instantané ; la **validation finale** se fait par `geoContains` sur la géométrie précise (voir §4.4).

Phaser/Pixi ne sont pas nécessaires : il n'y a ni sprites nombreux ni physique. Pixi devient pertinent seulement si l'on veut des effets de particules (encre qui sèche, poussière de tampon) au-delà de ce que CSS/Canvas permettent — point d'extension, pas une dépendance.

### 2.3 Pourquoi React + Zustand + moteur pur

- **React** : la majorité des skills, agents et bibliothèques UI existants ciblent React ; le recrutement et l'outillage sont triviaux. La carte n'est **pas** rendue par React (un composant `<AtlasMap>` possède un Canvas et un SVG qu'il pilote impérativement) — React ne gère que le chrome (panneaux, cartouches, passeport).
- **Moteur pur** (`packages/engine`) : `reduce(state, action) → { state, events }`. Déterministe, sérialisable, testable sans DOM, **exécutable dans une Edge Function Deno** pour recalculer les scores. C'est la garantie d'intégrité des classements.
- **Zustand** : store minimal qui détient l'état du moteur + l'état UI (caméra, panneaux ouverts). Les sélecteurs évitent de re-rendre la carte à chaque changement de panneau.

### 2.4 Pourquoi Supabase (et pas un backend maison)

Le backend ne fait que trois choses : (1) recevoir les réponses du jour, (2) agréger la rareté par consigne, (3) synchroniser le profil. Supabase couvre tout : Postgres (agrégats SQL simples), RLS, auth anonyme puis liaison de compte, Edge Functions (Deno, qui exécutent `packages/engine`), cron (`pg_cron`) pour figer les raretés à minuit. **Bonus : il existe des skills d'agent officiels Supabase** (`npx skills add supabase/agent-skills`) et un serveur MCP Supabase, ce qui accélère l'implémentation.

Le jeu doit **fonctionner sans backend** (MVP hors-ligne, rareté estimée) : le backend est une couche d'enrichissement, jamais un point de défaillance.

---

## 3. Structure du projet

```
meridian/
├── apps/
│   └── web/                         # PWA React (Vite)
│       ├── public/
│       │   ├── geo/                 # TopoJSON générés (110m, 50m, micro-États 10m)
│       │   ├── textures/            # papier, grain, hachures (AVIF/WebP)
│       │   └── fonts/               # polices auto-hébergées (woff2, sous-ensembles)
│       └── src/
│           ├── app/                 # routes, providers, bootstrap, PWA
│           ├── map/                 # ⟵ cœur cartographique (voir §4)
│           │   ├── AtlasMap.tsx     # composant hôte (Canvas + SVG + gestes)
│           │   ├── projection.ts    # fabrique de projections, rotation, fit
│           │   ├── camera.ts        # zoom/pan (d3-zoom), inertie, flyTo
│           │   ├── layers/          # paper, ocean, land, borders, graticule, hatching, labels
│           │   ├── overlays/        # camps (pins), route, méridien du jour, loupe
│           │   ├── picking.ts       # pick buffer + geoContains + snapping
│           │   └── lod.ts           # choix 110m/50m/10m selon le zoom
│           ├── ui/                  # composants du design system (cartouche, tampon, boussole…)
│           ├── features/
│           │   ├── expedition/      # écran de jeu quotidien
│           │   ├── passport/        # collection de tampons
│           │   ├── atlas/           # atlas personnel
│           │   └── share/           # génération du partage (texte + image)
│           ├── store/               # Zustand (session, camera, profile, prefs)
│           ├── persistence/         # Dexie (IndexedDB), migrations
│           ├── services/            # client Supabase, fetch du daily, rareté
│           ├── i18n/
│           └── styles/              # tokens.css (généré), global.css
├── packages/
│   ├── engine/                      # règles, score, rareté, objectifs — TS pur, isomorphe
│   │   ├── src/{state,actions,reducer,scoring,rarity,objectives,validation}.ts
│   │   └── test/
│   ├── geo/                         # utilitaires géo partagés (distance, centroïdes, voisinage)
│   ├── content-schema/              # schémas Zod : Expedition, Prompt, Country facts
│   └── design-tokens/               # tokens JSON → CSS vars / TS (source unique)
├── content/
│   ├── countries/                   # faits par pays (JSON, sources citées)
│   ├── prompts/                     # bibliothèque de consignes (prédicats déclaratifs)
│   └── expeditions/                 # puzzles quotidiens YYYY-MM-DD.json
├── tools/
│   ├── geo-pipeline/                # Natural Earth → TopoJSON (mapshaper), métadonnées
│   ├── prompt-forge/                # génération assistée + validation de consignes
│   └── rarity-bootstrap/            # estimation a priori de la rareté
├── supabase/
│   ├── migrations/                  # SQL
│   └── functions/                   # submit-expedition, rarity-snapshot (Deno)
├── docs/                            # ce dossier
└── .claude/{agents,skills}/
```

**Règles de frontière** (vérifiées par `eslint-plugin-boundaries`) :
- `packages/engine` n'importe **rien** d'autre que `packages/geo` et `packages/content-schema`.
- `apps/web/src/map` n'importe pas `features/` (la carte est un composant générique, piloté par props/commandes).
- `tools/` n'est jamais importé par l'app.

---

## 4. Gestion de la carte

### 4.1 Données

| Jeu | Source | Usage | Poids cible (gz) |
|---|---|---|---|
| `world-110m.topo.json` | Natural Earth 1:110m admin-0 | vue monde, zoom < ×3 | ≈ 60 Ko |
| `world-50m.topo.json` | Natural Earth 1:50m admin-0 | zoom ≥ ×3, **validation des réponses** | ≈ 250 Ko (chargé en différé) |
| `micro-10m.topo.json` | Natural Earth 1:10m, filtré aux pays < 2 000 km² + petites îles | micro-États, archipels | ≈ 40 Ko |
| `countries.json` | `content/countries` | faits, ISO, continents, voisins, centroïdes, « point de visée » | ≈ 30 Ko |

Pipeline (`tools/geo-pipeline`, Node, exécuté en CI) :
1. Télécharger Natural Earth (version figée, checksum).
2. Appliquer la **politique de frontières** (§9, risque R1) : choix de la variante « point de vue » Natural Earth, fusion/scission documentées.
3. `mapshaper -simplify` avec préservation topologique, quantification, `-o format=topojson`.
4. Calculer : centroïde, *pole of inaccessibility* (via `polylabel`) pour placer étiquettes et caméras, bbox, voisins (arêtes partagées), surface, liste des îles.
5. Émettre un manifeste versionné (`geo-manifest.json`) avec hash → cache immuable côté CDN.

### 4.2 Projection

- **Par défaut : Equal Earth** (`d3.geoEqualEarth`) — aires vraies, silhouette d'atlas moderne, élégante en paysage comme en portrait.
- **Option « atlas ancien » : Natural Earth I ou Winkel Tripel** (`d3-geo-projection`) — sélectionnable par le design system.
- **Rotation λ** : la projection peut tourner en longitude (`projection.rotate([λ, 0])`) pour centrer l'expédition (ex. route Pacifique). Animée à l'ouverture de l'étape. Gère proprement l'antiméridien (d3 découpe les géométries).
- **Mode « globe » (orthographique)** : réservé à l'écran de récapitulatif (la route vue depuis l'espace) — même pipeline, autre projection.

### 4.3 Caméra : zoom / pan

- **d3-zoom** sur l'élément hôte : molette, pinch, double-tap, drag, inertie. Échelle ×1 → ×40, translation bornée au cadre du monde.
- La transformation `k, x, y` est appliquée au contexte Canvas (`ctx.setTransform`) et au groupe SVG — aucune re-projection pendant le geste (rapide) ; re-projection + LOD **après** le geste (debounce ~120 ms).
- `camera.flyTo(bbox | country | point, { duration })` : interpolation `d3.interpolateZoom` (trajectoire « van Wijk ») — c'est la signature des transitions entre étapes.
- Contraintes UX mobile : un doigt = pan, deux doigts = zoom, **appui long = loupe de précision** (§4.5), tap = sélection provisoire.

### 4.4 Pays cliquables et validation

Trois niveaux, du plus rapide au plus exact :
1. **Survol / tap provisoire** : pick buffer (Canvas hors écran, couleur = index pays) → surbrillance instantanée.
2. **Tolérance tactile** : si le point tombe en mer, recherche du pays le plus proche dans un rayon de **12 px écran** (distance au trait de côte projeté) → *snap* de l'épingle sur la terre la plus proche. Les micro-États (< N px à l'échelle courante) reçoivent une **zone de touche gonflée** (cercle de 22 px) dessinée comme un halo discret.
3. **Validation définitive** : `d3.geoContains` sur la géométrie **50m (ou 10m pour les micro-États)** avec les coordonnées lon/lat de l'épingle (obtenues par `projection.invert`). C'est ce résultat — et seulement lui — qui est envoyé au moteur.

Accessibilité : un **champ de recherche de pays** (combobox ARIA) permet de répondre sans pointer : la caméra vole vers le pays et place l'épingle au *point de visée* (pole of inaccessibility), que le joueur peut ensuite déplacer au clavier (flèches = déplacement de 0,5° ; Maj = 5°).

### 4.5 Épingles (camps), route et loupe

- **Camp** : composant SVG (`overlays/Camp.tsx`), ancré en lon/lat, re-projeté à chaque frame. États : `provisional` → `planted` → `invalid` (« fausse piste ») → `historic`. Le visuel est défini par le design system.
- **Route** : arcs de grand cercle échantillonnés (`d3.geoInterpolate`, ~64 points/étape) → `geoPath` SVG. Animation « tracé à l'encre » via `stroke-dashoffset` piloté par rAF, synchronisée au compteur de distance.
- **Loupe d'arpenteur** : appui long → un second Canvas circulaire rend la zone sous le doigt à ×4 au-dessus du doigt (comme la loupe iOS), avec réticule. Indispensable pour les îles et les frontières serrées au doigt.
- **Méridien du jour** : ligne de longitude mise en exergue (voir gameplay), simple `geoPath` d'un `LineString` méridien.

### 4.6 Rendu des matières (papier, encre, relief)

Implémentation technique ; l'intention artistique est dans `design-system.md`.
- **Papier** : texture tuilée (AVIF ≤ 80 Ko) en CSS sous le Canvas + `mix-blend-mode: multiply` ; vignettage en CSS radial-gradient.
- **Encre** : traits de côte dessinés deux fois (trait plein + trait décalé translucide) ; *water lines* (lignes d'eau concentriques façon gravure) générées par `ctx.shadowBlur`/buffers de contour, **pré-calculées** dans un Canvas hors écran par niveau de LOD et recomposées pendant le geste.
- **Relief** (optionnel MVP) : ombrage hypsométrique pré-rendu en image équirectangulaire, reprojeté au chargement via un *raster reprojection* d3 (coûteux : fait une fois par rotation, mis en cache).
- **Budget** : 16 ms/frame pendant un geste sur un Pixel 6a / iPhone 12. Toute couche qui dépasse est « gelée » en bitmap pendant le geste.

### 4.7 API du composant carte

```ts
<AtlasMap
  projection="equalEarth"
  camps={Camp[]}                 // positions + états
  route={RouteLeg[]}
  highlight={{ iso3?: string; region?: ContinentCode }}
  revealedCountries={Set<ISO3>}  // atlas personnel (encrage)
  mode="play" | "review" | "atlas"
  onProvisionalPick={(pick: GeoPick) => void}
  onConfirmPick={(pick: GeoPick) => void}
  ref={mapApi}                   // flyTo, rotateTo, fitRoute, snapshot(): Promise<Blob>
/>
```
`snapshot()` sert au partage (image de la route) — rendu sur un Canvas dédié en 1080×1350.

---

## 5. Daily, seed et contenu

- **Identifiant du jour** : `YYYY-MM-DD` dans le **fuseau local du joueur** (convention Wordle) ; le numéro d'expédition = jours depuis le lancement.
- **Contenu pré-rédigé, pas généré à la volée** : chaque expédition est un fichier `content/expeditions/2026-11-01.json` (point de départ, 6 consignes, objectifs secondaires, méridien du jour). Les consignes référencent des **prédicats déclaratifs** (`{ "all": [{ "fact": "landlocked", "eq": true }, ...] }`) évalués sur `content/countries`.
- **Validation en CI** (`tools/prompt-forge validate`) : chaque consigne doit avoir entre 8 et 60 réponses valides, couvrir ≥ 3 continents (sauf consigne régionale explicite), ne contenir aucun pays à fait contesté non sourcé ; l'expédition doit permettre une distance théorique ≥ seuil.
- **Distribution** : les fichiers sont publiés en statique sous `/daily/<date>.json`. Pour limiter les fuites, une Edge Function `daily` ne sert que `date ≤ aujourd'hui+1` (marge fuseaux). Hors-ligne : le service worker pré-cache J et J+1.
- **Seed** : le seul aléa (ex. ordre des indices, variations décoratives) dérive de `hash(date)` via un PRNG (mulberry32) **dans le moteur**, pour que client et serveur produisent les mêmes résultats.
- **Mode Practice** : génération procédurale à partir de la bibliothèque de consignes, seed libre, mêmes règles de validation.

---

## 6. Persistance, backend et synchronisation

### 6.1 Local (source de vérité du joueur au MVP)
- **Dexie** : tables `runs` (expéditions jouées), `stamps` (passeport), `atlas` (pays encrés), `profile`. Migrations versionnées.
- `localStorage` : préférences (thème, langue, projection, son, mouvement réduit).

### 6.2 Serveur (Supabase)
- `submissions(puzzle_id, leg, iso3, lon, lat, player_id, created_at)` — insertion via Edge Function `submit-expedition` qui **re-joue l'expédition avec `packages/engine`** et rejette les incohérences.
- `answer_counts(puzzle_id, leg, iso3, n)` — mis à jour par trigger.
- `rarity_snapshots(puzzle_id, leg, payload jsonb, frozen bool)` — recalculé toutes les 10 min, **figé à la bascule du jour** (pg_cron). Servi via CDN (`Cache-Control: s-maxage=300`).
- Auth : **anonyme** par défaut (aucune friction), liaison e-mail/OAuth facultative pour la sync multi-appareils.

### 6.3 Flux d'une partie
```
Charger daily (cache SW) → jouer hors-ligne (engine local, rareté estimée)
  → fin d'expédition → POST submit (si en ligne) → GET rarity snapshot
  → tampons « encre fraîche » (provisoires) → à J+1, tampons « encre sèche » (figés)
```

### 6.4 Alternative backend
Cloudflare Workers + D1 + KV : latence edge supérieure et coût quasi nul ; moins d'outillage (pas d'auth intégrée, pas de skill officiel équivalent). Bascule possible car le contrat est réduit à 3 endpoints (`daily`, `submit`, `rarity`) définis dans `packages/content-schema`.

---

## 7. Mobile, performance, accessibilité (exigences techniques)

- **PWA** : manifest, icônes, service worker (Workbox via `vite-plugin-pwa`), stratégie cache-first pour géo/polices/textures, network-first pour la rareté.
- **Budgets** : JS initial ≤ 180 Ko gz ; géo initiale ≤ 80 Ko gz ; LCP ≤ 2,0 s en 4G ; 60 fps pendant les gestes (vérifié par une trace Playwright + `performance.measure`).
- **Plein écran carte** : `100dvh`, gestion des *safe areas* (`env(safe-area-inset-*)`), désactivation du pull-to-refresh pendant les gestes de carte.
- **Accessibilité** : saisie par recherche de pays, navigation clavier complète, annonces `aria-live` (distance, validité), `prefers-reduced-motion` respecté (route dessinée instantanément, pas de flyTo), contrastes AA sur le chrome.
- **Capacitor (phase 3)** : même build web, plugins Haptics (retour haptique au tampon) et Share natifs.

---

## 8. Points d'extension — skills et bibliothèques à importer

Voici ce que tu peux chercher/importer **avant** l'implémentation. Les skills listés comme « à chercher » sont des pistes de recherche ; ceux marqués ✅ existent à ma connaissance.

| Domaine | Bibliothèques | Skills / outils à importer ou chercher |
|---|---|---|
| Carte vectorielle d3 | `d3-geo`, `d3-geo-projection`, `d3-zoom`, `d3-interpolate`, `topojson-client`, `polylabel` | Chercher un skill « d3 / data visualization » (ex. skills communautaires *d3-viz*) ; le skill `dataviz` disponible dans cette session couvre la couleur/légende |
| Pipeline géo | `mapshaper`, `@turf/turf`, `world-atlas` (TopoJSON Natural Earth prêt à l'emploi) | Chercher un skill « GIS / geospatial / mapshaper » |
| Carte tuilée (extension future) | `maplibre-gl`, `react-map-gl` | Chercher un skill « MapLibre » / « Mapbox GL style spec » |
| Effets 2D avancés (extension) | `pixi.js` v8, `@pixi/react` | Chercher un skill « PixiJS » ; « Phaser » seulement si un mini-jeu arcade est ajouté |
| UI premium | `motion`, `@radix-ui/react-*` (primitives accessibles non stylées), `cmdk` (recherche de pays) | ✅ `frontend-design` (dépôt `anthropics/skills`) ; ✅ plugin `design:design-system`, `design:accessibility-review`, `design:ux-copy` (disponibles dans cette session) |
| Thème / tokens | Style Dictionary (tokens → CSS/TS) | ✅ `theme-factory` (dépôt `anthropics/skills`) comme point de départ |
| Tests | `vitest`, `@playwright/test` | ✅ `webapp-testing` (dépôt `anthropics/skills`, Playwright) ; ✅ plugin `engineering:testing-strategy` |
| Backend | `@supabase/supabase-js` | ✅ `npx skills add supabase/agent-skills` ; ✅ serveur MCP Supabase (connecté dans cette session) |
| PWA | `vite-plugin-pwa`, `workbox` | Chercher un skill « PWA / service worker » |
| Images de partage | Canvas natif ; `satori` en option pour une image générée côté serveur | — |
| État | `zustand`, `immer` (optionnel) | — |
| Mobile natif (phase 3) | `@capacitor/core`, `@capacitor/haptics`, `@capacitor/share` | Chercher un skill « Capacitor » |

Nos propres skills (créés à l'étape 6, dans `.claude/skills/`) : `architecture`, `map-interaction`, `design-system`, `gameplay-systems`, `data-model`. Ils encodent nos conventions et **complètent** les skills génériques ci-dessus sans les dupliquer.

---

## 9. Risques et mitigations

| # | Risque | Impact | Mitigation |
|---|---|---|---|
| R1 | **Frontières contestées** (Cachemire, Sahara occidental, Taïwan, Kosovo, Crimée…) | Réputation, stores, joueurs blessés | Politique écrite (`docs/data-model.md` §politique géo) : liste ISO 3166 + entités documentées ; aucune consigne ne porte sur un territoire contesté ; frontières contestées en pointillé ; contact de correction |
| R2 | Micro-États / îles impossibles à toucher au doigt | Frustration, injustice | Loupe, halo de touche gonflé, snap côtier, recherche textuelle |
| R3 | Performance des textures sur mobile bas de gamme | Saccades = perte de la sensation premium | Couches gelées en bitmap pendant les gestes, budgets mesurés en CI, mode « matière allégée » automatique si fps < 45 |
| R4 | **Démarrage à froid de la rareté** (aucun joueur) | Raretés absurdes au lancement | Estimation a priori (`tools/rarity-bootstrap` : notoriété du pays × nb de réponses valides), mélange bayésien prior/observé jusqu'à N ≥ 200 réponses |
| R5 | Erreurs factuelles dans les consignes | Perte de confiance | Faits sourcés par pays, CI de validation, bouton « signaler », correction rétroactive (étape annulée = non pénalisante) |
| R6 | Proximité avec Farflung (IP, perception de copie) | Juridique / image | Identité propre : épingle libre (distance pin-à-pin), passeport, atlas personnel, méridien du jour, direction artistique atlas ; nom, textes et visuels originaux |
| R7 | Triche (lecture du JSON, scripts) | Classements faussés | Classements = amis/locaux uniquement au MVP ; recalcul serveur ; triche sans enjeu pour le solo |
| R8 | Fuseaux horaires / bascule du jour | Confusion, spoilers | Jour local, serveur tolère J−1..J+1, rareté figée par `puzzle_id` et non par date serveur |
| R9 | Poids des polices et textures | LCP | Sous-ensembles woff2, `font-display: swap` pour le texte courant, texture AVIF ≤ 80 Ko, préchargement ciblé |
| R10 | d3 impératif dans React | Bugs de cycle de vie | Carte encapsulée derrière une API impérative (`ref`), aucune donnée de carte dans le state React, tests Playwright visuels |
| R11 | Licences polices / données | Juridique | Natural Earth (domaine public), polices OFL ou licence web achetée, inventaire `docs/licenses.md` |

---

## 10. Décisions ouvertes (à trancher avec toi)

1. **Supabase vs Cloudflare** pour le backend (recommandation : Supabase pour l'outillage et les skills).
2. **Projection par défaut** : Equal Earth (moderne) vs Natural Earth I (plus « atlas classique ») — l'Art Director tranchera visuellement sur prototype.
3. **Étiquettes de pays visibles ou non** pendant le jeu (impact difficulté) — voir `gameplay-systems.md`.
4. **Monorepo pnpm dès le départ** (recommandé, le pipeline géo a des dépendances lourdes à isoler de l'app) vs app unique.
