# Meridian — Plan de développement

> **Auteur :** Tech Lead (`.claude/agents/tech-lead.md`), arbitrage producteur
> **Contributions :** tous les agents (critères d'acceptation de leur domaine)
> **Statut :** v0.2 — révisée : déploiement Docker/Coolify + Cloudflare dès la phase 0, backend Hono + SQLite, jeu à la demande (codes, catalogue, générateur, défis)
> **Prérequis :** tous les documents de `docs/`

Principe : **un MVP jouable et beau**, construit carte d'abord. On prouve d'abord que *planter un camp* est un plaisir (phase 1) avant d'écrire la moindre règle de score. Chaque phase se termine par un **portail de validation** (gate) avec critères mesurables.

---

## Vue d'ensemble

| Phase | Nom | Contenu | Gate |
|---|---|---|---|
| 0 | Fondations | monorepo, tokens, pipeline géo, CI, **image Docker déployée sur Coolify** | build vert, géo générée, URL de recette en HTTPS |
| 1 | **Tranche verticale carte** | AtlasMap, matières, zoom/pan, picking, loupe, camp, route | revue Art Director + budget perf |
| 2 | **Expéditions jouables (hors-ligne)** | engine, générateur + codes, catalogue, contenu, chrome de jeu, récap, passeport, défi par lien | expéditions générées et du catalogue jouables de bout en bout |
| 3 | **MVP public** | polish, accessibilité, PWA, carte postale, playtests, équilibrage | critères MVP (§ Phase 3) |
| 4 | v1.1 « L'encre sèche » | API Hono + SQLite + Litestream, rareté par consigne, séchage des tampons, classements par expédition, fantôme, cartouches texte | rareté live stable |
| 5 | v1.2 « Nouvelles routes » | mode Chaîne, Sprint, biomes, carnet naturaliste | — |
| 6 | v2 | Capacitor (stores), expédition commune, cartouches illustrés | — |

Agents responsables : **TL** Tech Lead · **AD** Art Director · **GD** Game Designer · **SD** Systems Designer · **QA** QA/Balance.

---

## Phase 0 — Fondations

| # | Tâche | Resp. |
|---|---|---|
| 0.1 | Monorepo pnpm : `apps/web`, `packages/{engine,geo,content-schema,design-tokens}`, `tools/*` ; TS strict, ESLint (frontières via no-restricted-imports), Prettier | TL |
| 0.2 | Vite + React 19 + Vitest + Playwright ; CI GitHub Actions (lint, typecheck, test, build) | TL |
| 0.3 | `packages/design-tokens` : JSON de `design-system.md` §12 → `tokens.css` + `tokens.ts` | TL + AD |
| 0.4 | `tools/geo-pipeline` : Natural Earth (version figée) → TopoJSON 110m/50m/10m-micro + métadonnées (aimPoint, voisins, îles, bbox) + manifeste | TL |
| 0.5 | Liste des entités jouables + territoires (`content/entities.json`) selon la politique géo validée | SD + GD |
| 0.6 | Polices auto-hébergées (sous-ensembles), texture papier/grain | AD |
| 0.7 | `apps/server` minimal (Hono : statique + `/api/health`), `deploy/Dockerfile` multi-stage, `docker-compose.yml` | TL |
| 0.8 | Coolify (`coolify.fs0ciety.org`) : ressource branchée sur le dépôt, déploiement auto (`main` → prod, `staging` → recette), volume `/data` | TL |
| 0.9 | Cloudflare (`cardormedia.com`) : sous-domaines prod + recette proxifiés, SSL Full (strict) + certificat d'origine (DNS-01 ou Origin CA), règles de cache (`architecture.md` §7.4), Rocket Loader désactivé | TL |
| 0.10 | Décision backend : Hono + SQLite (défaut) ou **spike PocketBase** (½ jour, critère : moteur bundlé rejoue 1 000 runs à l'identique dans `pb_hooks`) | TL |

**Critères d'acceptation**
- `pnpm i && pnpm build && pnpm test` vert en CI.
- Un push sur `staging` déploie automatiquement sur l'URL de recette en HTTPS ; `/api/health` répond 200 via Cloudflare ; `index.html` et `sw.js` non mis en cache, `/assets/*` en cache immuable (vérifié avec `curl -I`, en-tête `cf-cache-status`).
- `geo-pipeline` reproductible (même entrée → mêmes hash), `world-110m` ≤ 80 Ko gz.
- 195 entités jouables, chacune avec géométrie dans les 3 LOD, `aimPoint` contenu dans sa géométrie (test).

---

### État de la phase 0 (2026-10-28)
| # | État | Notes |
|---|---|---|
| 0.1 | ✅ | pnpm workspace ; frontières via `no-restricted-imports` |
| 0.2 | ✅ | Vite 8 + React 19, Vitest 5, Playwright (contre le serveur de prod), CI GitHub Actions (4 jobs) |
| 0.3 | ✅ | `tokens.json` → `tokens.css` (Atlas + Nocturne), contrastes testés |
| 0.4 | ✅ | Natural Earth 5.1.2 épinglé, 110m 36 Ko gz / 50m 221 Ko gz / micro 20 Ko gz, reproductible (`geo:check`) |
| 0.5 | ✅ | 195 entités ; politique v1 (`docs/geo-policy-changelog.md`) — décision Taïwan encore ouverte |
| 0.6 | ✅ | polices Fontsource (OFL), textures procédurales provisoires, planche d'épreuve à `/` |
| 0.7 | ✅ | image unique (63 Mo), healthcheck, arrêt propre, volume `/data` testé |
| 0.8 | ⏳ | **à faire par toi dans Coolify** — pas à pas : `docs/deployment.md` §3 |
| 0.9 | ⏳ | **à faire par toi dans Cloudflare** — `docs/deployment.md` §4, vérification §5 |
| 0.10 | ✅ | Hono + SQLite retenu |

Découverte en phase 0 : le quantum de coordonnées passe de 0,01° à **0,001°** (aucun point de la grille à 0,01° ne tombe dans le Vatican).

---

## Phase 1 — Tranche verticale carte (le cœur de l'identité)

| # | Tâche | Resp. |
|---|---|---|
| 1.1 | `AtlasMap` : Canvas (fond) + SVG (overlays), projection Equal Earth, fit monde, HiDPI | TL |
| 1.2 | Couches : océan, lignes d'eau, graticule, terres, frontières (+ contestées), côtes doublées, papier/grain | TL + AD |
| 1.3 | Caméra : d3-zoom (pan, pinch, molette, double-tap), bornes, inertie, `flyTo`, `rotateTo` ; gel bitmap pendant geste ; LOD 110m→50m | TL |
| 1.4 | Picking : pick buffer (survol), snap côtier 12 px, halo micro-États, validation `geoContains` 50m/10m | TL |
| 1.5 | Loupe d'arpenteur (appui long) | TL + AD |
| 1.6 | `Camp` (états provisional/planted/invalid/historic/start), `RouteLine` grand cercle animée, méridien de l'expédition | TL + AD |
| 1.7 | `CountrySearch` (combobox) + déplacement clavier du camp | TL |
| 1.8 | Échelle graphique dynamique + rose des vents | AD |
| 1.9 | Page de démo `/lab/map` avec jeu de données fictif ; tests Playwright visuels (captures de référence) | TL + QA |

**Critères d'acceptation**
- 60 fps (p95 frame ≤ 16,7 ms) pendant pan/zoom sur profil Playwright « mobile milieu de gamme » (CPU ×4 throttling) ; aucune frame > 50 ms.
- Planter un camp **valide du premier coup** au doigt (émulation tactile) sur : Malte, Singapour, Tuvalu, Vatican (via loupe), Chili (pointe sud), Lesotho, Gambie — test E2E.
- Antiméridien : route Fidji → Samoa tracée correctement.
- Clavier seul : sélectionner « Bhoutan » et planter, sans souris.
- **Revue AD** : captures comparées à `design-system.md` (couleurs, épaisseurs, typo), liste « ne jamais faire » vérifiée. Le prototype « donne envie de toucher la carte ».

**🔁 Point de décision** : projection par défaut (Equal Earth vs Natural Earth I) tranchée par AD sur ce prototype.

---

## Phase 2 — Expéditions jouables (hors-ligne)

| # | Tâche | Resp. |
|---|---|---|
| 2.1 | `packages/content-schema` : schémas Zod (Expedition, PromptDef, FactDef, CountryFacts, RunState…) | TL + SD |
| 2.2 | `content/countries` : faits sourcés pour ≥ 25 faits × 195 entités (priorité aux faits des 60 premières consignes) | SD + GD |
| 2.3 | `packages/engine` : reducer, validation, distance quantifiée, méridien, rareté (prior), ordres de mission, longue-vue, score ; **couverture ≥ 95 %** | SD (spec) + TL (code) |
| 2.3b | `packages/engine` : **générateur d'expéditions** seedé (3 difficultés) + **codes** `MER-…` (encodage Crockford, caractère de contrôle) | SD (spec) + TL (code) |
| 2.4 | `tools/prompt-forge` : `validate`, `compute`, `suggest` (combinaisons de prédicats), `route-check` (missions atteignables) | TL + GD |
| 2.5 | `tools/rarity-bootstrap` : salience par pays (pages vues Wikipédia, population — sources libres) | SD + QA |
| 2.6 | Bibliothèque de **120 consignes** (le générateur en a besoin de beaucoup), **120 ports** et **30 expéditions de catalogue** validées | GD + QA |
| 2.7 | Chrome de jeu : `PromptCartouche`, `CampBar` (sceau), `Odometer`, `ExpeditionClock`, `LegLog`, `MarginNote` | TL + AD |
| 2.8 | Chorégraphie de résolution d'étape (≤ 3,5 s, passable) + `prefers-reduced-motion` | TL + AD |
| 2.9 | Récapitulatif (globe orthographique), partage **texte + lien de défi** (code + route), écran « Relever le défi » et comparaison des scores | TL + AD |
| 2.10 | Persistance Dexie : runs, stamps, passeport, atlas, profil, reprise de partie | TL |
| 2.11 | `PassportBook` + vue Atlas personnel (encré / non encré) | AD + TL |
| 2.12 | Accueil `ExpeditionLauncher` : nouvelle expédition (difficulté), Carnet d'expéditions, saisie de code, expéditions en cours, rejeu | AD + TL |
| 2.13 | i18n FR/EN (noms de pays via `Intl.DisplayNames`) | TL |

**Critères d'acceptation**
- Une expédition complète se joue hors-ligne de bout en bout, sur mobile et desktop, en < 6 min pour un joueur moyen.
- Le moteur rejoue 10 000 runs aléatoires (property-based, fast-check) sans exception et avec scores identiques entre deux exécutions.
- Le générateur produit 100 000 expéditions valides par difficulté ; un code saisi sur un autre appareil reconstruit une expédition au `hash` identique.
- Un lien de défi ouvert dans un autre navigateur lance la même expédition et affiche la comparaison à la fin.
- Fermer/rouvrir l'app à n'importe quelle étape restaure l'état exact.
- Les 30 expéditions du catalogue et la bibliothèque passent `prompt-forge validate` ; QA a joué les 30 + 50 générées et aucun fait contesté n'est relevé.
- Aucune violation de `design-system.md` §11 relevée en revue AD.

---

## Phase 3 — MVP public

| # | Tâche | Resp. |
|---|---|---|
| 3.1 | PWA : manifest, service worker (pré-cache bibliothèque de consignes, catalogue, géo, polices), installation, jeu 100 % hors-ligne | TL |
| 3.2 | Carte postale (`ShareCard` via `AtlasMap.snapshot()`, Web Share API + téléchargement) | AD + TL |
| 3.3 | Audit accessibilité (WCAG 2.1 AA) — skill `design:accessibility-review` + tests axe Playwright | QA |
| 3.4 | Son et haptique (palette « bureau d'expédition »), réglages | AD |
| 3.5 | Onboarding sans texte : la toute première expédition est `MER-0001`, dont l'étape 1 est guidée (« Plante ton camp n'importe où en Afrique ») | GD + AD |
| 3.6 | Playtests (≥ 15 joueurs, ≥ 10 expéditions chacun sur 2 semaines), télémétrie anonyme, calibration `BALANCE` (β, multiplicateurs, bonus méridien) | QA + SD |
| 3.7 | Mode « matière allégée » automatique (fps < 45), budgets en CI | TL |
| 3.8 | Pages légales, licences (`docs/licenses.md`), politique géo publique | TL + GD |
| 3.9 | 50 expéditions au catalogue avant lancement ; procédure de restauration de sauvegarde testée (même si l'API n'arrive qu'en phase 4, le volume existe) | GD + TL |

**Critères d'acceptation MVP (= définition de « terminé » du MVP)**
- **Beau** : revue AD signée ; captures de référence figées ; carte postale jugée « partageable » par ≥ 70 % des testeurs.
- **Jouable** : taux de fausses pistes par consigne entre 10 % et 45 % ; temps médian par expédition 3–6 min.
- **Précis** : < 2 % de signalements « je n'ai pas pu planter où je voulais » en playtest.
- **Rapide** : LCP ≤ 2,0 s (4G simulée), JS initial ≤ 180 Ko gz, 60 fps de geste.
- **Accessible** : 0 violation axe critique/sérieuse ; parcours complet au clavier et au lecteur d'écran (VoiceOver iOS, NVDA).
- **Robuste** : 0 crash sur la matrice Safari iOS 17+, Chrome Android 12+, Chrome/Firefox/Safari desktop.
- **Indicateurs de validation de la vision** (`vision-and-innovations.md` §8) instrumentés.

---

## Phase 4 — v1.1 « L'encre sèche »

| # | Tâche | Resp. |
|---|---|---|
| 4.1 | API Hono : schéma Drizzle + migrations SQLite, jetons d'appareil (JWT, `jose`), limites de débit | TL |
| 4.2 | `POST /api/runs` (rejoue avec `packages/engine`, détermine `attempt`), `GET /api/rarity`, `GET /api/expeditions`, classements | TL |
| 4.3 | Rareté par consigne (première rencontre), job de recalcul 10 min ; outbox hors-ligne côté client | TL + SD |
| 4.4 | Séchage des tampons (24 h) + animation regroupée, mise à jour passeport | AD + TL |
| 4.5 | 1–3 ordres de mission selon la difficulté, sceaux, titres | SD + GD |
| 4.6 | Fantôme sur la carte (ShareCode v2) ; classements par expédition du catalogue | GD + TL |
| 4.8 | Litestream → Cloudflare R2 en production, restauration testée, supervision (sonde Coolify + alerte) | TL |
| 4.7 | Cartouches (faits cachés) version texte | GD |

**Critères** : distribution des paliers observée à ±5 points des cibles 50/30/15/5 sur les consignes ayant ≥ 300 réponses ; restauration complète de la base depuis R2 en < 10 min ; 0 divergence de score client/serveur sur les soumissions ; rareté servie en < 200 ms p95 (CDN).

---

## Phases 5–6 (aperçu)
- **v1.2** : mode Chaîne, Sprint (cadran solaire), biomes Köppen, carnet naturaliste, consignes contextuelles enrichies.
- **v2** : Capacitor iOS/Android (haptique native, partage natif), expédition commune hebdomadaire, cartouches illustrés, cosmétiques étendus.

---

## Ordre d'implémentation (chemin critique)

```
0.1 → 0.7 → 0.8 → 0.9   (infra de recette en place dès la 1re semaine)
0.1 → 0.4 → 1.1 → 1.2 → 1.3 → 1.4 → 1.6 ──┐
                 0.3 ──┘          1.5 ─────┤──▶ GATE 1 (AD + perf, démo sur l'URL de recette)
2.1 → 2.3 → 2.3b ─────────────────────────────┐
0.5 → 2.2 → 2.4 → 2.6 ────────────────────────┤──▶ 2.7 → 2.8 → 2.9 → 2.10 → 2.11 → 2.12 ──▶ GATE 2
                              2.5 ────────────┘
3.x en parallèle ─────────────────────────────────────────────────────────────────▶ GATE MVP
```
Parallélisable dès la phase 0 : contenu (faits, consignes) par GD/SD pendant que TL construit la carte.

---

## Gestion des risques par phase
| Risque (cf. architecture §9) | Traité en |
|---|---|
| R2 micro-États au doigt | Phase 1 (critère E2E dédié) |
| R3 perf textures | Phase 1 (budget), Phase 3 (mode allégé) |
| R1 frontières | Phase 0 (politique validée avant toute géo) |
| R5 erreurs factuelles | Phase 2 (sources + CI), Phase 3 (signalement) |
| R4 rareté à froid | Phase 2 (prior), Phase 4 (lissage) |

## Définition de « terminé » d'une tâche
Code typé et testé ; aucun token visuel en dur ; capture Playwright mise à jour si visuel ; revue par l'agent du domaine (AD pour le visuel, SD pour les règles, QA pour l'équilibrage/accessibilité) ; doc mise à jour si une règle change.
