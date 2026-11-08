# Estimation des prix — méthode et sources

Moteur : `js/estimation.js` (`IMMO_EST.pm2(quartier, type, commune)`), utilisé par la valorisation, l'estimation
publique, l'estimation par photos, la page Estimation et le prix conseillé au dépôt.

## Méthode (trois couches)

1. **Observatoire Immo360** — prix au m² des annonces **publiées sur la plateforme** pour le quartier, puis
   la commune ; appartements et maisons calculés séparément ; fenêtre de 3 mois, élargie à 6 puis 12 mois si
   le volume est insuffisant ; valeurs extrêmes écartées (écart interquartile) ; **au moins 5 références**,
   sinon aucun prix observé n'est utilisé ; fourchette = 1er–3e quartile.
2. **Barème de référence** (`NC_PM2`, `NC_MARKET`) — prix **affichés** relevés en 2025-2026 (Properstar,
   Nestenn, K&P Finance, AG Gestion). Il sert à la hiérarchie entre quartiers, tant que l'observatoire n'a pas
   assez d'annonces.
3. **Calage sur les prix conclus** — les deux couches reposent sur des prix affichés ; elles sont ramenées au
   niveau des **ventes réellement conclues** par une décote calée sur la statistique officielle :

   | | Valeur | Source |
   |---|---|---|
   | Prix médian au m² des appartements **vendus** en 2025 | 280 000 F | ISEE, offices notariaux, DSF |
   | Prix médian au m² des appartements **en annonce** (avril 2026) | 340 054 F | Properstar |
   | **Décote affiché → conclu** | **× 0,823** (≈ −18 %) | rapport des deux |

   La décote est appliquée aussi aux maisons **par hypothèse** (l'ISEE publie pour les maisons un montant
   médian — 23,0 M F en 2025 — mais pas de prix au m²).

Chaque estimation affiche sa **provenance** (source, nombre de références, période).

## Ce que la statistique officielle 2025 nous apprend

Synthèse annuelle 2025 de l'ISEE (publiée en octobre 2026, ventes conclues, valeurs extrêmes exclues) :
- 943 transactions (−65 % par rapport à la moyenne 2014-2023) : marché **très étroit** → seuils minimaux
  de références indispensables ;
- appartements : prix médian au m² **280 000 F** (395 000 F en 2024, 406 000 F en moyenne 2014-2023),
  surface moyenne 65 m² ; baisse d'environ un tiers depuis 2023 dans le Sud et à la Vallée des Colons–Magenta ;
- maisons : montant médian **23,0 M F** (31,1 M F en 2023), baisse d'environ 30 % à Nouméa, Païta, Mont-Dore ;
- terrains à bâtir : médiane **406 000 F l'are**.

Avant ce calage, le barème de Nouméa était **environ 38 % au-dessus** des prix conclus des appartements :
les estimations étaient trop optimistes.

## CombienLaKaz.nc

Observatoire calédonien des prix affichés (Koko Conseil, Nouméa) : relevé des annonces tous les trois jours,
médiane par commune/quartier et par type, fenêtre 3 → 6 → 12 mois, pas de prix sous 5 références, décote
affiché → conclu, ajustements (état, vue, étage, terrasse, stationnement, terrain). Notre moteur suit des
principes comparables, **sans réutiliser leurs données** :

- leurs CGU interdisent « toute extraction, collecte ou réutilisation automatisée ou massive des données du
  Site (notamment par robot, scraping, ou appel direct aux interfaces techniques) », leur base étant protégée
  par le droit des producteurs de bases de données ;
- **piste recommandée** : proposer un partenariat (licence de données ou API) à contact@combienlakaz.nc.

## Paramètres et limites

- Paramètres modifiables : `IMMO_EST.setParams({ decote, minRefs, fenetres })` (stockés dans le navigateur ;
  une gestion centralisée est à prévoir).
- La décote est un rapport de deux médianes territoriales : elle ne capture pas les écarts propres à chaque
  quartier ; à recalculer à chaque nouvelle synthèse ISEE.
- L'observatoire ne compte que les annonces publiées par les utilisateurs d'Immo360 (les annonces de
  démonstration sont ignorées) ; il prendra le relais quartier par quartier à mesure que la plateforme vivra.

## Sources
- [ISEE — Transactions immobilières, synthèse annuelle 2025](https://isee.nc/transactions-immobilieres-synthese-annuelle-2025)
- [CombienLaKaz.nc — FAQ (méthode)](https://www.combienlakaz.nc/faq) · [CGU](https://www.combienlakaz.nc/cgu) · [À propos](https://www.combienlakaz.nc/a-propos)
- [Les Nouvelles Calédoniennes — Le marché reprend quelques couleurs en 2025](https://www.lnc.nc/article/immobilier-1/2-le-marche-reprend-quelques-couleurs-en-2025-mais-loin-des-niveaux-d-avant-crise)

## Valorisation : diagnostic d'abord

L'assistant de valorisation (`js/valorisation.js`) ne prête plus de plus-value automatique à chaque poste coché.
Le vendeur décrit d'abord l'état de chaque élément (présentation, petits défauts, murs, sols, cuisine,
salle de bain, électricité, climatisation, menuiseries, extérieur, photos), et chaque poste reçoit un
coefficient « besoin » :

- **0** : rien à corriger (murs en bon état, cuisine récente, pas de jardin…) → poste grisé, 0 F ;
- **0,2 à 0,8** : gain partiel (cuisine « correcte », climatisation dans certaines pièces…) ;
- **1 à 1,3** : défaut net → gain plein ou renforcé, poste marqué « conseillé ».

Tant qu'un élément n'est pas décrit, le gain du poste correspondant reste « à évaluer » et ne compte pas.
Les niveaux (Rangement, Home staging…) ne retiennent que les postes utiles. Avec des photos, l'analyse IA
peut remplir les éléments non décrits (mention « vu sur les photos »), sans jamais écraser ce que le
vendeur a indiqué.

### Valeur en l'état, calculée en direct

Valeur = prix au m² du secteur × surface × (1 + état) × (1 + prestations) + extérieurs.

- **État** : il n'y a plus de champ « État général ». L'état se déduit du diagnostic, élément par élément,
  par rapport à un bien moyen du secteur (le barème est une médiane de ventes) : par exemple cuisine récente
  +3 %, datée −4 % ; électricité ancienne −3 % ; climatisation partout +2 %, aucune −2 % ; murs abîmés −3 %.
  Un élément non décrit compte pour 0. L'année de construction (facultative) ajoute de +3 % (depuis 2015)
  à −4 % (avant 1975).
- **Prestations**, regroupées comme sur les grands portails (vue, piscine et bien-être, stationnement,
  sécurité, confort et annexes) : vue mer ou lagon +7 %, piscine privée +5 %, studio indépendant +6 %,
  garage fermé +3 %, plage à pied +3 %, parking sécurisé +2 %, spa +1,5 %… Le total est plafonné à +25 %.
  Certaines dépendent du type de bien (ascenseur pour un appartement, carport ou pool house pour une maison).
- **Extérieurs**, en surface pondérée et sans double compte : en appartement, terrasse à 30 % du prix au m²
  et jardin privatif à 3 % (1 % au-delà de 200 m²) ; en maison ou villa, le prix du secteur comprend déjà un
  terrain d'environ 600 m², seul le surplus compte (3 %), et la terrasse compte pour 15 %.
- **Fourchette** : ±12 % quand le bien n'est pas décrit, jusqu'à ±5 % quand le diagnostic est complet.

Tous ces coefficients sont des repères indicatifs, à recaler sur les ventes observées dès que
l'observatoire disposera d'assez d'annonces.
