---
name: architecture
description: Conventions d'architecture de Meridian (monorepo pnpm, React 19 + Vite, carte d3-geo Canvas/SVG, moteur TS pur isomorphe, Zustand, Dexie, API Node + Hono + SQLite, Docker sur Coolify derrière Cloudflare, PWA). À utiliser avant d'ajouter un fichier, un package, une dépendance, un endpoint ou une variable d'environnement, de toucher au Dockerfile ou au cache, ou de déplacer du code, et lors d'une revue de structure ou de performance.
---

# Skill : architecture (Meridian)

Source de vérité : `docs/architecture.md` (propriétaire : agent `tech-lead`).

## Carte mentale
```
apps/web          PWA React — map/ (carte impérative), ui/ (design system), features/ (écrans), store/ (Zustand), persistence/ (Dexie), services/ (réseau)
apps/server       API Node + Hono + SQLite (Drizzle) — sert aussi le front buildé
packages/engine   règles du jeu + générateur d'expéditions — TS pur, déterministe, isomorphe (navigateur + Node)
packages/geo      utilitaires géo partagés (distance, voisinage, quantification)
packages/content-schema  schémas Zod + types
packages/design-tokens   tokens JSON → CSS/TS
content/          faits pays, consignes, expéditions (JSON versionnés)
tools/            geo-pipeline, prompt-forge, rarity-bootstrap (Node, jamais importés par l'app)
deploy/           Dockerfile multi-stage, docker-compose (app + Litestream), litestream.yml
```

## Règles de placement
| Je veux… | Où |
|---|---|
| ajouter une règle de jeu / un calcul de score | `packages/engine` (+ test) — jamais dans un composant |
| un calcul géographique réutilisé par engine et app | `packages/geo` |
| une couche ou un overlay de carte | `apps/web/src/map/layers` ou `overlays` (voir skill `map-interaction`) |
| un composant visuel réutilisable | `apps/web/src/ui` (voir skill `design-system`) |
| un écran / flux | `apps/web/src/features/<feature>` |
| un type de contenu | `packages/content-schema` (Zod) puis `content/` |
| une table / route serveur | `apps/server/src/db/schema.ts` (+ migration Drizzle), `apps/server/src/routes` (voir skill `data-model`) |
| une variable d'environnement / un secret | `deploy/` + doc architecture §7.2 + secrets Coolify (jamais dans git) |

## Interdits (vérifiés par `eslint.config.js` : no-restricted-imports / -globals / -properties)
- `packages/engine` importe le DOM, `fetch`, `Date.now()`, `Math.random()` → **interdit** (horloge et seed passent par les actions).
- `map/` importe `features/` → interdit.
- L'app importe `tools/` → interdit.
- Données de carte (géométries, transform) dans le state React → interdit.

## Avant d'ajouter une dépendance
1. Est-elle déjà couverte par d3 / la plateforme ?
2. Poids gz, licence, maintenance (dernière release < 12 mois), aucune API Node/DOM si utilisée par engine (doit tourner à l'identique navigateur + Node).
3. Existe-t-il un skill à importer (architecture §8) ?
4. Consigner la décision (ADR court dans `docs/adr/NNNN-titre.md`).

## Budgets (bloquants)
JS initial ≤ 180 Ko gz · géo initiale ≤ 80 Ko gz · LCP ≤ 2,0 s (4G) · p95 frame ≤ 16,7 ms pendant un geste · jeu complet hors-ligne (générateur + engine + bibliothèque embarqués).

## Déploiement (rappel)
Image Docker unique (`deploy/Dockerfile`) → Coolify (`main` = prod, `staging` = recette), volume `/data` (SQLite WAL) + Litestream → R2 ; Cloudflare en Full (strict) ; `/assets|geo|fonts/*` immutables, `index.html`/`sw.js` en `no-cache`, `/api/*` non mis en cache sauf `rarity`/`expeditions` (`s-maxage` court).

## Sortie attendue
Fichiers placés selon le tableau, frontières respectées, budgets mesurés si la modification touche au bundle ou au rendu, ADR si décision structurante.
