# Journal de la politique géographique

Toute modification de `content/geo/policy.json` ajoute une entrée ici (data-model §2.3) et incrémente `policy.version`.

## v1 — 2026-10-28 (phase 0)
- **Jouables (195)** : les 193 États membres de l'ONU + 2 États observateurs (Saint-Siège, Palestine).
- **Territoires rattachés** : comptent pour leur État souverain (Groenland → Danemark, Guyane → France, Hong Kong → Chine, Porto Rico → États-Unis, bases britanniques de Chypre → Royaume-Uni, Baïkonour → Kazakhstan, Guantánamo → Cuba…).
- **Non plantables** : Antarctique ; unités que Natural Earth classe « disputed » ou « indeterminate » et qui ne sont pas des États membres/observateurs (Sahara occidental, Kosovo, Siachen, îles Spratly, Malouines, Gibraltar, Territoire britannique de l'océan Indien, zone tampon de Chypre…) ; États non membres de l'ONU (Taïwan, Somaliland, Chypre du Nord).
- Données : Natural Earth 5.1.2, frontières « de facto ».
- ⚠️ **Décision encore ouverte** (voir `data-model.md` §2.3) : rendre Taïwan plantable sous une étiquette neutre. Le changement se limite à `policy.json` + une entrée ici.
- Conséquence notable de la règle « disputed » : les Malouines et Gibraltar ne sont pas plantables, bien qu'administrés par le Royaume-Uni (règle neutre et uniforme plutôt qu'un arbitrage au cas par cas).
