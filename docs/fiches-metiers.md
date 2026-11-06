# Fiches métier — Immo360 NC

Synthèse de recherche (novembre 2026) sur les besoins des acteurs de l'immobilier en Nouvelle-Calédonie, servant de base au paramétrage des espaces métiers.

**Légende de fiabilité** : ✅ source officielle calédonienne lue en entier · 🟡 source officielle ou presse locale, partielle ou ancienne · ⚠️ non confirmé pour la Nouvelle-Calédonie (à valider avec un professionnel avant mise en production).

> **Règle de conception** : tout taux, plafond ou seuil réglementaire est une **donnée paramétrable datée** (valeur + date + source), jamais une constante dans le code. Beaucoup de chiffres ci-dessous datent de 2011 à 2019 et ont pu changer.

---

## 0. Constats transversaux

| Sujet | Constat | Fiabilité |
|---|---|---|
| Droit applicable | Droit civil, assurances, urbanisme, publicité foncière et professions relèvent largement de la Nouvelle-Calédonie : **ne pas transposer le droit métropolitain** (DDT, loi Hoguet, DPE…). | ✅ |
| Identifiant d'entreprise | Le **RIDET** (ISEE) remplace le SIRET et doit figurer sur tous les documents commerciaux. | ✅ |
| Terres coutumières | ≈ 27 % du territoire (503 300 ha). Inaliénables, incessibles, insaisissables. Financement via le **Fonds de garantie sur terres coutumières (FGTC)**. Actes et litiges relèvent de l'autorité coutumière. | 🟡 |
| Urbanisme | La commune prime sur la province (PUD communal). Zonage et préemption à vérifier commune par commune. | 🟡 |
| Risques naturels | Cyclone, inondation, incendie, mouvement de terrain, tsunami ; services DAVAR (eau/inondation) et DIMENC (géologie). Permis de construire soumis à des dossiers de risque en zone exposée. | 🟡 |
| Agents immobiliers | **Carte professionnelle délivrée par le gouvernement de la NC**, avec liste des opérations autorisées (délibération 25-98/APS étendue à tout le territoire par la 036/CP de 2000). Version actuelle à vérifier auprès de la DAE. | 🟡 |
| Publicité foncière | Loi du pays n° 2026-6 du 21 mai 2026 : prépare une « formalité fusionnée » et un **bordereau récapitulatif** à chaque dépôt d'actes par le notaire. | 🟡 |

### Dossier de vente partagé (idée centrale produit)
Les métiers s'enchaînent sur un même bien : **vendeur → diagnostiqueur / géomètre → agent → banquier / assureur → notaire**, avec des artisans en amont (travaux). L'espace de chaque métier doit donc être une **vue sur un dossier commun** (statut, pièces, échéances), pas une application isolée.

---

## 1. Artisan / entreprise du BTP

### Cadre réglementaire NC
- **Assurance décennale obligatoire** et assurance de dommages (réforme du code civil et du code des assurances du 5 février 2019). Les maîtres d'ouvrage **et** les constructeurs doivent justifier du contrat. ✅
- **Qualification professionnelle obligatoire** pour les métiers de la construction (liste des activités fixée par le gouvernement), avec période transitoire de 3 ans ; une **instance paritaire de la construction** suit les qualifications et arbitre les refus d'assurance. ✅
- **RCNC** (référentiel de la construction) : normes de mise en œuvre + **produits et procédés agréés**. ✅
- **Contrôle technique** par un contrôleur agréé, obligatoire pour certaines constructions (public, taille, zones à risque). ✅
- Création : **RIDET**, inscription au **répertoire des métiers CMA-NC** (< 10 salariés), **patente** (taxe), affiliation **CAFAT/RUAMM**, guichet unique guichet-entreprise.nc. 🟡
- Marché de l'assurance décennale étroit (peu d'assureurs) : vérifier que le contrat couvre expressément la NC. 🟡

### Besoins concrets
1. **Profil de confiance vérifiable** : RIDET, attestation décennale (assureur, n° de contrat, **date d'expiration**), qualification, RC pro, zones d'intervention, spécialités, photos de réalisations.
2. **Recevoir et trier des demandes de devis** qualifiées (bien, quartier, postes, budget, délai, photos).
3. **Répondre par un devis structuré** (lignes, quantités, prix HT/TTC, validité, délai, conditions) et le suivre jusqu'à acceptation.
4. **Planning** des chantiers et disponibilités.
5. **Avis et réputation**, relances, facturation / acomptes (V2).

### À construire dans Immo360
- MVP : fiche entreprise + **justificatifs avec alertes d'expiration** ; **boîte de demandes de devis** (issues de l'assistant de valorisation) ; **éditeur de devis** ; statuts (reçue, vue, devis envoyé, accepté, refusé) ; tableau de bord (demandes, taux de conversion, CA potentiel).
- V2 : planning, facturation, avis vérifiés, badge « assurance décennale à jour ».
- Point à vérifier : liste officielle des activités soumises à qualification.

---

## 2. Notaire

### Cadre NC
- Vente immobilière par **acte authentique** ; le notaire publie l'acte au service de la publicité foncière. 🟡
- **Frais d'acquisition** (exemple officiel sur 30 M F, ancien régime) ✅ :

| Poste | Taux | Montant |
|---|---|---|
| Droits d'enregistrement | 4 % (0,5 % pour une VEFA en résidence principale depuis 2019) | 1 200 000 F |
| Centimes additionnels provinciaux | 2 % | 600 000 F |
| Centimes additionnels communaux | 3 % | 900 000 F |
| Taxe hypothécaire | 0,30 % | 90 000 F |
| Contribution de sécurité immobilière | 0,075 % | 22 500 F |
| **Total impôts et taxes** | **≈ 9,375 %** | **2 812 500 F** |
| Frais (émoluments) de notaire | ≈ 1 % | 292 602 F |
| **Total** | **≈ 10,35 %** | **3 105 102 F** |

  Plafonnement forfaitaire (50 000 F par logement) pour les VEFA en résidence principale **du 1ᵉʳ mars 2019 au 31 décembre 2021** : probablement échu. ⚠️ Taux actuels à confirmer.
- **Terres coutumières** : régime spécifique, vente impossible ; baux et actes coutumiers. 🟡
- **Droit de préemption** et délais de purge : ⚠️ non documentés pour la NC.
- Chambre des notaires de Nouvelle-Calédonie (organe professionnel local). 🟡

### Besoins concrets
1. **Dossier de transaction** : parties, bien, origine de propriété, pièces à réunir et **pièces manquantes**.
2. **Calculateur de frais** conforme au barème local (paramétrable).
3. **Calendrier** : compromis, conditions suspensives, purge, financement, signature, publication.
4. Échanges sécurisés avec agent, banque, vendeur, acquéreur ; **rappels automatiques**.
5. Suivi des **conditions suspensives** (prêt, préemption, urbanisme).

### À construire dans Immo360
- MVP : dossiers, check-list de pièces par type d'opération, **estimation des frais** (barème paramétrable et daté), frise de délais, alertes. (Une base `buildNotaire` existe déjà.)
- V2 : bordereau récapitulatif de publicité foncière, signature électronique, connecteurs.
- À valider avec un notaire : barème d'émoluments actuel, préemption, check-lists.

---

## 3. Banquier / courtier

### Cadre NC
- **PTZ-NC** (prêt sans intérêt, intérêts pris en charge par la NC via crédit d'impôt), distribué par **BCI, BNC, BNPP, SGCB**. Conditions (dossier de presse **2011**, réorienté en 2018 vers le neuf du Grand Nouméa) 🟡 :
  - plafonds de revenus annuels : 1 pers. 3 240 000 F ; 2 : 3 888 000 ; 3 : 4 428 000 ; 4 : 5 076 000 ; 5 : 5 724 000 ; 6+ : 6 480 000 ;
  - non-propriétaire de sa résidence principale sur 2 ans, résidence principale occupée ≥ 8 mois/an ;
  - montant selon revenus, composition du ménage, coût du projet, apport, durée ; majoration si durée ≤ 20 ans ;
  - logiciel partagé banques / DAE ; chaque banque ne voit que ses clients.
- **Aides Province Sud (LAPS)**, brochure **2018** 🟡 : résidence 2 ans en province Sud, primo-accédant, apport ≥ 300 000 F, **taux d'endettement 25–35 %**, durée d'emprunt ≥ 19 ans, subventions ≤ 25 % du projet, aide de 200 000 à 2 000 000 F (jusqu'à 4 M), engagement d'occuper 15 ans sans louer ; plafonds de ressources mensuels de 300 000 F (1 pers.) à 790 000 F (couple + 3 enfants), majorés en ZAC / centralité urbaine.
- **FSH** : prêts à taux bonifiés à ses ayants droit. 🟡
- **Aide au logement** (locataires) en réforme : gestion transférée à la CAFAT (projet de loi du pays de novembre 2025). Ne concerne pas l'accession. ✅
- **Assurance emprunteur** : la BNC exige des garanties au moins équivalentes à son contrat groupe en cas de délégation. 🟡

### Besoins concrets
1. **Dossier de financement** complet : revenus, charges, apport, pièces, historique.
2. **Simulateur de capacité d'emprunt** (endettement, durée, taux) **et d'éligibilité aux aides** (PTZ, LAPS, FSH) avec plafonds à jour.
3. **Comparaison d'offres** (taux, assurance, frais) et accord de principe à joindre au dossier d'achat.
4. Suivi des étapes (dépôt, instruction, offre, déblocage) et **échéances de validité** des offres.

### À construire dans Immo360
- MVP : simulateur NC avec **barèmes datés et modifiables**, éligibilité PTZ/LAPS, dossier client, génération d'une **attestation de capacité de financement** transmise au vendeur/agent.
- V2 : comparateur multi-banques, délégation d'assurance, connexion aux outils bancaires.
- À valider : barèmes PTZ et LAPS en vigueur en 2026, taux du marché local.

---

## 4. Diagnostiqueur

### Cadre NC
- **Ne pas appliquer le DDT métropolitain.** Textes calédoniens identifiés : amiante dans le bâti (délibération n° 211/CP de 1997), **terrains amiantifères** (délibération n° 82 du 25 août 2010, carte DIMENC et plan de prévention), interdiction de l'amiante (arrêté du 22 février 2007), guides techniques 2018 de la DTE. 🟡
- **Termites, plomb, électricité, gaz, DPE** : ⚠️ obligations de vente en NC non confirmées ; à rendre configurables.

### Besoins concrets
1. **Gestion des missions** : commande depuis un dossier de vente, adresse, accès, devis, planification.
2. **Dépôt du rapport** et **dates de validité** (alertes), rattachement au dossier.
3. Lien avec la **carte d'aléa amiante environnemental** (DIMENC) pour pré-qualifier un terrain.

### À construire
- MVP : fiche professionnelle, catalogue de diagnostics **paramétrable par type de bien et zone**, commande → planification → rapport, alertes de validité.
- À valider avec un diagnostiqueur local : liste réelle des diagnostics exigés à la vente et à la location.

---

## 5. Géomètre-expert

### Cadre NC
- Seul le **géomètre-expert** est habilité à **repositionner des limites** ; une douzaine en NC, ordre professionnel local. ✅ (DITTT)
- **DITTT / bureau du cadastre** : attestation de désignation cadastrale (utilisée par le notaire), fiche de renseignement cadastral, **demande de nouveaux numéros** pour division ou lotissement avec plan, cadastre en ligne ; prestations payantes (arrêté AG-2026-DITTT-018 du 18 février 2026). Les informations cadastrales ne valent pas titre de propriété. ✅
- Règles de constructibilité : service d'urbanisme communal, sinon province. ✅

### Besoins concrets
1. Demandes de **bornage / division / plan de vente** liées à un bien ou terrain.
2. Suivi des étapes (convocation des voisins, relevé, plan, dépôt DITTT) et documents livrables.
3. Mise à disposition du plan au notaire et à l'acquéreur.

### À construire
- MVP : fiche, demandes de mission, suivi par étapes, dépôt de livrables dans le dossier de vente.
- À valider : procédure exacte de bornage en NC et pièces exigées.

---

## 6. Assureur / courtier en assurance

### Cadre NC
- Garanties **tempête** et **catastrophe naturelle** obligatoires dans les contrats de biens (ANIL, **1999**, à reconfirmer) ; la couverture **cyclone** est **optionnelle** selon la presse locale. ⚠️
- Sans assurance, aucun dégât n'est indemnisé, même en cas de catastrophe. 🟡
- Les incendies pèsent davantage que les cyclones dans les comptes des assureurs locaux (presse). 🟡
- **Assurance emprunteur** exigée par la banque (équivalence de garanties en cas de délégation). 🟡
- **Décennale** : marché étroit, courtage spécialisé. 🟡

### Besoins concrets
1. **Demandes de devis** d'assurance habitation et emprunteur à partir du dossier du bien (type, surface, année, zone de risque, équipements).
2. **Scoring de risque par zone** (inondation, incendie, cyclone) pour tarifer.
3. Émission d'**attestations** réutilisables par la banque et le notaire.

### À construire
- MVP : fiche, réception de demandes pré-remplies, devis, attestation d'assurance rattachée au dossier.
- À valider avec un assureur local : garanties standard, exclusions, délais de carence.

---

## 7. Plan d'implémentation proposé

1. **Socle commun** : table `professionnels` (rôle, RIDET, justificatifs + dates d'expiration, zones), RLS par rôle, **dossier de vente partagé** (bien, parties, pièces, statuts).
2. **Artisan** (en premier : il reçoit déjà les demandes de l'assistant de valorisation).
3. **Banquier/courtier** (simulateur + éligibilité aides), puis **Notaire** (frais + check-lists).
4. **Diagnostiqueur / Géomètre / Assureur** sur le même modèle « mission / demande → livrable ».
5. **Pilotes terrain** : relire chaque fiche avec 1 professionnel local avant mise en production.

## 8. Points à faire valider en priorité

1. Barème actuel des frais de notaire et des droits d'enregistrement (taux 2019).
2. Barèmes PTZ-NC et LAPS en vigueur (documents 2011 et 2018).
3. Liste officielle des diagnostics obligatoires à la vente en NC.
4. Liste des métiers soumis à qualification obligatoire (RCNC / instance paritaire).
5. Régime du droit de préemption et délais de purge.
6. Garanties d'assurance habitation standard en NC (cyclone, catastrophe naturelle).

## Sources

- [Gouv.nc — Tarifs des notaires plafonnés et droits d'enregistrement (19/02/2019)](https://gouv.nc/sites/default/files/atoms/files/2019.02.19_cp_tarifs_notaire.pdf)
- [Gouv.nc — Référentiel de la construction de la NC (dossier de presse, 23/01/2020)](https://gouv.nc/sites/default/files/atoms/files/2020.01.23_dp_reforme_de_la_construction_en_nouvelle-caledonie.pdf)
- [Gouv.nc — Réforme du secteur de la construction (29/10/2019)](https://gouv.nc/sites/default/files/atoms/files/2019.10.29_cp_la_construction_en_nouvelle-caledonie.pdf)
- [Gouv.nc — Prêt à taux zéro, dossier de presse (05/01/2011)](https://gouv.nc/sites/default/files/atoms/files/14600005.PDF)
- [Gouv.nc — Aide au logement modernisée (05/11/2025)](https://gouv.nc/sites/default/files/atoms/files/2025.11.05_cp_une_aide_au_logement_modernisee_pour_assurer_sa_perennite_son_equite_et_son_financement.pdf)
- [Province Sud — Code et brochure des aides à l'habitat (LAPS)](https://www.province-sud.nc/sites/default/files/1829396/Code%20des%20aides%20%C3%A0%20l%27habitat%20%20LAPS.pdf)
- [Gouv.nc — Inventaire des réglementations des risques naturels (07/2023)](https://gouv.nc/sites/default/files/atoms/files/inventaire_reglementations_risques_naturels_nc_072023light.pdf)
- [JuriDoc — Loi du pays n° 2026-6 du 21/05/2026](https://juridoc.gouv.nc/JuriDoc/JdTextes.nsf/0/44C1BB8024FCBC974B258E0B001D08F2/$File/Lp_2026-6_du_21-05-2026_ChG.pdf)
- [DITTT — Cadastre et foncier (professionnels)](https://dittt.gouv.nc/information-geographique/pour-les-professionnels/cadastre-et-foncier)
- [DAE — Délibération 25-98/APS sur les agents immobiliers](https://dae.gouv.nc/sites/default/files/atoms/files/agentimmodelib_25-98_23-04-1998.pdf)
- [Gouv.nc — Mieux prévenir le risque amiante (2018)](https://gouv.nc/actualites/11-12-2018/mieux-prevenir-le-risque-amiante)
- [CMA-NC — Immatriculer son entreprise](https://www.cma.nc/creer-son-entreprise/creation/immatriculer)
- [Service-public.nc — Créer une entreprise](https://service-public.nc/article/creer-une-entreprise)
- [Les Nouvelles Calédoniennes — Dans la jungle des assurances](https://www.lnc.nc/article/pays/consommation/dans-la-jungle-des-assurances)
- [BNC — Fiche standardisée d'information (assurance emprunteur)](https://www.bnc.nc/images/DOCPDF/FSI__Internet.pdf)
