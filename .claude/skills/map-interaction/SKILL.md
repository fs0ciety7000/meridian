---
name: map-interaction
description: Construire et faire évoluer la carte premium de Meridian — AtlasMap d3-geo (Canvas fond + SVG overlays), projection Equal Earth et rotation, zoom/pan d3-zoom, LOD TopoJSON, hit-testing (pick buffer, snap côtier, halo micro-États, geoContains), loupe d'arpenteur, camps, route orthodromique animée, méridien, accessibilité clavier et performance 60 fps. À utiliser pour tout code dans apps/web/src/map ou toute interaction avec la carte.
---

# Skill : map-interaction (Meridian)

Sources : `docs/architecture.md` §4 (technique), `docs/design-system.md` §5–6 (rendu), `docs/gameplay-systems.md` §3 (règles de pose).

## Architecture du composant
```
<AtlasMap>                       hôte (div plein écran, 100dvh, safe areas)
 ├─ <canvas data-layer="base">   papier, océan, lignes d'eau, graticule, terres, frontières, côtes
 ├─ <canvas hidden pick>         pick buffer (couleur = index entité), même transform
 ├─ <svg data-layer="overlay">   méridien, route, camps, halos micro-États, focus
 └─ <canvas loupe>               loupe ×4 (appui long)
API impérative (ref) : flyTo, rotateTo, fitRoute, snapshot(), setMode
```
React ne rend que l'hôte et reçoit des props de haut niveau (camps, route, mode) ; tout le dessin passe par `map/layers/*` et `map/overlays/*`.

## Recettes
**Projection** : `geoEqualEarth().fitExtent([[m,m],[w-m,h-m]], sphere)` ; rotation λ animée par interpolation d'angle (plus court chemin) ; re-fit après rotation.

**Zoom/pan** : `d3.zoom().scaleExtent([1, 40]).translateExtent(worldBounds)` ; pendant le geste, appliquer `transform` au Canvas (`ctx.setTransform(k,0,0,k,x,y)` × DPR) et au `<g>` SVG **sans re-projeter** ; à la fin (debounce 120 ms), re-projeter et changer de LOD (`k ≥ 3` → 50m).

**Couches coûteuses** (lignes d'eau, grain, relief) : pré-rendre dans un `OffscreenCanvas` par LOD/rotation, recomposer en `drawImage` pendant le geste.

**Hit-testing** (ordre) :
1. Pick buffer sous le pointeur → survol/sélection provisoire immédiate.
2. Si mer : chercher l'entité la plus proche à ≤ `touchSnapRadiusPx` (12 px) et projeter le point sur sa côte (snap).
3. Micro-États : halo de 22 px cliquable s'ils font < 22 px à l'échelle courante.
4. Validation : `projection.invert(px)` → `geoContains(geometry50mOr10m, lonLat)` ; frontière exacte → départage par `aimPoint` le plus proche. Seul ce résultat part au moteur.

**Loupe** : appui long 350 ms → canvas circulaire 120 px au-dessus du doigt, rendu ×4 de la zone, réticule ; le camp suit le point visé ; relâcher = camp provisoire.

**Route** : par étape, `geoInterpolate(a,b)` échantillonné (64 pts, 128 pour la détection de méridien) → `geoPath` ; animation `stroke-dashoffset` synchronisée à l'odomètre, durée ∝ distance (900–1600 ms) ; antiméridien géré par le découpage d3.

**Camps** : positionnés en lon/lat, re-projetés à chaque frame ; ancrage exact au point (pas au centre de l'icône) ; cible tactile 44 px.

**Clavier / a11y** : `CountrySearch` → `flyTo(entity)` + camp à `aimPoint` ; flèches = ±0,5°, Maj+flèches = ±5°, Entrée = confirmer ; résumé textuel de l'état de la carte dans une région `aria-live`.

**Mouvement réduit** : pas de flyTo (coupe + fondu 120 ms), route instantanée.

## Performance (bloquant)
- p95 frame ≤ 16,7 ms en geste sur profil mobile (CPU ×4) ; aucune frame > 50 ms.
- Mesurer avec Playwright + `performance.measure` ; si fps < 45 pendant 2 s → mode « matière allégée » (sans grain ni lignes d'eau).
- Jamais de `getImageData` du canvas principal en boucle (seulement le pick buffer, 1 px).

## Tests obligatoires
E2E tactiles : Malte, Singapour, Tuvalu, Vatican (loupe), cap Horn (Chili), Lesotho (enclave), Gambie ; route Fidji→Samoa (antiméridien) ; parcours clavier seul ; captures visuelles de référence (Atlas + Nocturne, 360×740 et 1440×900).

## Ne jamais
Mercator, tuiles raster, marqueurs Leaflet/goutte, étiquettes de pays pendant une étape (sauf option « Atlas annoté »), données de carte dans le state React, re-projection complète à chaque événement de geste.
