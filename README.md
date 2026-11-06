# Immo360 NC

Application immobilière avec IA pour la Nouvelle-Calédonie : espaces Vendeur, Agent et Acheteur
(estimation IA, annonces, CRM, messagerie, financement, notaire, artisans…).

## Architecture

| Élément | Rôle |
|---|---|
| `immo360-global.html` | Application front-end (fichier unique) |
| `index.html` | Redirige vers l'application |
| `api/estimate.js` | Estimation d'un bien (caractéristiques + photos) via Claude |
| `api/analyze.js` | Analyse d'une photo via Claude |
| `api/generate-annonce.js` | Génération d'annonce via Claude |
| `api/config.js` | Configuration publique (URL + clé *anon* Supabase) |
| `api/valorisation.js` | Diagnostic IA du bien, état détecté sur photos, priorisation des travaux |
| `js/valorisation.js` | Assistant de valorisation (prix, paliers de travaux, simulation, annonce, devis) |
| `js/artisan.js` | Espace Artisan : profil, justificatifs (alertes d'expiration), demandes, devis, suivi |
| `js/banquier.js` | Espace Banquier/courtier : simulateur NC, éligibilité aux dispositifs, dossiers, attestation, barèmes datés ; « Capacité d'achat » côté acheteur |
| `js/notaire.js` | Espace Notaire : dossiers de vente, pièces selon le contexte NC, conditions suspensives, échéancier, décompte des frais |
| `js/missions.js` | Espaces Diagnostiqueur, Géomètre-expert, Assureur : modèle commun demande → mission → livrable |
| `js/visite.js` | Visite vidéo : éditeur (photos, ordre, légendes, réglages), publication sur l'annonce, lecteur intégré à la fiche du bien |
| `js/sync.js` | Synchronisation avec Supabase (cache navigateur, envoi, récupération, purge à la déconnexion) |
| `tests/e2e/` | Test de bout en bout multi-utilisateurs sur PostgreSQL avec RLS |
| `docs/fiches-metiers.md` | Recherche sur les besoins des métiers en Nouvelle-Calédonie (sources, fiabilité) |
| `api/_lib.js` | Utilitaires : CORS, limitation de débit, validation, appel Anthropic |
| `supabase/schema.sql` | Tables + règles de sécurité (RLS) à exécuter dans Supabase |

## Variables d'environnement (Vercel)

| Variable | Obligatoire | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | oui | Clé API Anthropic (jamais exposée au navigateur) |
| `ANTHROPIC_MODEL` | non | Modèle utilisé (défaut : `claude-sonnet-5-5`) |
| `SUPABASE_URL` | recommandé | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | oui | Clé *anon* Supabase (publique, protégée par la RLS) |
| `ALLOWED_ORIGIN` | non | Origines CORS autorisées, séparées par des virgules (même origine par défaut) |

## Mise en route

1. Créer un projet Supabase et activer *Authentication > Email*.
2. Exécuter `supabase/schema.sql` dans l'éditeur SQL (le script peut être rejoué sans risque).
3. Renseigner les variables d'environnement ci-dessus dans Vercel, puis déployer.
4. **Vérifier les professionnels** : un professionnel qui s'inscrit est « en attente de vérification » et
   ne reçoit aucune demande de client tant que l'équipe ne l'a pas validé. Après contrôle de ses
   justificatifs, dans l'éditeur SQL :
   ```sql
   select id, role, nom, ridet, metiers, created_at from public.professionnels where not verifie order by created_at;
   update public.professionnels set verifie = true where id = 123;
   ```

## Données et synchronisation

- **Sans compte (démo)** : tout reste dans le navigateur.
- **Avec un compte** : `js/sync.js` enregistre dans la table `records` et récupère les données visibles à la
  connexion, toutes les minutes et au retour sur l'onglet. Le cache d'un autre compte ou de la démo est vidé
  à la connexion ; tout est purgé à la déconnexion.
- **Qui voit quoi** (règles RLS) : chacun voit ses enregistrements ; une demande ouverte (financement, devis,
  diagnostic, bornage, assurance) est visible des seuls professionnels **vérifiés** du métier visé ; une fois
  prise en charge, seulement du demandeur et du professionnel qui la traite. Les coordonnées d'un client ne
  sont transmises qu'à l'artisan dont il accepte le devis.
- Conflits : la dernière écriture l'emporte.

## Sécurité

- Les appels à Claude passent uniquement par `/api/*` ; limitation de débit par IP (en mémoire, protection de base),
  taille et type des images validés.
- Les textes saisis par les utilisateurs et les sorties de l'IA sont échappés (`esc()`) avant insertion dans le HTML.
- Authentification par Supabase Auth ; la RLS protège les données (voir `supabase/schema.sql`).
- Le « mode démo » (boutons *Accès démo* / `loginAs`) ne vérifie rien et n'accède à aucune donnée réelle.

## Reste à faire

Voir l'état des lieux : persistance des clients/dossiers/mandats/visites, intégrations de publication
(ImmoNC, Properstar, Facebook), découpage du fichier HTML en modules, tests.
