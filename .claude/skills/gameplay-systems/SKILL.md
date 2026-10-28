---
name: gameplay-systems
description: Règles exactes du jeu Meridian (à la demande, sans daily) — expéditions de 6 étapes identifiées par un code (catalogue ou générateur seedé), camp libre, validation par prédicat, distance orthodromique quantifiée, méridien, rareté par consigne (part cumulée, prior bayésien, séchage 24 h), 1re tentative vs rejeu, ordres de mission, longue-vue, Renommée, progression. À utiliser pour implémenter ou tester packages/engine, écrire/valider du contenu, ou évaluer un changement d'équilibrage.
---

# Skill : gameplay-systems (Meridian)

Source de vérité : `docs/gameplay-systems.md` (propriétaire : agent `systems-designer`). Constantes : `BALANCE` (§11) dans `packages/engine/src/balance.ts`.

## Résumé exécutable
1. `CONFIRM_CAMP {lonLat, iso3}` → quantifier `lonLat` à 0,001° (`quantize` de `@meridian/geo`), puis valider ce point quantifié.
2. **Refus sans pénalité** si : non jouable, déjà utilisé, zone contestée → événement `CAMP_REFUSED`, état inchangé.
3. `valid = evalPredicate(leg.predicate, facts[iso3], ctx)`.
4. Valide → `d = haversine(camp, lonLat, R=6371.0088)` ; `camp = lonLat` ; méridien franchi ? ; tampon (rareté).
   Fausse piste → `d = 0`, camp inchangé, pays consommé, `FALSE_TRAIL` avec texte `explain`.
5. Rareté : trier par part décroissante (égalité → ISO3), part cumulée au point milieu `m`, paliers `m<.50` known, `<.80` trail, `<.95` frontier, sinon incognita ; `n_eff = n_obs + α·π`, `π ∝ salience^β`. Longue-vue → palier plafonné à frontier.
6. Rareté **par consigne**, une contribution par joueur (première rencontre) ; palier provisoire à la partie, figé 24 h après (`inkDryHours`). Rejeu d'un code déjà terminé : ni tampon, ni stats, ni classement.
7. Générateur : `generateExpedition(seed, difficulty, library)` déterministe, contraintes de diversité, missions atteignables, repli catalogue après `generatorMaxRetries`.
8. Score : `base = Σ d·μ` (μ = 1 / 1,10 / 1,25 / 1,50) ; `méridien = min(k,2)·750` ; `ordres = base·0,05·nb` ; `Renommée = round(base + méridien + ordres)`.

## Invariants à tester (property-based, fast-check)
- Rejouer la même séquence d'actions donne un état et un score **identiques** (bit à bit après sérialisation).
- `0 ≤ d ≤ π·R` ; distance totale = somme des `d`.
- Un pays n'apparaît qu'une fois dans `usedIso3`.
- Une fausse piste ne modifie jamais `camp`.
- Les proportions de paliers sur une distribution simulée suivent ≈ 50/30/15/5.
- Le moteur n'appelle ni horloge, ni réseau, ni `Math.random`.
- `generateExpedition` : même (seed, difficulté, libraryVersion) ⇒ même `hash` ; 100 000 graines ⇒ 0 expédition invalide ; `decode(encode(code)) = code`.

## Modifier une règle
1. Mettre à jour `docs/gameplay-systems.md` (intention, formule, paramètres, cas limites, tests) — via `systems-designer`.
2. Incrémenter `BALANCE.version` si une constante change ; `RunState.schema` + migration si l'état change.
3. Ajouter/adapter les tests de référence avant le code.
4. Faire valider l'effet par `qa-balance` (simulation).

## Contenu
Une consigne est valide si : 8–60 réponses, ≥ 3 continents (sauf `regional`), faits sourcés, aucun fait `territorySensitive`, aucun territoire contesté. Vérifier avec `tools/prompt-forge validate <fichier>`.
