# Back office

Adresse : `https://360immo.nc/admin.html` (non référencée par les moteurs de recherche, aucun lien depuis le site).

## Donner l'accès (une seule fois)

1. Créez-vous un compte normal sur le site (bouton « Se connecter » puis « Créer un compte »), confirmez l'email.
2. Dans Supabase, éditeur SQL :
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'votre@adresse.nc';
   ```
3. Ouvrez `admin.html` et connectez-vous avec ce compte.

L'accès est contrôlé par la base : les fonctions `admin_*` vérifient que le compte est dans `public.admins`.
Un autre compte, même connecté, ne voit rien et ne peut rien faire (testé : `tests/e2e/admin.js`).

## Rubriques

- **Tableau de bord** (s'ouvre en premier), chiffres agrégés sans données personnelles, bouton « Actualiser » :
  - *Annonces* : en ligne, nouvelles (7 j / 30 j), prix au m² médian affiché (comparé au repère ISEE),
    sans photo, avec visite vidéo, retirées ; publications par semaine (12 semaines) ; répartition par
    commune et par type.
  - *Utilisateurs* : comptes, nouveaux (7 j / 30 j), connectés sur 30 jours, pros vérifiés et en attente ;
    inscriptions par semaine ; comptes par profil ; pros par métier.
  - *Mise en relation* : demandes de devis (30 j, total) et part ayant reçu une réponse, dossiers de
    financement, missions (diagnostic, géomètre, assurance), dossiers notaire.
  - *Chiffre d'affaires* : options payées ce mois, revenu mensuel des abonnements, commandes à régler,
    essais en cours, options vendues, formules pros en cours.
  Chaque histogramme a un « Voir les chiffres » (tableau) et une infobulle au survol.

- **Professionnels** : pros inscrits, à vérifier en premier. Vérifier le RIDET (avis de situation, répertoire
  de l'ISEE), l'assurance décennale (artisans) ou la carte professionnelle (agents), puis **Valider**
  (le pro reçoit les demandes des particuliers) ou **Refuser** avec un motif. « Retirer » enlève la vérification.
- **Commandes à régler** : options d'annonce et abonnements commandés. Après réception du virement,
  **Payé** (pour un abonnement, choisir le nombre de mois payés) active immédiatement ; **Annuler** sinon.
- **Annonces** : recherche par titre, commune ou email ; **Retirer** (avec motif) masque l'annonce, ses
  photos et sa visite vidéo ; l'auteur voit le motif et **ne peut pas la remettre en ligne** lui-même
  (verrou dans la base) ; **Rétablir** la remet en ligne.
- **Partie payante** : l'interrupteur (éteinte / lancement / payante). Le site lit ce réglage dans la base
  au chargement : c'est le seul interrupteur à manipuler. (Un aperçu reste possible avec `?tarifs=payant`.)

- **Tarifs** : tous les prix (options, pack, abonnements, services) modifiables ; ils s'appliquent sur le site
  au prochain chargement (quand la partie payante est allumée). « Revenir aux prix par défaut » reprend ceux
  de `js/tarifs.js`. La base refuse un prix invalide (négatif ou au-delà de 10 000 000 F).

## Parcours des visiteurs (journal anonyme)

Le tableau de bord compte, sur 30 jours : visites (une par onglet ouvert, part sur téléphone), recherches,
fiches vues, favoris, simulations de financement, inscriptions, et deux entonnoirs :
- **Acheteurs** : visites → fiches vues → contacts vendeur → demandes de visite ;
- **Vendeurs** : estimations → dépôts commencés → annonces publiées.

Le journal (`public.evenements`) ne contient que le nom de l'action, le profil (vendeur, acheteur… ou
« visiteur »), le type d'appareil et la date : ni compte, ni email, ni adresse IP, ni contenu, ni bien
consulté. Il n'est pas lisible depuis le site (seul le tableau de bord en fait des totaux). Si l'envoi
échoue, l'action de l'utilisateur n'est jamais bloquée.

Pour la fréquentation détaillée (pages, provenance), activer **Vercel Analytics** dans Vercel (onglet
Analytics, un clic).
