---
name: architecture
description: Conventions d'architecture de Meridian (monorepo pnpm, React 19 + Vite, carte d3-geo Canvas/SVG, moteur TS pur isomorphe, Zustand, Dexie, Supabase, PWA). À utiliser avant d'ajouter un fichier, un package, une dépendance, un endpoint, ou de déplacer du code, et lors d'une revue de structure ou de performance.
---

# Skill : architecture (Meridian)

Source de vérité : `docs/architecture.md` (propriétaire : agent `tech-lead`).

## Carte mentale
```
apps/web          PWA React — map/ (carte impérative), ui/ (design system), features/ (écrans), store/ (Zustand), persistence/ (Dexie), services/ (réseau)
packages/engine   règles du jeu — TS pur, déterministe, isomorphe (client + Edge Function Deno)
packages/geo      utilitaires géo partagés (distance, voisinage, quantification)
packages/content-schema  schémas Zod + types
packages/design-tokens   tokens JSON → CSS/TS
content/          faits pays, consignes, expéditions (JSON versionnés)
tools/            geo-pipeline, prompt-forge, rarity-bootstrap (Node, jamais importés par l'app)
supabase/         migrations SQL + Edge Functions
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
| une table / fonction serveur | `supabase/migrations`, `supabase/functions` (voir skill `data-model`) |

## Interdits (vérifiés par eslint-plugin-boundaries)
- `packages/engine` importe le DOM, `fetch`, `Date.now()`, `Math.random()` → **interdit** (horloge et seed passent par les actions).
- `map/` importe `features/` → interdit.
- L'app importe `tools/` → interdit.
- Données de carte (géométries, transform) dans le state React → interdit.

## Avant d'ajouter une dépendance
1. Est-elle déjà couverte par d3 / la plateforme ?
2. Poids gz, licence, maintenance (dernière release < 12 mois), compatibilité Deno si utilisée par engine.
3. Existe-t-il un skill à importer (architecture §8) ?
4. Consigner la décision (ADR court dans `docs/adr/NNNN-titre.md`).

## Budgets (bloquants)
JS initial ≤ 180 Ko gz · géo initiale ≤ 80 Ko gz · LCP ≤ 2,0 s (4G) · p95 frame ≤ 16,7 ms pendant un geste · hors-ligne complet pour le Daily du jour.

## Sortie attendue
Fichiers placés selon le tableau, frontières respectées, budgets mesurés si la modification touche au bundle ou au rendu, ADR si décision structurante.
