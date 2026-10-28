# Licences et sources

Meridian n'embarque que des données et des logiciels dont la licence permet la diffusion dans un jeu gratuit. Toute nouvelle dépendance ou source de données ajoute une ligne ici.

## Données

| Source | Utilisation | Licence |
|---|---|---|
| Natural Earth 5.1.2 (admin-0 countries 110m/50m/10m, zones disputées) | carte, frontières, faits géométriques | domaine public |
| Wikidata (instantané du 2026-10-28) | population, point culminant, monnaies, langues officielles, couleurs des drapeaux, organisations, notoriété (sitelinks) | CC0 |
| Banque mondiale (WDI 2024) | populations corrigées par QA | CC BY 4.0 — attribution ci-dessus |
| Listes de Wikipédia (pays enclavés, sens de circulation, monarchies, frontières…) | listes curées dans `content/facts/curated.json`, citées une à une | faits non protégeables ; sources citées |
| Wikimedia pageviews API | contrôle de la notoriété (salience) | CC0 |

## Polices (SIL Open Font License 1.1)

Fraunces (Undercase Type), EB Garamond (Georg Duffner, Octavio Pardo), Instrument Sans (Instrument), IBM Plex Mono (IBM) — via Fontsource.

## Logiciels

| Paquet | Licence |
|---|---|
| React, React DOM | MIT |
| d3-geo, d3-zoom, d3-selection, d3-interpolate | ISC |
| topojson-client | ISC |
| Zustand | MIT |
| Dexie | Apache-2.0 |
| Hono | MIT |
| Zod | MIT |
| Vite, Vitest, Playwright, TypeScript, ESLint, Prettier (outillage) | MIT / Apache-2.0 |

Les textures papier et grain sont générées par `apps/web/scripts/generate-textures.ts` (création originale). Les sons sont synthétisés à l'exécution (`apps/web/src/game/sound.ts`), sans fichier audio.
