# Audit avant mise en ligne — Immo360 NC

*Fin novembre 2026. Parcours automatique de 98 écrans : 9 espaces (vendeur, acheteur, agence, artisan, banque,
notaire, diagnostiqueur, géomètre, assureur), sur ordinateur et téléphone, avec de **vrais comptes** (base de test,
mêmes règles d'accès que la production). Chaque bouton de chaque écran a été cliqué (hors actions destructrices).*

**Résultat technique : aucune erreur JavaScript, aucun bouton relié à une fonction absente.**
Les problèmes sont ailleurs : du contenu de démonstration resté dans les espaces réels, et des fonctions qui
annoncent des envois qui n'ont pas lieu.

## 1. Bloquants — à corriger avant l'ouverture

| # | Problème | Où | Pourquoi c'est bloquant |
|---|---|---|---|
| B1 | **La messagerie ne transmet rien.** « Contacter le vendeur » crée une conversation uniquement dans le navigateur de l'acheteur. | Tous les espaces | Le vendeur ne reçoit jamais la demande : c'est le cœur d'un portail. |
| B2 | **Fausses réponses automatiques** : 2 secondes après un message, une réponse inventée s'affiche (« Merci pour votre message, je reviens vers vous… »). | Messagerie | L'acheteur croit qu'un vrai vendeur a répondu. |
| B3 | **Conversations inventées** (Marie L., Paul M., Agent NC Immobilier) visibles par tout nouveau compte. | Messagerie, tous les espaces | Faux contenu présenté comme réel. |
| B4 | **Espace agence rempli de données inventées** : 4 mandats « signés électroniquement », 6 clients avec téléphones, visites, comptes-rendus, acheteurs « compatibles ». | Agence : Mandats, Clients, Rendez-vous, Acheteurs | Une agence qui s'inscrit voit le portefeuille d'une autre ; impossible de distinguer le vrai du faux. |
| B5 | **Statistiques inventées** : « 2 847 vues », « Immobilier.nc 680 vues », taux de conversion. | Agence › Statistiques | Chiffres faux, qui citent en plus un site concurrent. |
| B6 | **Envois annoncés mais jamais faits** : « Demande de signature envoyée par email… signature électronique sécurisée et juridique », « Bon de visite envoyé par email », « SMS envoyé », « Messagerie ouverte ». | Agence (mandats, visites), Vendeur (artisans) | Promesse trompeuse ; risque juridique (pratique commerciale trompeuse, valeur d'une « signature » inexistante). |
| B7 | **Suivi d'achat inventé** : étapes et notifications fictives (« 3 nouveaux biens à +85 % », « Taux immobilier 3,5 % »). | Acheteur › Mon achat | Informations fausses présentées comme personnelles. |
| B8 | **Mentions légales incomplètes** : raison sociale, adresse, RIDET, directeur de la publication « à compléter » ; page Contact sans adresse. | Pied de page | Mentions obligatoires pour un site professionnel. **À fournir par vous.** |

## 2. Importants — à corriger rapidement

| # | Problème | Où |
|---|---|---|
| I1 | Le prix est demandé à l'étape 3 du dépôt, avant les photos analysées, la description et les prestations : le repère de prix ne peut pas en tenir compte. *(Demande du 26/11 : prix à la fin, avec comparaison au marché et baromètre du quartier.)* | Dépôt d'annonce |
| I2 | Débordement horizontal sur téléphone : Mandats, Suivi notaire, Clients, Statistiques, Barèmes bancaires, Mon projet, Mon achat. | Mobile |
| I3 | 50 fenêtres d'alerte du navigateur (`alert`) pour les erreurs de saisie : peu engageant, bloquant sur mobile. | Agence, artisans, notaire, banque… |
| I4 | « Ma vente » (vendeur) : cadres vides (Suivi de vente, Contacts & acheteurs) sans explication. | Vendeur |
| I5 | Émojis nombreux dans certains écrans (Mon achat, Mandats, Rendez-vous) : style incohérent avec le reste du site. | Plusieurs |
| I6 | Crédit du service IA épuisé : rédaction, lecture des photos, recherche affinée, prospects fonctionnent en version simplifiée. **À recharger par vous.** | Toutes les fonctions IA |

## 3. Améliorations — après l'ouverture

- Référencement : titre de page générique, pas de description, pas de `robots.txt` ni de plan du site, une seule page visible pour Google.
- En-têtes de sécurité : ajouter `Strict-Transport-Security` et une politique de contenu (CSP).
- Poids : 1 Mo de code chargé d'un coup ; à alléger progressivement.
- Base Supabase en Inde (ap-south-1) : la déplacer à Sydney rendrait le site plus rapide depuis Nouméa.

## 4. Ce qui fonctionne bien

- Dépôt d'annonce (aperçu en direct, score de finition), publication réelle, photos, visite vidéo, lien de partage.
- Estimation détaillée (« Pourquoi ce prix ? »), rapport PDF.
- Espaces artisan, banque, notaire, diagnostiqueur, géomètre, assureur : vides au départ, sans données inventées, échanges réels via la base (demandes de devis, dossiers de financement, missions).
- Back office : validation des pros, modération, commandes, tarifs, audience en direct.
- Sécurité des données : règles d'accès de la base testées (35 vérifications), données de démonstration jamais envoyées en base.

## 5. Corrigé depuis l'audit

- **B1, B2, B3** : messagerie réelle entre comptes (message et demande de visite depuis la fiche, réponse du vendeur), destinataire fixé par la base, plus de conversations ni de réponses inventées pour les vrais comptes (25 vérifications, `tests/e2e/messages.js`).
- **I1** : prix en dernière étape du dépôt, prix conseillé détaillé, marché, baromètre du quartier.
- Financement : fenêtre au-dessus de la fiche (mensualité, frais calédoniens, revenus conseillés), demande d'étude reçue par les banques **et les courtiers** vérifiés ; message honnête en mode démonstration.

## 6. Plan de correction proposé

1. **Messagerie réelle** entre comptes (via la base, avec règles d'accès), sans réponses ni conversations inventées (B1–B3).
2. **Espaces vides au départ pour les vrais comptes** : mandats, clients, visites, acheteurs, statistiques et suivi d'achat ne montrent que les données de la personne ; les exemples restent en mode démonstration seulement (B4, B5, B7).
3. **Retirer les envois fictifs** : remplacer par ce qui est réellement possible (générer un document à imprimer ou signer, copier un message, ouvrir WhatsApp/SMS sur le téléphone) (B6).
4. **Prix en fin de dépôt** avec comparaison au marché, analyse des photos et baromètre du quartier (I1).
5. Débordements mobiles, alertes remplacées par des messages dans la page, émojis (I2, I3, I5).
6. Mentions légales : dès que vous me donnez les informations (B8).
