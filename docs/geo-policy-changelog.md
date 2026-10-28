# Journal de la politique géographique

Toute modification de `content/geo/policy.json` ajoute une entrée ici (data-model §2.3) et incrémente `policy.version`.

## v2 — 2026-10-28 (phase 0, données `ne-5.1.2+policy-2+pipeline-4`)
- **Constat** : la couche admin-0 « countries » de Natural Earth 5.1.2 inclut certaines zones au statut contesté dans le polygone d'un État membre ; elles étaient donc plantables pour cet État, contrairement à la règle 3 (data-model §2.3). Les couches 110m/50m englobaient aussi de petites unités qui n'existent qu'en 10m.
- **Règle appliquée** : une zone au statut contesté reste non plantable même quand la géométrie source la rattache à un État ; elle est découpée du polygone à tous les niveaux de détail et affichée en pointillé. Découpe faite à partir de la couche Natural Earth des zones disputées (`ne_50m_admin_0_breakaway_disputed_areas` pour 110m/50m, `ne_10m_admin_0_disputed_areas` pour 10m, v5.1.2, empreintes dans `tools/geo-pipeline/sources.json`), liste explicite dans `policy.json` → `carveOuts` :
  - **Sahara occidental** : la partie administrée par le Maroc (B19) rejoint l'unité existante `SAH` ; le Sahara occidental forme désormais une seule unité non plantable, à tous les niveaux. Le Maroc n'a plus de frontière terrestre avec la Mauritanie.
  - **Crimée** (unité `B89`) : non plantable, sans État de rattachement (ni la Russie qui l'administre, ni l'Ukraine qui la revendique, cf. résolution 68/262 de l'Assemblée générale de l'ONU).
  - **Plateau du Golan** (unité `B16`) : même situation (zone administrée par Israël, revendiquée par la Syrie, typée « Indeterminate » par Natural Earth) ; non plantable, sans État de rattachement.
- **Cohérence entre niveaux de détail** : les unités non jouables qui n'existent qu'en 10m sont découpées des polygones 110m/50m des autres États, pour qu'un même point ait la même réponse partout : bases britanniques d'Akrotiri et Dhekelia (territoires du Royaume-Uni, plus de double couverture avec Chypre), zone tampon de Chypre, Bir Tawil, champ de glace de Patagonie du Sud, île Brésilienne, glacier de Siachen (110m), Gibraltar (110m).
- Les identifiants des nouvelles unités sont les codes `BRK_A3` de Natural Earth (`B89`, `B16`).
- Les autres zones disputées de la couche Natural Earth (Cachemire, Kouriles, Abkhazie, Transnistrie…) restent attribuées comme dans la couche source (règle 4) : toute extension de la liste passe par `carveOuts` et une entrée ici.

## v1 — 2026-10-28 (phase 0)
- **Jouables (195)** : les 193 États membres de l'ONU + 2 États observateurs (Saint-Siège, Palestine).
- **Territoires rattachés** : comptent pour leur État souverain (Groenland → Danemark, Guyane → France, Hong Kong → Chine, Porto Rico → États-Unis, bases britanniques de Chypre → Royaume-Uni, Baïkonour → Kazakhstan, Guantánamo → Cuba…).
- **Non plantables** : Antarctique ; unités que Natural Earth classe « disputed » ou « indeterminate » et qui ne sont pas des États membres/observateurs (Sahara occidental, Kosovo, Siachen, îles Spratly, Malouines, Gibraltar, Territoire britannique de l'océan Indien, zone tampon de Chypre…) ; États non membres de l'ONU (Taïwan, Somaliland, Chypre du Nord).
- Données : Natural Earth 5.1.2, frontières « de facto ».
- ⚠️ **Décision encore ouverte** (voir `data-model.md` §2.3) : rendre Taïwan plantable sous une étiquette neutre. Le changement se limite à `policy.json` + une entrée ici.
- Conséquence notable de la règle « disputed » : les Malouines et Gibraltar ne sont pas plantables, bien qu'administrés par le Royaume-Uni (règle neutre et uniforme plutôt qu'un arbitrage au cas par cas).
