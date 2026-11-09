# Monétisation — tout est prêt, éteint par défaut

Toute la partie payante est programmée mais **désactivée** : le site reste entièrement gratuit tant que
l'interrupteur n'est pas basculé. Le jour où le trafic est là, on fixe les prix et on l'allume.

## L'interrupteur (deux endroits à mettre d'accord)

| Mode | Effet |
|---|---|
| `off` (actuel) | Rien de payant n'apparaît. Aucune limite. |
| `lancement` | Options, page Tarifs et abonnements visibles mais **offerts**. Aucune limite. |
| `payant` | Les prix s'appliquent : commandes « à régler », limites des formules gratuites. |

1. **Site** : `js/tarifs.js`, ligne `const MODE_SITE = 'off';`
2. **Base** (Supabase, éditeur SQL) : `update public.parametres set valeur = 'payant' where cle = 'mode_tarifs';`

La base est la seule à pouvoir activer quelque chose : même si quelqu'un modifiait le site dans son
navigateur, il ne pourrait pas s'offrir une option ou un abonnement (vérifié par
`tests/e2e/rls-monetisation.sql`).

**Aperçu sans rien mettre en ligne** : ajouter `?tarifs=payant` (ou `?tarifs=lancement`) à l'adresse
du site, par exemple sur l'aperçu Vercel. Revenir avec `?tarifs=off`.

## Les prix

Tous dans `js/tarifs.js` (francs CFP TTC). Propositions de départ, à fixer ensemble :

**Options d'annonce** : bulle « Urgent » 1 500 F (30 j) · bulle « Prix négociable » 1 000 F (30 j) ·
remontée en tête 1 200 F · remontée quotidienne 7 j 4 900 F · « À la une » 7 j 5 900 F ·
annonce en couleur 2 000 F (30 j) · bulle « Portes ouvertes » 1 000 F ·
**Pack « Vente express »** (à la une + urgent + remontée quotidienne, 7 j) 9 900 F.

**Abonnements pros (par mois, essai 30 jours une fois par métier)** :
- Agences : Découverte gratuite (5 annonces) · Agence 19 900 F (50 annonces, statistiques) · Agence+ 39 900 F (illimité)
- Artisans : Découverte gratuite (3 demandes / mois) · Artisan 6 900 F (illimité, badge « Vérifié »)
- Banques et courtiers : Découverte (2 dossiers / mois) · Partenaire 24 900 F
- Diagnostiqueurs, géomètres : Découverte (3 missions / mois) · Pro 5 900 F
- Assureurs : Découverte (3 demandes / mois) · Partenaire 14 900 F
- Notaires : gratuit (déontologie : pas de rémunération liée aux clients)

**Services** : rapport d'estimation détaillé 2 900 F · photos professionnelles 15 000 F (préparés dans
la grille ; leur commande sera branchée avec le paiement).

## Où ça apparaît (modes lancement et payant)

- **Dépôt d'annonce**, dernière étape : « Vendez plus vite » (options, pack, total).
- **Mes annonces** : bouton « Vendre plus vite » sur chaque annonce publiée, avec ce qui est déjà commandé.
- **Listes et fiches** : pastilles (À la une, Urgent, Prix négociable, Portes ouvertes avec la date),
  carte encadrée pour « Annonce en couleur ». Tri : « À la une » d'abord, puis date de publication ou
  de dernière remontée.
- **Espaces pros** : onglet « Abonnement » (formules, essai, choix). En mode payant, au-delà de la limite
  de la formule gratuite, les demandes ou missions suivantes du mois sont masquées avec une invitation.
  Une agence au maximum d'annonces ne peut plus en publier.
- **Pied de page** : lien « Tarifs » (page générée à partir de `js/tarifs.js`).

## Encaisser et activer (en attendant un paiement en ligne)

Le paiement en ligne n'est pas branché (à choisir avec votre banque ; Stripe n'est a priori pas ouvert
aux entreprises calédoniennes, à vérifier). En attendant : facture et virement, puis activation.

Dans l'éditeur SQL de Supabase :

```sql
-- Commandes d'options à régler
select o.id, o.annonce_id, o.option, o.prix, o.created_at, u.email
from public.options_annonce o join auth.users u on u.id = o.owner_id
where o.statut = 'a_payer' order by o.created_at;
-- Après paiement (vérifier que le montant payé correspond)
select public.activer_option(<id>);

-- Demandes d'abonnement à régler
select a.id, a.role, a.formule, a.prix, a.created_at, u.email
from public.abonnements a join auth.users u on u.id = a.owner_id
where a.statut = 'a_payer' order by a.created_at;
-- Après paiement : nombre de mois payés
select public.activer_abonnement(<id>, 1);
```

En mode démonstration (sans compte), tout s'active immédiatement dans le navigateur avec la mention
« démo » : c'est fait pour essayer, rien n'est enregistré en ligne.

## Plus tard

- Paiement en ligne (solution de votre banque) : il suffira d'appeler `activer_option` /
  `activer_abonnement` depuis le serveur à la confirmation du paiement.
- Page d'administration des commandes (au lieu des requêtes SQL).
- Commande en ligne du rapport d'estimation et des photos professionnelles.
- Alertes « nouvelle annonce » prioritaires aux acheteurs dont les critères correspondent.
