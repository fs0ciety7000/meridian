# Meridian — Modèle de données

> **Auteurs :** Systems Designer (entités de jeu) + Tech Lead (stockage, schémas, migrations)
> **Relecteur :** QA/Balance (validations, politique géo)
> **Statut :** v0.2 — révisée : codes d'expédition (catalogue + générées), rareté par consigne, serveur Node/Hono + SQLite (Drizzle), plus de daily ni de série
> **Prérequis :** `docs/architecture.md`, `docs/gameplay-systems.md`

Conventions : TypeScript = source de vérité (schémas **Zod** dans `packages/content-schema`, types inférés) ; JSON pour le contenu ; SQLite (via Drizzle, serveur Node + Hono) pour le serveur ; Dexie pour le local. Identifiants pays = **ISO 3166-1 alpha-3** en majuscules. Coordonnées = `[lon, lat]` en degrés décimaux WGS84 (ordre GeoJSON, toujours).

---

## 1. Vue d'ensemble

```
CONTENU (statique, versionné dans git)        JEU (engine, sérialisable)          PERSISTANCE
──────────────────────────────────────        ──────────────────────────          ───────────
GeoManifest ── TopoJSON (110m/50m/10m)        RunState ─┬─ LegResult[]            Dexie (local)
PlayableEntity ── Territory                             ├─ MissionResult[]          runs, stamps, atlas,
FactDef ── CountryFacts                                 └─ RunScore                 profile, prefs
PromptDef (prédicat)                          Action / EngineEvent
Expedition ─ LegDef[6] ─ MissionDef[]         RaritySnapshot (entrée)             SQLite (serveur Hono)
Port, Title                                   ShareCode                           submissions, answer_counts,
                                                                                  rarity_snapshots, profiles
```

---

## 2. Entités géographiques et politique géo

### 2.1 `PlayableEntity`
```ts
type ISO3 = string;               // /^[A-Z]{3}$/
type LonLat = [lon: number, lat: number];
type ContinentCode = 'AF' | 'AN' | 'AS' | 'EU' | 'NA' | 'OC' | 'SA';

interface PlayableEntity {
  iso3: ISO3;
  iso2: string;                   // pour Intl.DisplayNames (noms localisés sans données)
  m49: string;                    // code ONU
  subregionM49: string;           // utilisé par la longue-vue
  continent: ContinentCode;       // continent « principal » (Russie: EU, Turquie: AS… liste explicite)
  continents: ContinentCode[];    // tous les continents touchés (missions)
  geomIds: string[];              // ids des géométries TopoJSON (métropole + territoires rattachés)
  aimPoint: LonLat;               // pole of inaccessibility de la plus grande partie (caméra, clavier)
  bbox: [number, number, number, number];
  areaKm2: number;
  isMicroState: boolean;          // < 2 000 km² → géométrie 10m + halo
  neighbors: ISO3[];              // frontières terrestres partagées (métropole)
  salience: number;               // 0..1, notoriété (prior de rareté)
  dataVersion: string;
}
```

### 2.2 `Territory`
```ts
interface Territory {
  id: string;                     // ex. 'GUF', 'GRL', 'NCL' (ISO3 propre s'il existe)
  sovereign: ISO3;                // 'FRA', 'DNK', 'FRA'
  geomId: string;
  plantable: boolean;             // false pour Antarctique (revendications), zones contestées
}
```

### 2.3 Politique géographique (décision à valider)
1. **Entités jouables** = 193 États membres de l'ONU + 2 États observateurs (Saint-Siège, Palestine) — la liste de l'ONU elle-même, critère externe et neutre.
2. **Territoires rattachés** : comptent pour leur État souverain (§12 de `gameplay-systems.md`).
3. **Territoires à statut contesté ou non membres** (Taïwan, Kosovo, Sahara occidental, Somaliland, Chypre du Nord…) : affichés comme terres, **frontières en pointillé**, **non plantables** (refus sans pénalité), jamais sujets ni réponses de consigne.
4. Frontières : variante Natural Earth « de facto », zones disputées en pointillé.
5. Toute réclamation → issue taguée `geo-policy`, revue par Tech Lead + Game Designer, réponse publique dans `docs/geo-policy-changelog.md`.

> ⚠️ Décision sensible : la règle 3 peut froisser des joueurs (notamment pour Taïwan). Alternative : rendre plantable sous une étiquette neutre (« Taïwan ») sans statut d'État et l'exclure seulement des consignes politiques. **À trancher par toi avant la phase 1.**

### 2.4 `GeoManifest`
```ts
interface GeoManifest {
  version: string;                // ex. '2026.11.0'
  source: { name: 'Natural Earth'; version: string; sha256: string };
  files: { lod: '110m' | '50m' | '10m-micro'; url: string; sha256: string; bytesGz: number }[];
  islandPolygons: string;         // url d'un index { geomId, partIndex } → island: true
  coastDistanceRaster: string;    // url, raster équirectangulaire 0,1° (missions côtières)
}
```

---

## 3. Faits et consignes

### 3.1 `FactDef` — registre des faits
```ts
type FactType = 'boolean' | 'number' | 'enum' | 'set';

interface FactDef {
  id: string;                     // 'landlocked', 'highestPointM', 'officialLanguages', 'flagColors'…
  type: FactType;
  unit?: string;                  // 'm', 'km2', 'hab'
  enumValues?: string[];
  category: PromptCategory;
  territorySensitive: boolean;    // vrai si la valeur change selon qu'on inclut les territoires → interdit en consigne
  description: { fr: string; en: string };
}
type PromptCategory = 'relief' | 'water' | 'borders' | 'climate' | 'society' | 'flag' | 'position';
```

### 3.2 `CountryFacts`
```ts
interface CountryFacts {
  iso3: ISO3;
  facts: Record<string, boolean | number | string | string[]>;
  sources: Record<string, { ref: string; retrieved: string }>;  // une source par fait (CIA Factbook, Wikidata, Natural Earth…)
  reviewedBy?: string;
  updatedAt: string;
}
```
Fichier : `content/countries/<ISO3>.json`. Contrainte CI : chaque fait utilisé par une consigne a une source.

### 3.3 Prédicats (DSL déclarative)
```ts
type Predicate =
  | { all: Predicate[] } | { any: Predicate[] } | { not: Predicate }
  | { fact: string; eq: boolean | number | string }
  | { fact: string; gt?: number; gte?: number; lt?: number; lte?: number }
  | { fact: string; includes: string }          // pour les 'set'
  | { fact: string; in: string[] }
  | { ctx: ContextRule };                        // étape contextuelle

type ContextRule =
  | { rule: 'neighborOf' } | { rule: 'sameInitial' }
  | { rule: 'otherHemisphere'; axis: 'NS' | 'EW' }
  | { rule: 'sameContinent' } | { rule: 'otherContinent' }
  | { rule: 'closerToPort' };
```
Les prédicats sont **données**, jamais du code : évaluables identiquement par le client, le serveur et l'outil de contenu.

### 3.4 `PromptDef`
```ts
interface PromptDef {
  id: string;                     // 'water.coast-on-two-oceans'
  category: PromptCategory;
  text: { fr: string; en: string };
  explain: { fr: string; en: string };   // texte éducatif de la note « fausse piste »
  predicate: Predicate;
  regional?: ContinentCode[];     // consigne volontairement régionale
  retiredBy?: string;            // id de la consigne de remplacement si retirée (erreur factuelle)
  // Calculé par prompt-forge (ne pas éditer à la main) :
  computed?: { validIso3: ISO3[]; validCount: number; continents: number; difficulty: number; dataVersion: string };
}

interface PromptLibrary {
  libraryVersion: number;         // incrémenté à chaque ajout/retrait ; référencé par les codes générés
  prompts: PromptDef[];
  ports: Port[];
  missions: MissionDef[];
}
```

---

## 4. Expédition (catalogue ou générée)

```ts
interface Port { id: string; name: { fr: string; en: string }; iso3: ISO3; lonLat: LonLat }

interface LegDef {
  index: 1 | 2 | 3 | 4 | 5 | 6;
  promptId: string;
  predicate: Predicate;           // copié/figé depuis PromptDef au moment de la publication
  text: { fr: string; en: string };
  explain: { fr: string; en: string };
  fallback?: Omit<LegDef, 'fallback' | 'index'>;   // pour étape contextuelle sans réponse
}

interface MissionDef { id: string; params?: Record<string, number>; text: { fr: string; en: string } }

type Difficulty = 'easy' | 'normal' | 'expert';

interface Expedition {
  code: string;                   // 'MER-0042' (catalogue) | 'MER-7KQ2N' (générée)
  source: 'catalog' | 'generated';
  catalogNumber?: number;         // catalogue uniquement
  title?: { fr: string; en: string };   // catalogue : « Les îles oubliées »
  seed?: number;                  // générée uniquement
  difficulty: Difficulty;
  libraryVersion: number;         // version de bibliothèque utilisée (générée) ou validée (catalogue)
  start: Port;
  meridianLon: number;            // multiple de 5
  legs: [LegDef, LegDef, LegDef, LegDef, LegDef, LegDef];
  missions: MissionDef[];         // 1 (MVP) à 3
  theme?: string;                 // thème du catalogue
  contentVersion: string;
  dataVersion: string;            // version des faits utilisée pour la validation
  hash: string;                   // sha256 du JSON canonique → intégrité client/serveur
  corrections?: { leg: number; altPredicate: Predicate; note: { fr: string; en: string } }[];
}
```
Catalogue : `content/expeditions/NNNN.json`. Générées : jamais stockées comme contenu, reconstruites à partir du code.

### 4.1 Format du code d'expédition
```
MER-NNNN                 catalogue (numéro sur 4 chiffres)
MER-<payload>            générée ; payload = base32 Crockford de (seed 30 bits | difficulté 2 bits | libraryVersion 8 bits) + 1 caractère de contrôle
```
Le caractère de contrôle détecte les fautes de frappe (saisie manuelle du code). Le code est insensible à la casse ; `O/0` et `I/1/L` sont confondus (propriété de Crockford).

---

## 5. État du moteur (`packages/engine`)

### 5.1 `RunState`
```ts
type RarityTier = 'known' | 'trail' | 'frontier' | 'incognita';
type Mode = 'expedition' | 'challenge' | 'chain' | 'sprint';

interface RunState {
  schema: 1;
  runId: string;                  // uuid v7
  mode: Mode;
  expeditionCode: string;         // 'MER-…'
  expeditionHash: string;
  attempt: 'first' | 'replay';    // seule la 1re partie terminée d'un code compte (tampons, stats, classements)
  challengeFrom?: string;         // ShareCode du défi reçu, le cas échéant
  balanceVersion: number;
  seed: number;
  locale: 'fr' | 'en';            // figée au démarrage (règle sameInitial)
  status: 'in_progress' | 'completed' | 'abandoned';
  currentLeg: number;             // 1..6, 7 = terminé
  camp: LonLat;                   // dernier camp valide (initialement le port)
  campIso3: ISO3 | null;
  usedIso3: ISO3[];
  spyglassUsedOnLeg: number | null;
  legs: LegResult[];
  missions: MissionResult[];
  startedAt: string; finishedAt?: string;
  activeMs: number;               // temps de jeu actif (hors app en arrière-plan)
}

interface LegResult {
  leg: number;
  pick: { lonLat: LonLat; iso3: ISO3 };        // quantifié à 0,01°
  valid: boolean;
  distanceKm: number;                          // 0 si fausse piste
  meridianCrossed: boolean;
  contextKey?: string;                         // étape contextuelle : iso3 du camp précédent
  rarity?: { tier: RarityTier; share: number; status: 'estimated' | 'provisional' | 'frozen' };
  spyglass: boolean;
  provisionalMoves: number;                    // télémétrie : déplacements du camp provisoire
  ms: number;
}

interface MissionResult { id: string; done: boolean }

interface RunScore {
  distanceKm: number;
  base: number; meridian: number; missions: number;
  renown: number;
  tiers: Record<RarityTier, number>;
  final: boolean;                 // true quand toutes les raretés sont 'frozen'
}
```

### 5.2 Actions et événements
```ts
type Action =
  | { type: 'START'; expedition: Expedition; mode: Mode; seed: number; locale: 'fr'|'en'; now: string }
  | { type: 'CONFIRM_CAMP'; lonLat: LonLat; iso3: ISO3; ms: number; provisionalMoves: number }
  | { type: 'USE_SPYGLASS' }
  | { type: 'APPLY_RARITY'; snapshot: RaritySnapshot }
  | { type: 'ABANDON'; now: string };

type EngineEvent =
  | { type: 'CAMP_REFUSED'; reason: 'not_playable' | 'already_used' | 'disputed' }
  | { type: 'CAMP_PLANTED'; leg: number; distanceKm: number }
  | { type: 'FALSE_TRAIL'; leg: number; explainKey: string }
  | { type: 'MERIDIAN_CROSSED'; leg: number }
  | { type: 'STAMP_AWARDED'; leg: number; iso3: ISO3; tier: RarityTier; status: 'estimated'|'provisional'|'frozen' }
  | { type: 'MISSION_COMPLETED'; id: string }
  | { type: 'EXPEDITION_COMPLETED'; score: RunScore };

declare function reduce(state: RunState | null, action: Action, deps: EngineDeps): { state: RunState; events: EngineEvent[] };
interface EngineDeps { facts: FactsIndex; entities: EntityIndex; balance: Balance; geo: GeoQueries }
```
Le moteur ne fait **aucun** accès réseau ni horloge implicite : tout passe par les actions et `deps`.

### 5.3 `RaritySnapshot`
```ts
interface RaritySnapshot {
  promptId: string;               // rareté PAR CONSIGNE (gameplay-systems §6.1)
  contextKey?: string;            // étape contextuelle uniquement
  total: number;                  // N(q) observé
  priorWeight: number;            // α utilisé
  entries: Record<ISO3, { n: number; share: number; tier: RarityTier }>;
  computedAt: string;
  balanceVersion: number;
}
```
Un instantané n'est jamais « figé » globalement : c'est le **tampon** qui fige son palier 24 h après la partie (`Stamp.dryAt`).
```

---

## 6. Profil et collection (local d'abord)

```ts
interface Profile {
  id: string;                     // uuid local ; associé à un jeton d'appareil du serveur si en ligne
  createdAt: string;
  displayName?: string;
  title?: string;
  seals: number;
  lifetimeKm: number;
  log: { expeditions: number; lastPlayedAt?: string };   // journal de bord (pas de série)
  cosmetics: { owned: string[]; equipped: { ink: string; camp: string; paper: string; projection: string } };
}

interface Stamp {
  id: string;                     // `${runId}:${leg}`
  iso3: ISO3;
  promptId: string;
  tier: RarityTier;
  status: 'provisional' | 'frozen';
  expeditionCode: string; leg: number;
  dryAt: string;                  // awardedAt + BALANCE.inkDryHours
  rotationDeg: number;            // seedée, pour un rendu stable
  awardedAt: string; frozenAt?: string;
}

interface PassportPage { iso3: ISO3; slots: Partial<Record<RarityTier, string /* stampId */>>; counts: Record<RarityTier, number> }

interface AtlasEntry { iso3: ISO3; firstVisit: string; intensity: 0 | 1 | 2 | 3 | 4 }

interface Preferences {
  theme: 'atlas' | 'nocturne' | 'system';
  locale: 'fr' | 'en';
  units: 'km' | 'mi';
  reducedMotion: 'system' | 'on' | 'off';
  lightMaterials: boolean; easyReading: boolean; colorblindStamps: boolean;
  labels: 'none' | 'annotated';
  sound: boolean; haptics: boolean;
}
```

### 6.1 Schéma Dexie (IndexedDB)
```ts
db.version(1).stores({
  runs:     'runId, expeditionCode, [expeditionCode+attempt], mode, status, startedAt',
  stamps:   'id, iso3, tier, status, promptId, dryAt',
  passport: 'iso3',
  atlas:    'iso3',
  profile:  'id',
  snapshots:'[promptId+contextKey], computedAt',
  outbox:   '++seq, kind, createdAt'      // soumissions en attente de réseau
});
```
Migrations : chaque `db.version(n)` a un `upgrade()` testé (Vitest + fake-indexeddb). Jamais de suppression de données joueur sans export préalable.

---

## 7. Serveur (Node + Hono + SQLite, schéma Drizzle)

SQLite en mode WAL sur le volume Coolify `/data`, répliqué en continu par Litestream vers Cloudflare R2 (`architecture.md` §7). Schéma défini en TypeScript (Drizzle) dans `apps/server/src/db/schema.ts` ; SQL équivalent ci-dessous pour lecture.

```sql
create table players (
  id text primary key,                    -- uuid v7
  token_hash text not null,               -- hash du jeton d'appareil (le jeton lui-même n'est jamais stocké)
  display_name text check (length(display_name) <= 24),
  created_at text not null                -- ISO 8601 UTC
);

create table catalog_expeditions (
  code text primary key,                  -- 'MER-0042'
  number integer not null unique,
  hash text not null,
  payload text not null,                  -- JSON Expedition
  published_at text not null
);

create table runs (
  id text primary key,                    -- runId
  player_id text not null references players(id),
  expedition_code text not null,          -- catalogue OU générée (pas de clé étrangère : les générées ne sont pas stockées)
  attempt text not null check (attempt in ('first','replay')),
  run_json text not null,                 -- RunState complet (rejouable)
  renown integer not null,
  distance_km integer not null,
  balance_version integer not null,
  library_version integer not null,
  challenge_from text,                    -- ShareCode du défi, si applicable
  created_at text not null
);
create unique index runs_first_attempt on runs(player_id, expedition_code) where attempt = 'first';
create index runs_board on runs(expedition_code, attempt, renown desc);

-- Une contribution par (joueur, consigne, contexte) : première rencontre uniquement
create table prompt_answers (
  player_id text not null references players(id),
  prompt_id text not null,
  context_key text not null default '',
  iso3 text not null,
  created_at text not null,
  primary key (player_id, prompt_id, context_key)
);

create table answer_counts (
  prompt_id text not null, context_key text not null default '', iso3 text not null,
  n integer not null default 0,
  primary key (prompt_id, context_key, iso3)
);

create table rarity_snapshots (
  prompt_id text not null, context_key text not null default '',
  payload text not null,                  -- JSON RaritySnapshot
  computed_at text not null,
  primary key (prompt_id, context_key)
);
```

**Règles serveur**
- `POST /api/runs` (une transaction) : vérifier le jeton → reconstruire l'expédition (catalogue : table ; générée : `generateExpedition` depuis le code) et comparer le `hash` → **rejouer** le run avec `packages/engine` (versions `balance`/`library` référencées) → refuser toute divergence → `insert runs` → pour chaque étape valide, `insert or ignore` dans `prompt_answers` ; si la ligne est nouvelle, `answer_counts.n += 1`.
- Le `attempt` est **déterminé par le serveur** (premier run terminé du joueur pour ce code), pas par le client.
- Job toutes les 10 min : recalcul des `rarity_snapshots` des consignes dont `answer_counts` a changé.
- Aucune table n'est exposée directement : tout passe par les routes Hono (validation Zod des entrées).
- Limites de débit : par jeton et par IP (`CF-Connecting-IP`).

> **Variante PocketBase** (si retenue, `architecture.md` §2.4) : mêmes collections (`players` → collection auth « invités », `runs`, `prompt_answers`, `answer_counts`, `rarity_snapshots`), règles d'API verrouillées (écriture uniquement via un hook `pb_hooks/runs.pb.js` qui rejoue le moteur bundlé), job de rareté via `cronAdd`.

---

## 8. Codes de partage et de défi (`ShareCode`)

Pour le lien de défi et le fantôme (sans backend) :
```
v2.<expeditionCode>.<legs>
legs = base64url( pour chaque étape : flags(1 o) + lon×100 (int24) + lat×100 (int24) )   → 7 o/étape, ~56 caractères
```
L'ISO3 n'est pas encodé : il est redérivé par `geoContains`, ce qui empêche de fabriquer un code incohérent. Le score affiché au destinataire est **recalculé** localement à partir de la route (pas de score déclaratif). URL : `https://meridian.cardormedia.com/x/MER-7KQ2N?r=v2.MER-7KQ2N.AbC…` (sous-domaine à confirmer).

---

## 9. Versioning

| Version | Où | Incrémentée quand |
|---|---|---|
| `geo.version` | `GeoManifest` | changement de géométrie/frontières |
| `dataVersion` | faits pays | correction/ajout de faits |
| `contentVersion` | expédition du catalogue | ré-édition d'une expédition |
| `libraryVersion` | bibliothèque de consignes/ports/missions | ajout ou retrait d'une entrée (les anciennes versions restent livrées pour rejouer les vieux codes) |
| `BALANCE.version` | engine | modification d'un paramètre d'équilibrage |
| `RunState.schema` | engine | changement de forme de l'état (migration obligatoire) |

Un run est toujours rejouable avec les versions qu'il référence (les anciennes versions de faits et de balance restent disponibles dans le dépôt).

---

## 10. Validations automatiques (CI)
- Schémas Zod de tous les JSON de `content/`.
- Chaque `PromptDef` : `validCount ∈ [8, 60]`, `continents ≥ 3` (sauf `regional`), aucun fait `territorySensitive`, aucun pays non jouable dans `validIso3`.
- Générateur : 100 000 graines × 3 difficultés → 0 expédition invalide ; codes aller-retour (encode/decode) sans perte.
- Chaque `Expedition` du catalogue : 6 étapes, pas de catégorie identique consécutive, étape contextuelle avec `fallback`, chaque mission atteignable (recherche d'une route valide par `prompt-forge`), `hash` correct.
- Géo : chaque `PlayableEntity.geomIds` existe dans les 3 LOD ; `aimPoint` contenu dans la géométrie.
