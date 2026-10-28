# Meridian — Modèle de données

> **Auteurs :** Systems Designer (entités de jeu) + Tech Lead (stockage, schémas, migrations)
> **Relecteur :** QA/Balance (validations, politique géo)
> **Statut :** v0.1
> **Prérequis :** `docs/architecture.md`, `docs/gameplay-systems.md`

Conventions : TypeScript = source de vérité (schémas **Zod** dans `packages/content-schema`, types inférés) ; JSON pour le contenu ; SQL Postgres (Supabase) pour le serveur ; Dexie pour le local. Identifiants pays = **ISO 3166-1 alpha-3** en majuscules. Coordonnées = `[lon, lat]` en degrés décimaux WGS84 (ordre GeoJSON, toujours).

---

## 1. Vue d'ensemble

```
CONTENU (statique, versionné dans git)        JEU (engine, sérialisable)          PERSISTANCE
──────────────────────────────────────        ──────────────────────────          ───────────
GeoManifest ── TopoJSON (110m/50m/10m)        RunState ─┬─ LegResult[]            Dexie (local)
PlayableEntity ── Territory                             ├─ MissionResult[]          runs, stamps, atlas,
FactDef ── CountryFacts                                 └─ RunScore                 profile, prefs
PromptDef (prédicat)                          Action / EngineEvent
Expedition ─ LegDef[6] ─ MissionDef[]         RaritySnapshot (entrée)             Supabase (serveur)
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
Les prédicats sont **données**, jamais du code : évaluables identiquement par le client, l'Edge Function et l'outil de contenu.

### 3.4 `PromptDef`
```ts
interface PromptDef {
  id: string;                     // 'water.coast-on-two-oceans'
  category: PromptCategory;
  text: { fr: string; en: string };
  explain: { fr: string; en: string };   // texte éducatif de la note « fausse piste »
  predicate: Predicate;
  regional?: ContinentCode[];     // consigne volontairement régionale
  // Calculé par prompt-forge (ne pas éditer à la main) :
  computed?: { validIso3: ISO3[]; validCount: number; continents: number; difficulty: number; dataVersion: string };
}
```

---

## 4. Expédition (contenu quotidien)

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

interface Expedition {
  id: string;                     // 'YYYY-MM-DD'
  number: number;                 // n° d'expédition depuis le lancement
  start: Port;
  meridianLon: number;            // multiple de 5
  legs: [LegDef, LegDef, LegDef, LegDef, LegDef, LegDef];
  missions: MissionDef[];         // 1 (MVP) à 3
  theme?: string;                 // saisons thématiques
  contentVersion: string;
  dataVersion: string;            // version des faits utilisée pour la validation
  hash: string;                   // sha256 du JSON canonique → intégrité client/serveur
  corrections?: { leg: number; altPredicate: Predicate; note: { fr: string; en: string } }[];
}
```
Fichier : `content/expeditions/YYYY-MM-DD.json`.

---

## 5. État du moteur (`packages/engine`)

### 5.1 `RunState`
```ts
type RarityTier = 'known' | 'trail' | 'frontier' | 'incognita';
type Mode = 'daily' | 'practice' | 'archive' | 'ghost' | 'chain' | 'sprint';

interface RunState {
  schema: 1;
  runId: string;                  // uuid v7
  mode: Mode;
  expeditionId: string;           // date (daily) ou 'practice:<seed>'
  expeditionHash: string;
  balanceVersion: number;
  seed: number;
  locale: 'fr' | 'en';            // figée au démarrage (règle sameInitial)
  status: 'in_progress' | 'completed' | 'expired';
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
  | { type: 'EXPIRE'; now: string };

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
  expeditionId: string;
  leg: number;
  contextKey?: string;
  total: number;                  // N(e) observé
  priorWeight: number;            // α utilisé
  entries: Record<ISO3, { n: number; share: number; tier: RarityTier }>;
  frozen: boolean;
  computedAt: string;
  balanceVersion: number;
}
```

---

## 6. Profil et collection (local d'abord)

```ts
interface Profile {
  id: string;                     // uuid local ; lié à l'auth anonyme Supabase si en ligne
  createdAt: string;
  displayName?: string;
  title?: string;
  seals: number;
  lifetimeKm: number;
  streak: { current: number; best: number; lastDay: string; restDaysUsed: string[] };
  cosmetics: { owned: string[]; equipped: { ink: string; camp: string; paper: string; projection: string } };
}

interface Stamp {
  id: string;                     // `${expeditionId}:${leg}`
  iso3: ISO3;
  tier: RarityTier;
  status: 'provisional' | 'frozen';
  expeditionId: string; leg: number;
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
  runs:     'runId, expeditionId, mode, status, startedAt',
  stamps:   'id, iso3, tier, status, expeditionId',
  passport: 'iso3',
  atlas:    'iso3',
  profile:  'id',
  snapshots:'[expeditionId+leg+contextKey], expeditionId',
  outbox:   '++seq, kind, createdAt'      // soumissions en attente de réseau
});
```
Migrations : chaque `db.version(n)` a un `upgrade()` testé (Vitest + fake-indexeddb). Jamais de suppression de données joueur sans export préalable.

---

## 7. Serveur (Supabase / Postgres)

```sql
create table expeditions (
  id text primary key,                 -- 'YYYY-MM-DD'
  number int not null unique,
  hash text not null,
  payload jsonb not null,
  publish_at timestamptz not null
);

create table players (
  id uuid primary key references auth.users(id),
  created_at timestamptz default now(),
  display_name text check (char_length(display_name) <= 24)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  expedition_id text references expeditions(id),
  player_id uuid references players(id),
  run jsonb not null,                  -- RunState complet (rejouable)
  renown int not null,
  distance_km int not null,
  balance_version int not null,
  created_at timestamptz default now(),
  unique (expedition_id, player_id)    -- une soumission Daily par joueur
);

create table answer_counts (
  expedition_id text, leg smallint, context_key text default '', iso3 char(3),
  n int not null default 0,
  primary key (expedition_id, leg, context_key, iso3)
);

create table rarity_snapshots (
  expedition_id text, leg smallint, context_key text default '',
  payload jsonb not null,              -- RaritySnapshot
  frozen boolean not null default false,
  computed_at timestamptz not null,
  primary key (expedition_id, leg, context_key)
);
```
- **RLS** : `submissions` insert uniquement via l'Edge Function (service role) ; lecture de ses propres lignes ; `rarity_snapshots` lecture publique ; `answer_counts` jamais exposé directement.
- **Edge Function `submit-expedition`** : vérifie `hash` et `balanceVersion`, **rejoue** le run avec `packages/engine`, refuse toute divergence, puis `insert submissions` + incrément `answer_counts` (une transaction).
- **pg_cron** : `rarity-snapshot` toutes les 10 min pour les expéditions ouvertes ; `freeze` à la bascule.

---

## 8. Encodage de partage (`ShareCode`)

Pour le texte de partage et le mode Fantôme (sans backend) :
```
v1.<expeditionNumber>.<legs>
legs = base64url( pour chaque étape : flags(1 o) + lon×100 (int24) + lat×100 (int24) )   → 7 o/étape, ~56 caractères au total
```
L'ISO3 n'est pas encodé : il est redérivé par `geoContains`, ce qui empêche de fabriquer un code incohérent. URL : `https://meridian.app/x/142?r=v1.142.AbC…`.

---

## 9. Versioning

| Version | Où | Incrémentée quand |
|---|---|---|
| `geo.version` | `GeoManifest` | changement de géométrie/frontières |
| `dataVersion` | faits pays | correction/ajout de faits |
| `contentVersion` | expédition | ré-édition d'une expédition |
| `BALANCE.version` | engine | modification d'un paramètre d'équilibrage |
| `RunState.schema` | engine | changement de forme de l'état (migration obligatoire) |

Un run est toujours rejouable avec les versions qu'il référence (les anciennes versions de faits et de balance restent disponibles dans le dépôt).

---

## 10. Validations automatiques (CI)
- Schémas Zod de tous les JSON de `content/`.
- Chaque `PromptDef` : `validCount ∈ [8, 60]`, `continents ≥ 3` (sauf `regional`), aucun fait `territorySensitive`, aucun pays non jouable dans `validIso3`.
- Chaque `Expedition` : 6 étapes, pas de catégorie identique consécutive, étape contextuelle avec `fallback`, chaque mission atteignable (recherche d'une route valide par `prompt-forge`), `hash` correct.
- Géo : chaque `PlayableEntity.geomIds` existe dans les 3 LOD ; `aimPoint` contenu dans la géométrie.
