# Kit de playtest — MVP (phase 3, tâche 3.6)

Les critères « Jouable », « Précis » et « Robuste » du MVP (`development-plan.md` §Phase 3) ne se valident qu'avec de vrais joueurs et de vrais appareils. Ce kit décrit qui recruter, quoi leur faire jouer, quoi leur demander et comment lire les chiffres. Les seuils d'alerte détaillés par consigne sont dans `docs/reviews/mvp-qa.md`.

## 1. Recrutement

- **≥ 15 joueurs**, **≥ 10 expéditions chacun**, sur **2 semaines** (jouer quand on veut : pas de rendez-vous quotidien).
- Mélange : un tiers d'amateurs de géographie, un tiers de joueurs occasionnels, un tiers qui ne jouent jamais à des jeux de géographie.
- **Matrice d'appareils** (critère « Robuste ») — au moins un joueur par ligne :

| Plateforme | Version minimale | Points à observer |
|---|---|---|
| iPhone, Safari | iOS 17 | installation « Sur l'écran d'accueil », zone de pouce, loupe à l'appui long, son |
| Android, Chrome | Android 12 | installation PWA, partage de la carte postale (image), vibrations |
| Desktop Chrome / Firefox / Safari | versions courantes | clavier (`/`, flèches, Entrée), molette, survol |
| Un appareil d'entrée de gamme | — | passage automatique en « matière allégée », fluidité des gestes |

## 2. Consignes aux joueurs (à envoyer telles quelles)

1. Ouvrez **https://meridian.cardormedia.com** et jouez le **premier carnet** proposé, sans aide.
2. Pendant deux semaines, jouez quand vous voulez : des expéditions du **Carnet** et des **nouvelles expéditions** dans les trois difficultés.
3. Au moins une fois : **envoyez la carte postale** (lien de défi) à un autre testeur et **relevez** un défi reçu.
4. Au moins une fois : **installez l'app** puis jouez **en mode avion**.
5. Chaque fois qu'un camp ne se pose pas là où vous visiez, notez-le (pays visé, appareil) dans le formulaire.

Les statistiques anonymes sont activées par défaut (désactivables dans « À propos »). Demandez aux testeurs de les laisser actives pendant le test.

## 3. Questionnaire (fin de semaine 1 et fin de semaine 2)

| # | Question | Critère MVP |
|---|---|---|
| Q1 | La carte postale vous donne-t-elle envie de la partager ? (oui / non) | « Beau » : ≥ 70 % de oui |
| Q2 | Combien de fois n'avez-vous pas pu planter où vous vouliez ? (nombre, pays) | « Précis » : < 2 % des camps |
| Q3 | Avez-vous compris le premier carnet sans explication ? (1–5) | onboarding |
| Q4 | Une consigne vous a-t-elle paru fausse ou injuste ? Laquelle ? | faits contestés |
| Q5 | Avez-vous rencontré un plantage, un écran bloqué, une perte de partie ? (appareil, navigateur) | « Robuste » : 0 crash |
| Q6 | Qu'est-ce qui vous a fait rejouer ? Qu'est-ce qui vous a fait arrêter ? | rétention |
| Q7 | Note globale (1–10) et une phrase pour un ami | vision §8 |

## 4. Lire les chiffres

Le résumé agrégé est servi par le serveur, protégé par un jeton :

```sh
# Le jeton est dans Coolify → application « meridian » → Environment Variables → TELEMETRY_ADMIN_TOKEN
curl -s -H "Authorization: Bearer $TELEMETRY_ADMIN_TOKEN" \
  "https://meridian.cardormedia.com/api/telemetry/summary?minN=20" | jq
```

| Indicateur (champ du résumé) | Cible MVP | Si hors cible |
|---|---|---|
| `prompts[].falseTrailRate` (consignes avec n ≥ 20) | 10 % – 45 % | > 45 % : reformuler ou retirer la consigne ; < 10 % : la réserver au mode Facile |
| `expeditions[].medianDurationMs` | 3 – 6 min | trop long : consignes plus célèbres ; trop court : plus d'étapes contextuelles |
| `plantFailed.total` / camps posés | < 2 % | lire `byReason` : `not_playable` = zones côtières ou micro-États (snap, halos) |
| `expeditions[].completionRate` | ≥ 80 % | regarder l'étape d'abandon (`legFalseTrailRate`) |
| `prompts[].tiers` | ≈ 50 / 30 / 15 / 5 | calibrer `BALANCE.salienceExponent` puis `tierMultipliers` |

Calibrage (QA + Systems Designer) : toute modification de `packages/engine/src/balance.ts` incrémente `BALANCE.version` et passe par une revue QA.

## 5. Après le playtest

1. Rapport `docs/reviews/playtest-1.md` : chiffres, verbatims, bugs par appareil.
2. Corrections de contenu → `pnpm facts && pnpm forge`, puis **publication de la bibliothèque v1** (`content/library/published.json`) : à partir de là, tout changement de consigne passe par `libraryVersion` 2.
3. Sauvegarde du volume avant chaque déploiement de calibrage (`deploy/backup.sh`, `docs/deployment.md` §7).
