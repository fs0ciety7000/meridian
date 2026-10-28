# Meridian

Un jeu de géographie où l'on répond en **plantant un camp sur un atlas d'expédition** : plus tu vas loin et plus ton choix est rare, plus ta route vaut de renommée.

- Documentation de conception : [`docs/`](docs/README.md)
- Déploiement (Coolify + Cloudflare) : [`docs/deployment.md`](docs/deployment.md)

## Développement

Prérequis : Node ≥ 22.12, pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev            # front sur http://localhost:5173
pnpm test           # tests unitaires (Vitest)
pnpm test:e2e       # build + Playwright contre le serveur de production
pnpm lint && pnpm typecheck && pnpm format:check
pnpm geo            # régénère content/geo depuis Natural Earth (pnpm geo:check en CI)
pnpm textures       # régénère les textures papier/grain
docker compose -f deploy/docker-compose.yml up --build   # image de production en local
```

## Structure

| Dossier                   | Rôle                                             |
| ------------------------- | ------------------------------------------------ |
| `apps/web`                | PWA React (Vite) — carte, interface              |
| `apps/server`             | serveur Hono : front buildé + `/api`             |
| `packages/engine`         | règles du jeu (TS pur, isomorphe)                |
| `packages/geo`            | calculs géographiques partagés                   |
| `packages/content-schema` | schémas Zod                                      |
| `packages/design-tokens`  | tokens du design system → CSS/TS                 |
| `content/geo`             | politique géo + données générées (Natural Earth) |
| `tools/geo-pipeline`      | Natural Earth → TopoJSON + métadonnées           |
| `deploy/`                 | Dockerfile, docker-compose                       |

Données géographiques : [Natural Earth](https://www.naturalearthdata.com/) (domaine public). Polices : licence SIL OFL.
