# ADR 0001 — Driver SQLite serveur : `node:sqlite` (intégré à Node)

- **Statut :** accepté (phase 3, télémétrie 3.6 et sauvegarde 3.9)
- **Auteur :** Tech Lead · **Date :** 2026-10-28

## Contexte
La phase 3 introduit la première écriture serveur (télémétrie anonyme, `POST /api/telemetry`), stockée en SQLite sur le volume `/data` (architecture §6.2, data-model §7). Contraintes : image unique sans `node_modules` au runtime (le serveur est un bundle esbuild `server.mjs`), Alpine (musl), sauvegarde cohérente à chaud sans outil `sqlite3` sur l'hôte Coolify.

## Options
| | `node:sqlite` (intégré) | `better-sqlite3` |
|---|---|---|
| Poids / image | 0 Ko, rien à installer | module natif (~2 Mo) : à copier hors du bundle dans l'image runtime, binaire musl à compiler ou télécharger au build |
| Licence / maintenance | Node.js (MIT), suit les versions de Node | MIT, très maintenu |
| API | synchrone (`DatabaseSync`), requêtes préparées, `backup()` en ligne (Node ≥ 22.16) | synchrone, très complète, `backup()` |
| Maturité | « experimental » dans Node 22 (un `ExperimentalWarning` au démarrage) ; non flaggé depuis 22.13 | stable |
| Drizzle | pas de driver officiel → SQL brut | driver officiel |

Vérifié : Node 22.22 en local et 22.23 dans `node:22-alpine` exposent `DatabaseSync` et `backup()` ; le bundle esbuild laisse `node:sqlite` externe ; Vitest le charge sans configuration.

## Décision
`node:sqlite`. `engines.node` passe à `>=22.13` (premier Node 22 sans `--experimental-sqlite`) ; les scripts de sauvegarde tournent dans l'image (Node 22 courant, ≥ 22.16 pour `backup()`).

## Conséquences
- Image inchangée (aucune dépendance native, aucun `node_modules`), build Docker identique.
- Pas de Drizzle pour l'instant : SQL brut + migrations par `PRAGMA user_version` (`apps/server/src/telemetry/store.ts`). Si Drizzle est retenu en phase 4 pour `meridian.db`, réévaluer : soit `better-sqlite3` + Drizzle (et ce module natif dans l'image), soit Drizzle « sqlite-proxy » au-dessus de `node:sqlite`.
- Un `ExperimentalWarning` apparaît dans les logs au démarrage ; à surveiller lors du passage à Node 24 (API stabilisée).
- Si l'API change de façon incompatible dans une version mineure de Node 22, l'image est figée sur `node:22-alpine` : le CI (job `docker` + tests serveur) le détectera.
