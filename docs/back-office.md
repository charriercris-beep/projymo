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

## À venir (étapes 2 et 3)

- Tableau de bord : annonces, utilisateurs, mise en relation, chiffre d'affaires.
- Journal d'événements anonymes pour l'entonnoir (estimation → dépôt → publication).
- Prix modifiables depuis le back office.
