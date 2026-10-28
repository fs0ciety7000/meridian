---
name: data-model
description: Modèle de données de Meridian — entités jouables et politique géo, faits pays sourcés, prédicats déclaratifs, Expedition, RunState/actions/événements du moteur, RaritySnapshot par consigne, profil/passeport/atlas (Dexie), tables SQLite/Drizzle du serveur Hono, codes d'expédition, ShareCode et versioning. À utiliser pour créer/modifier un schéma Zod, un fichier de contenu, une table SQL, une migration Dexie ou un format d'échange.
---

# Skill : data-model (Meridian)

Source de vérité : `docs/data-model.md` (propriétaires : `systems-designer` pour les entités de jeu, `tech-lead` pour le stockage).

## Conventions
- Pays : **ISO 3166-1 alpha-3** majuscules (`iso2` seulement pour `Intl.DisplayNames`).
- Coordonnées : `[lon, lat]` WGS84 (ordre GeoJSON), quantifiées à 0,001° (`BALANCE.coordQuantumDeg`) dans tout état persistant ; la validation porte sur le point quantifié.
- Expéditions : code `MER-…` (catalogue `MER-NNNN`, générée = base32 Crockford seed+difficulté+libraryVersion+contrôle) ; horodatages : ISO 8601 UTC.
- Textes joueur : objets `{ fr, en }` — jamais une seule langue.
- Schémas : Zod dans `packages/content-schema`, types inférés (`z.infer`) ; jamais d'interface dupliquée à la main.

## Procédure pour un changement de modèle
1. Modifier le schéma Zod + `docs/data-model.md` dans le même commit.
2. Classer le changement et incrémenter la bonne version :
   - géométrie → `geo.version` ; faits → `dataVersion` ; expédition du catalogue → `contentVersion` ; bibliothèque de consignes/ports/missions → `libraryVersion` (garder les anciennes) ; constante → `BALANCE.version` ; forme de `RunState` → `RunState.schema` (+ migration de l'état sérialisé).
3. **Local (Dexie)** : nouvelle `db.version(n)` avec `upgrade()` testé (fake-indexeddb). Ne jamais supprimer de données joueur sans export.
4. **Serveur (SQLite/Drizzle)** : modifier `apps/server/src/db/schema.ts`, générer la migration (`drizzle-kit generate`), la tester sur une copie de la base ; aucune table exposée directement : accès uniquement via des routes Hono avec validation Zod ; `attempt` et compteurs de rareté calculés côté serveur uniquement.
5. Mettre à jour les validations CI (`data-model.md` §10).

## Politique géo (rappel, §2.3)
Entités jouables = 193 membres ONU + 2 observateurs ; territoires rattachés comptent pour l'État souverain ; territoires contestés affichés en pointillé, non plantables, jamais en consigne. Toute modification de cette politique exige l'accord du Game Designer et du Tech Lead et une entrée dans `docs/geo-policy-changelog.md`.

## Faits pays
Chaque fait utilisé en consigne a une source `{ ref, retrieved }`. Un fait dont la valeur change selon l'inclusion des territoires est marqué `territorySensitive: true` et publie une lecture `metro` ; une consigne qui l'utilise n'est acceptée que si ses réponses sont identiques dans les deux lectures.

## Sortie attendue
Schéma + doc + migration(s) + tests cohérents, version incrémentée, aucune donnée joueur perdue.
