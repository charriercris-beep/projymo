# Audit UX / UI — Immo360 NC (novembre 2026)

Objectif : un site **très facile** pour tout le monde (particuliers peu à l'aise avec le numérique comme
professionnels pressés) et un design qui ne « fait pas généré par IA ».
Méthode : parcours réels sur ordinateur (1440 px) et téléphone (390 px) — accueil, connexion, espaces
acheteur / vendeur / artisan / banquier, dépôt d'annonce, valorisation, fiche d'un bien.

## 1. Ce qui fait « design IA » (très reconnaissable)

| Marqueur | Où | Correction |
|---|---|---|
| Bandeau sombre en dégradé avec halos lumineux | Accueil | Fond clair, une seule couleur, une vraie mise en page |
| Pastille « ● PREMIÈRE PLATEFORME IA IMMOBILIÈRE NC » | Accueil | Supprimée (affirmation invérifiable) |
| Titre à empattement + mots en doré (« plus *intelligemment* ») | Accueil, partout | Une seule police, sans effet de couleur dans les titres |
| Sur-titres en petites majuscules espacées au-dessus de chaque bloc (« SCORE IMMO360™ », « MARKETPLACE », « LA DIFFÉRENCE », « SIMPLE COMME UBER », « MON MARCHÉ »…) | Accueil, tableaux de bord, formulaires | Supprimés ; libellés en minuscules normales |
| Duo de polices Playfair Display + DM Sans, noir + doré « luxe » | Partout | Une police humaniste lisible ; palette lagon / sable / encre |
| Trois cartes à icône carrée, étapes numérotées reliées par un trait, bandeau sombre « réseau » | Accueil | Contenu concret : de vraies annonces, des actions claires |
| « IA » répété partout (« IA Immo360 », « Matching IA », « Analyse IA ») | Navigation, encarts | L'IA est un outil, pas un argument : on parle du service rendu |

## 2. Honnêteté (bloquant avant ouverture au public)

- « **1 250+ biens disponibles** », « **★★★★★ 4,8/5** » : chiffres **inventés** affichés sur l'accueil.
- Tableau de bord acheteur : « 311 biens dispo », « Villa F4 · Koutio correspond à 94 % », « Marché en hausse
  à Dumbéa (+8 % sur 12 mois) », « Budget 35–50 M F » : **données fictives présentées comme réelles**
  (la statistique officielle 2025 montre d'ailleurs une **baisse** des prix).
- « Score Immo360™ » : marque déposée non vérifiée.
→ Ne montrer que des chiffres calculés (annonces réelles, statistique ISEE) ou rien.

## 3. Facilité d'utilisation

1. **Trop de choix d'emblée** : 9 à 11 onglets par espace, jargon (« Valorisation », « Matching IA »,
   « Visite » à côté de « Visites », « Suivi »).
2. **Sélecteur d'espace et devise visibles par tous** dans l'application : utile en démo, déroutant pour un vrai
   utilisateur (un vendeur ne « change pas d'espace »).
3. **Connexion** : en cliquant « Je veux acheter », la fenêtre affiche « Espace Vendeur » (bug) ; mode démo
   aussi visible que la vraie connexion.
4. **Formulaires** : libellés en MAJUSCULES, exemples en gris dans les champs (« 85 », « 4 », « 2005 ») qui
   ressemblent à des valeurs déjà remplies ; dépôt d'annonce très long.
5. **Mobile** : en-tête de l'accueil qui déborde (bouton « S'inscrire » coupé), logo sur deux lignes ;
   en-tête de l'application sur deux niveaux.
6. Textes gris très clairs sur fond crème : contraste insuffisant par endroits.

## 4. Direction de design retenue

- **Ton** : local, calme, utile — « on vous aide à acheter, vendre ou estimer en Nouvelle-Calédonie ».
- **Police** : une seule famille humaniste très lisible (Source Sans 3), titres en gras, pas d'italique décoratif.
- **Couleurs** : bleu lagon (action principale), sable (fond), encre (texte), corail (accent rare) ;
  contraste AA minimum.
- **Formes** : rayons de 8 px, bordures fines, pas d'ombres portées ni de dégradés décoratifs.
- **Langage courant** : « Préparer ma vente », « Biens pour moi », « Vidéo du bien », « Rendez-vous ».

## 5. Plan

1. Base visuelle (police, couleurs, libellés de champs) appliquée à tout le site. ✅ (cette étape)
2. Page d'accueil refaite : simple, honnête, recherche d'abord. ✅ (cette étape)
3. Navigation en langage courant ; sélecteur d'espace réservé à la démo ; bug de connexion ; chiffres inventés
   retirés du tableau de bord acheteur. ✅ (cette étape)
4. Formulaire de dépôt en 5 étapes courtes. ✅
5. Charte v3, inspirée des portails les plus visités (Zillow, Rightmove, Idealista, realestate.com.au) : ✅
   - accueil « photo d'abord » : grande photo, recherche au centre (Acheter / Vendre / Estimer), raccourcis ;
   - une seule carte d'annonce partout (`js/cards.js`) : photo 4:3, prix en grand, chambres · m² · type,
     lieu, favori en un clic ; photos libres de droits marquées « Photo d'illustration » ;
   - une seule fiche de bien (photo, caractéristiques, points forts, repère de prix du secteur, contact) ;
   - en-tête de l'application clair comme l'accueil, mêmes boutons, cartes et tailles de texte partout
     (plus de texte sous 12 px) ; prix au format français (« 48,5 M F ») ;
   - corrections : liens du pied de page qui ne faisaient rien (`showPage` manquante), déclarations CSS
     `font: … inherit` ignorées, fiches en double (deux versions différentes selon l'écran).
6. Ensuite : photos d'extérieur libres de droits, accessibilité (navigation clavier complète), tests avec
   3-5 utilisateurs réels.
