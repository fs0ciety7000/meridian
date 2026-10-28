# Meridian — Déploiement (Coolify + Cloudflare)

> **Auteur :** Tech Lead · **Statut :** phase 0 déployée (front + `/api/health`) · **Prérequis :** `docs/architecture.md` §7

## État actuel (2026-10-28)
| Élément | Valeur |
|---|---|
| Projet Coolify | **Meridian** (`ipi43b1wwzcakgj5evtuchy5`), environnement `production` |
| Application | **meridian** (`pxpelh5odsogybzd8qnw6ry3`), serveur `localhost` (152.53.176.13) |
| Source | GitHub App privée, dépôt `fs0ciety7000/meridian`, branche **`ccr-2d971156-1rp7as`** (auto-deploy à chaque push) — à basculer sur `main` une fois la branche fusionnée |
| Build | Dockerfile `/deploy/Dockerfile`, port 3000, *Include Source Commit in Build* activé |
| Stockage | volume nommé `pxpelh5odsogybzd8qnw6ry3-meridian-data` → `/data` |
| Health check | `GET http://127.0.0.1:3000/api/health` (hôte forcé à `127.0.0.1` : indépendant de la résolution IPv6 de `localhost`) |
| Variables | `APP_VERSION=0.1.0` |
| DNS | `A meridian.cardormedia.com → 152.53.176.13`, proxifié (créé via l'API Cloudflare) |
| Zone `cardormedia.com` (déjà en place, partagée avec les autres sites) | SSL **Full (strict)**, *Always Use HTTPS* **off** (le challenge Let's Encrypt de Coolify passe), Rocket Loader **off** |
| Recette | pas encore créée (pas de branche `staging`) |

Les sections suivantes décrivent la procédure complète, utile pour recréer l'environnement ou ajouter la recette.


| | Production | Recette (proposé) |
|---|---|---|
| URL | `https://meridian.cardormedia.com` | `https://meridian-staging.cardormedia.com` |
| Branche | `main` | `staging` |
| Coolify | `coolify.fs0ciety.org` | idem |
| Image | `deploy/Dockerfile` (une seule image : serveur Hono + PWA buildée) | idem |

---

## 1. Ce que contient l'image

- **Build** (Node 22 alpine + pnpm) : `pnpm install --frozen-lockfile` puis `pnpm build` (tokens → front Vite → bundle serveur esbuild).
- **Runtime** (Node 22 alpine, utilisateur `node`, ~63 Mo compressés) : `server.mjs` (bundle unique, pas de `node_modules`) + `public/` (front buildé). Le volume `/data` appartient à `node`.
- **Healthcheck Docker** intégré : `GET /api/health` toutes les 30 s.
- **Arrêt propre** sur `SIGTERM` (requêtes en cours terminées, sortie < 10 s).

Vérifié localement :
```bash
docker build -f deploy/Dockerfile --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) -t meridian .
docker run --rm -p 3000:3000 -v meridian-data:/data meridian
curl -s localhost:3000/api/health
# {"status":"ok","version":"0.0.0","commit":"…","uptimeS":2,"dataDir":{"writable":true}}
```
ou `docker compose -f deploy/docker-compose.yml up --build`.

> Si Docker Hub limite les téléchargements (erreur 429) : `--build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine`.
> Derrière un proxy TLS intercepteur (CI, bac à sable) : `docker build --network host --secret id=extra_ca,src=<bundle CA.pem> …` (secret de build optionnel, absent sur Coolify).

## 2. Variables d'environnement

| Variable | Défaut (image) | Rôle |
|---|---|---|
| `PORT` | `3000` | port HTTP du conteneur |
| `LISTEN_HOST` | `::` | interface d'écoute, double pile (`localhost` résout en `::1` sous Alpine). Volontairement **pas** `HOST`, que Coolify injecte (`HOST=0.0.0.0`) |
| `STATIC_DIR` | `/app/public` | front buildé |
| `DATA_DIR` | `/data` | volume persistant ; `/api/health` renvoie **503** s'il n'est pas accessible en écriture |
| `APP_VERSION` | `0.0.0` (build arg) | affiché dans `/api/health` |
| `GIT_COMMIT` | build arg `SOURCE_COMMIT` | affiché dans `/api/health` |
| `TELEMETRY_ADMIN_TOKEN` | *(vide)* | **secret** : jeton *Bearer* de `GET /api/telemetry/summary` ; route désactivée (404) s'il est vide. Générer avec `openssl rand -base64 32` |
| *(phase 4)* `JWT_SECRET`, `R2_*` | — | API, sauvegarde Litestream → R2 |

Seul secret à ce stade : `TELEMETRY_ADMIN_TOKEN` (optionnel). Les secrets futurs se déclarent **uniquement** dans Coolify (jamais dans git) ; modèle : `deploy/.env.example`.

---

## 3. Coolify — créer l'application (une fois par environnement)

1. **Projects → (projet Meridian) → + New → Resource → Private Repository (with GitHub App)**, dépôt `fs0ciety7000/meridian`, branche `main` (ou `staging` pour la recette).
2. **Build Pack : `Dockerfile`**
   - *Base Directory* : `/`
   - *Dockerfile Location* : `/deploy/Dockerfile`
   - *Ports Exposes* : `3000`
3. **Domains** : `https://meridian.cardormedia.com` (le `https://` indique à Coolify de gérer le certificat).
4. **Persistent Storage → + Add → Volume Mount** : destination `/data` (nom libre, p. ex. `meridian-data`). Ne pas utiliser de *bind mount* vers un dossier `root` : le conteneur tourne en `node`, et la santé passerait à 503 (c'est voulu, c'est le signal).
5. **Health Check** : activé, hôte `127.0.0.1`, chemin `/api/health`, port `3000`, schéma `http`.
6. **Advanced** : activer *Include Source Commit in Build* (Coolify passe alors `SOURCE_COMMIT` à l'image → visible dans `/api/health`).
7. **Environment Variables** : `APP_VERSION=0.1.0` (optionnel) ; `TELEMETRY_ADMIN_TOKEN` (phase 3, cocher *Is Literal* / secret, jamais dans git).
8. **Webhooks / Auto Deploy** : activé (déploiement à chaque push sur la branche via la GitHub App).
9. **Deploy**, puis vérifier les logs : `meridian 0.1.0 (<commit>) listening on 0.0.0.0:3000`.

Répéter avec la branche `staging` et le domaine `meridian-staging.cardormedia.com` pour la recette.

**Rollback** : *Deployments* → choisir un déploiement précédent → *Redeploy* (Coolify conserve les images précédentes).

---

## 4. Cloudflare — zone `cardormedia.com`

### 4.1 DNS
| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| `A` (et `AAAA` si IPv6) | `meridian` | IP publique du serveur Coolify | **Proxied** (nuage orange) |
| `A` | `meridian-staging` | idem | Proxied |

### 4.2 SSL/TLS
- **SSL/TLS → Overview : `Full (strict)`.**
- Certificat d'origine — deux options :
  - **A. Let's Encrypt géré par Coolify (le plus simple).** Coolify (Traefik) obtient le certificat par challenge HTTP-01 sur le port 80. Pour que le challenge passe à travers le proxy Cloudflare, **`/.well-known/acme-challenge/*` ne doit pas être redirigé** : désactiver *Edge Certificates → Always Use HTTPS* (Traefik redirige déjà HTTP → HTTPS) ou créer une règle qui l'exempte. Si la première émission échoue, passer temporairement en `Full`, déployer, puis revenir en `Full (strict)`.
  - **B. Cloudflare Origin Certificate (15 ans, aucun renouvellement).** *SSL/TLS → Origin Server → Create Certificate* pour `meridian.cardormedia.com` et `meridian-staging.cardormedia.com`, puis l'installer dans Coolify (*Servers → Proxy → certificats personnalisés / configuration dynamique Traefik*) et utiliser `https://` sans Let's Encrypt pour ces domaines. Plus robuste, mais le site n'est alors joignable **que** via Cloudflare (ce qui est souhaitable).
- **Edge Certificates** : *Minimum TLS Version* 1.2, *Automatic HTTPS Rewrites* activé.

> ⚠️ À valider au premier déploiement : je n'ai pas accès à la configuration de ton proxy Coolify ; l'option A est la plus rapide à tester, l'option B la plus pérenne.

### 4.3 Cache et performances
Le serveur envoie déjà les bons en-têtes (`architecture.md` §7.4) ; Cloudflare les respecte :

| Chemin | `Cache-Control` envoyé | Effet Cloudflare |
|---|---|---|
| `/assets/*` (JS, CSS, polices, textures — noms hashés) | `public, max-age=31536000, immutable` | mis en cache à l'edge, `cf-cache-status: HIT` |
| `/`, `/index.html`, routes SPA (`/x/…`), `/sw.js`, `/manifest.webmanifest` | `no-cache` | toujours revalidé (sinon la PWA ne se met plus à jour) |
| `/api/*` | `no-store` | jamais mis en cache (phase 4 : `rarity`/`expeditions` passeront en `s-maxage` court) |

Réglages :
- *Caching → Configuration → Browser Cache TTL* : **Respect Existing Headers**.
- *Speed → Optimization* : **Rocket Loader désactivé** (il casse les modules ES) ; *Early Hints* possible.
- Brotli : géré automatiquement par Cloudflare.
- Aucune *Cache Rule* n'est nécessaire en phase 0. Ne **jamais** créer de règle « Cache Everything » qui engloberait `index.html` ou `sw.js`.

### 4.4 (Optionnel) Fermer l'origine
Pare-feu du serveur : n'accepter 80/443 que depuis les [plages IP Cloudflare](https://www.cloudflare.com/ips/) (et l'IP d'administration pour Coolify sur son propre domaine).

---

## 5. Vérification après déploiement

```bash
H=https://meridian.cardormedia.com

curl -s $H/api/health
# → {"status":"ok","version":"0.1.0","commit":"<sha>",…,"dataDir":{"writable":true}}

curl -sI $H/ | grep -iE '^HTTP|cache-control|cf-cache-status|content-security-policy'
# → 200, cache-control: no-cache, cf-cache-status: DYNAMIC (ou BYPASS), CSP stricte

A=$(curl -s $H/ | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -sI $H$A | grep -iE 'cache-control|cf-cache-status'   # 2e appel → HIT
curl -sI $H$A | grep -iE 'cf-cache-status'

curl -sI $H/x/MER-7KQ2 | grep -iE '^HTTP|cache-control'      # 200 + no-cache (route SPA)
curl -sI $H/assets/absent.js | grep -E '^HTTP'               # 404 (jamais le HTML)
```

Critère de sortie de phase 0 (`development-plan.md`) : un push sur `staging` déploie automatiquement la recette en HTTPS, `/api/health` répond 200 via Cloudflare, et les en-têtes ci-dessus sont conformes.

## 6. Télémétrie anonyme (phase 3)

`POST /api/telemetry` (lots d'au plus 50 événements, 32 Ko, schéma `packages/content-schema/src/telemetry.ts`) écrit dans `DATA_DIR/telemetry.db` (SQLite WAL, `node:sqlite`, ADR 0001). Ni IP ni identifiant stable : jour UTC + identifiant de session aléatoire par lancement de l'app. Événements bruts purgés après 180 jours, agrégats conservés. Limites : 30 requêtes/min par IP (clé hachée en mémoire, jamais écrite), 20 000 événements/min au total.

```bash
curl -s -H "Authorization: Bearer $TELEMETRY_ADMIN_TOKEN" "$H/api/telemetry/summary?minN=20" | jq '.prompts[:10]'
```
Indicateurs : `prompts[]` (taux de fausse piste, temps moyen, longue-vue, déplacements du camp, paliers), `expeditions[]` (démarrées/terminées/abandonnées, durée médiane), `plantFailed` (signalements par raison).

---

## 7. Sauvegarde et restauration (avant Litestream)

Tant que Litestream n'est pas en place (phase 4), la sauvegarde est manuelle ou planifiée par cron sur le serveur Coolify. Scripts : `deploy/backup.sh`, `deploy/restore.sh` (POSIX `sh` + Docker ; aucun `sqlite3` requis sur l'hôte).

**Sauvegarde** — à chaud, l'application continue de tourner :
```bash
# conteneur : nom, id ou préfixe (sur Coolify, l'uuid de l'application)
deploy/backup.sh pxpelh5odsogybzd8qnw6ry3 /root/meridian-backups
# → /root/meridian-backups/meridian-backup-20261028T212504Z.tar.gz
```
Chaque base `*.db` de `/data` est copiée par l'**API backup de SQLite** (`node:sqlite`, exécutée dans le conteneur) : copie cohérente même pendant les écritures, WAL compris, puis `PRAGMA integrity_check`. Archive : `data/` + `manifest.json` (date, version, commit, sha256 de chaque fichier). Les `-wal`/`-shm` ne sont pas archivés (la copie est autonome).

Cron quotidien conseillé (garde les 14 dernières) :
```cron
17 3 * * * BACKUP_KEEP=14 /opt/meridian/deploy/backup.sh pxpelh5odsogybzd8qnw6ry3 /root/meridian-backups >> /var/log/meridian-backup.log 2>&1
```
Copier ensuite les archives hors du serveur (R2, autre machine) : une sauvegarde sur le même disque ne protège pas d'une perte du serveur.

**Restauration**
1. Coolify → application → **Stop** (le script refuse de tourner si un conteneur en marche utilise le volume).
2. ```bash
   deploy/restore.sh /root/meridian-backups/meridian-backup-20261028T212504Z.tar.gz \
     pxpelh5odsogybzd8qnw6ry3-meridian-data
   # 3e argument optionnel : image avec node ≥ 22.16 (défaut node:22-alpine, déjà présente sur le serveur)
   ```
   Dans un conteneur jetable : extraction → vérification sha256 + `integrity_check` de chaque fichier → contenu actuel du volume déplacé dans `/data/.pre-restore-<horodatage>/` (rien n'est supprimé) → copie des fichiers de l'archive. Volume absent : il est créé.
3. Coolify → **Start**, puis `curl -s $H/api/health` (200) et `…/api/telemetry/summary`.
4. Une fois validé, supprimer `/data/.pre-restore-*` (`docker run --rm -v <volume>:/data alpine rm -rf /data/.pre-restore-<horodatage>`).

**Testé en local le 2026-10-28** (image construite depuis `deploy/Dockerfile`) : volume nommé, 3 lots écrits, sauvegarde pendant 20 écritures concurrentes, écriture supplémentaire après sauvegarde, conteneur **et volume détruits**, refus de restaurer avec l'application démarrée (code 1), restauration dans un volume neuf, redémarrage : `/api/health` 200, résumé identique à l'instantané de sauvegarde, écriture postérieure absente ; restauration par-dessus des données existantes : ancien contenu conservé dans `.pre-restore-*`. Testé aussi avec l'image `node:22-alpine` comme outil.

---

## 8. Dépannage
| Symptôme | Cause probable | Action |
|---|---|---|
| `/api/health` → 503 `degraded` | volume `/data` absent ou non accessible en écriture par `node` | vérifier *Persistent Storage* (volume nommé, pas de bind mount root) |
| Erreur 525/526 Cloudflare | certificat d'origine absent/invalide en `Full (strict)` | §4.2 (option A : challenge bloqué par une redirection ; option B : certificat non installé) |
| L'app ne se met pas à jour après déploiement | `index.html`/`sw.js` mis en cache par une règle Cloudflare | supprimer la règle, *Purge Everything* une fois |
| `restore.sh` : « volume is in use » | l'application tourne encore | *Stop* dans Coolify, puis relancer |
| `ExperimentalWarning: SQLite is an experimental feature` au démarrage | `node:sqlite` est encore marqué expérimental dans Node 22 | sans effet (ADR 0001) |
| Build Coolify : 429 sur `node:22-alpine` | limite Docker Hub | build arg `NODE_IMAGE=mirror.gcr.io/library/node:22-alpine` ou identifiants Docker Hub sur le serveur |
| Page blanche, erreurs CSP en console | script/style tiers ajouté | l'ajouter explicitement dans `apps/server/src/app.ts` (CSP), jamais `unsafe-eval`. Déjà autorisé : le beacon Cloudflare Web Analytics (`static.cloudflareinsights.com`, `cloudflareinsights.com`) injecté par la zone |
