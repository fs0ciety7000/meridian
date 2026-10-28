# Meridian — Plan de développement

> **Auteur :** Tech Lead (`.claude/agents/tech-lead.md`), arbitrage producteur
> **Contributions :** tous les agents (critères d'acceptation de leur domaine)
> **Statut :** v0.1
> **Prérequis :** tous les documents de `docs/`

Principe : **un MVP jouable et beau**, construit carte d'abord. On prouve d'abord que *planter un camp* est un plaisir (phase 1) avant d'écrire la moindre règle de score. Chaque phase se termine par un **portail de validation** (gate) avec critères mesurables.

---

## Vue d'ensemble

| Phase | Nom | Contenu | Gate |
|---|---|---|---|
| 0 | Fondations | monorepo, tokens, pipeline géo, CI | build vert, géo générée |
| 1 | **Tranche verticale carte** | AtlasMap, matières, zoom/pan, picking, loupe, camp, route | revue Art Director + budget perf |
| 2 | **Daily jouable (hors-ligne)** | engine, contenu, chrome de jeu, récap, passeport, partage texte | 6 étapes jouables de bout en bout |
| 3 | **MVP public** | polish, accessibilité, PWA, carte postale, playtests, équilibrage | critères MVP (§ Phase 3) |
| 4 | v1.1 « L'encre sèche » | backend Supabase, rareté dynamique, 3 ordres, Archives, Fantôme, cartouches texte | rareté live stable |
| 5 | v1.2 « Nouvelles routes » | mode Chaîne, Sprint, biomes, carnet naturaliste | — |
| 6 | v2 | Capacitor (stores), expédition commune, cartouches illustrés | — |

Agents responsables : **TL** Tech Lead · **AD** Art Director · **GD** Game Designer · **SD** Systems Designer · **QA** QA/Balance.

---

## Phase 0 — Fondations

| # | Tâche | Resp. |
|---|---|---|
| 0.1 | Monorepo pnpm : `apps/web`, `packages/{engine,geo,content-schema,design-tokens}`, `tools/*` ; TS strict, ESLint (+ boundaries), Prettier | TL |
| 0.2 | Vite + React 19 + Vitest + Playwright ; CI GitHub Actions (lint, typecheck, test, build) | TL |
| 0.3 | `packages/design-tokens` : JSON de `design-system.md` §12 → `tokens.css` + `tokens.ts` | TL + AD |
| 0.4 | `tools/geo-pipeline` : Natural Earth (version figée) → TopoJSON 110m/50m/10m-micro + métadonnées (aimPoint, voisins, îles, bbox) + manifeste | TL |
| 0.5 | Liste des entités jouables + territoires (`content/entities.json`) selon la politique géo validée | SD + GD |
| 0.6 | Polices auto-hébergées (sous-ensembles), texture papier/grain | AD |

**Critères d'acceptation**
- `pnpm i && pnpm build && pnpm test` vert en CI.
- `geo-pipeline` reproductible (même entrée → mêmes hash), `world-110m` ≤ 80 Ko gz.
- 195 entités jouables, chacune avec géométrie dans les 3 LOD, `aimPoint` contenu dans sa géométrie (test).

---

## Phase 1 — Tranche verticale carte (le cœur de l'identité)

| # | Tâche | Resp. |
|---|---|---|
| 1.1 | `AtlasMap` : Canvas (fond) + SVG (overlays), projection Equal Earth, fit monde, HiDPI | TL |
| 1.2 | Couches : océan, lignes d'eau, graticule, terres, frontières (+ contestées), côtes doublées, papier/grain | TL + AD |
| 1.3 | Caméra : d3-zoom (pan, pinch, molette, double-tap), bornes, inertie, `flyTo`, `rotateTo` ; gel bitmap pendant geste ; LOD 110m→50m | TL |
| 1.4 | Picking : pick buffer (survol), snap côtier 12 px, halo micro-États, validation `geoContains` 50m/10m | TL |
| 1.5 | Loupe d'arpenteur (appui long) | TL + AD |
| 1.6 | `Camp` (états provisional/planted/invalid/historic/start), `RouteLine` grand cercle animée, méridien du jour | TL + AD |
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

## Phase 2 — Daily jouable (hors-ligne)

| # | Tâche | Resp. |
|---|---|---|
| 2.1 | `packages/content-schema` : schémas Zod (Expedition, PromptDef, FactDef, CountryFacts, RunState…) | TL + SD |
| 2.2 | `content/countries` : faits sourcés pour ≥ 25 faits × 195 entités (priorité aux faits des 60 premières consignes) | SD + GD |
| 2.3 | `packages/engine` : reducer, validation, distance quantifiée, méridien, rareté (prior), ordres de mission, longue-vue, score ; **couverture ≥ 95 %** | SD (spec) + TL (code) |
| 2.4 | `tools/prompt-forge` : `validate`, `compute`, `suggest` (combinaisons de prédicats), `route-check` (missions atteignables) | TL + GD |
| 2.5 | `tools/rarity-bootstrap` : salience par pays (pages vues Wikipédia, population — sources libres) | SD + QA |
| 2.6 | Bibliothèque de **80 consignes** et **30 expéditions** validées | GD + QA |
| 2.7 | Chrome de jeu : `PromptCartouche`, `CampBar` (sceau), `Odometer`, `ExpeditionClock`, `LegLog`, `MarginNote` | TL + AD |
| 2.8 | Chorégraphie de résolution d'étape (≤ 3,5 s, passable) + `prefers-reduced-motion` | TL + AD |
| 2.9 | Récapitulatif (globe orthographique), partage **texte** | TL + AD |
| 2.10 | Persistance Dexie : runs, stamps, passeport, atlas, profil, reprise de partie | TL |
| 2.11 | `PassportBook` + vue Atlas personnel (encré / non encré) | AD + TL |
| 2.12 | Mode Entraînement (seed, difficulté) | SD + TL |
| 2.13 | i18n FR/EN (noms de pays via `Intl.DisplayNames`) | TL |

**Critères d'acceptation**
- Une expédition complète se joue hors-ligne de bout en bout, sur mobile et desktop, en < 6 min pour un joueur moyen.
- Le moteur rejoue 10 000 runs aléatoires (property-based, fast-check) sans exception et avec scores identiques entre deux exécutions.
- Fermer/rouvrir l'app à n'importe quelle étape restaure l'état exact.
- 30 expéditions passent `prompt-forge validate` ; QA a joué les 30 et aucun fait contesté n'est relevé.
- Aucune violation de `design-system.md` §11 relevée en revue AD.

---

## Phase 3 — MVP public

| # | Tâche | Resp. |
|---|---|---|
| 3.1 | PWA : manifest, service worker (pré-cache J et J+1, géo, polices), installation | TL |
| 3.2 | Carte postale (`ShareCard` via `AtlasMap.snapshot()`, Web Share API + téléchargement) | AD + TL |
| 3.3 | Audit accessibilité (WCAG 2.1 AA) — skill `design:accessibility-review` + tests axe Playwright | QA |
| 3.4 | Son et haptique (palette « bureau d'expédition »), réglages | AD |
| 3.5 | Onboarding sans texte : la première étape du premier jour est une consigne guidée (« Plante ton camp n'importe où en Afrique ») | GD + AD |
| 3.6 | Playtests (≥ 15 joueurs × 5 jours), télémétrie anonyme, calibration `BALANCE` (β, multiplicateurs, bonus méridien) | QA + SD |
| 3.7 | Mode « matière allégée » automatique (fps < 45), budgets en CI | TL |
| 3.8 | Pages légales, licences (`docs/licenses.md`), politique géo publique | TL + GD |
| 3.9 | 60 expéditions en stock avant lancement | GD |

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
| 4.1 | Supabase : migrations, RLS, auth anonyme ; skill `supabase/agent-skills` | TL |
| 4.2 | Edge Function `submit-expedition` (rejoue avec `packages/engine`), `daily`, `rarity` | TL |
| 4.3 | Instantanés de rareté (pg_cron 10 min) + gel à la bascule ; outbox hors-ligne côté client | TL + SD |
| 4.4 | Animation « l'encre sèche » au retour du lendemain, mise à jour passeport | AD + TL |
| 4.5 | 3 ordres de mission/jour, sceaux, titres | SD + GD |
| 4.6 | Mode Archives ; mode Fantôme (ShareCode) | GD + TL |
| 4.7 | Cartouches (faits cachés) version texte | GD |

**Critères** : distribution des paliers observée à ±5 points des cibles 50/30/15/5 sur 14 jours ; 0 divergence de score client/serveur sur les soumissions ; rareté servie en < 200 ms p95 (CDN).

---

## Phases 5–6 (aperçu)
- **v1.2** : mode Chaîne, Sprint (cadran solaire), biomes Köppen, carnet naturaliste, consignes contextuelles enrichies.
- **v2** : Capacitor iOS/Android (haptique native, partage natif), expédition commune hebdomadaire, cartouches illustrés, cosmétiques étendus.

---

## Ordre d'implémentation (chemin critique)

```
0.1 → 0.4 → 1.1 → 1.2 → 1.3 → 1.4 → 1.6 ──┐
                 0.3 ──┘          1.5 ─────┤──▶ GATE 1 (AD + perf)
2.1 → 2.3 ────────────────────────────────────┐
0.5 → 2.2 → 2.4 → 2.6 ────────────────────────┤──▶ 2.7 → 2.8 → 2.9 → 2.10 → 2.11 ──▶ GATE 2
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
