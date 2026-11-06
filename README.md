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

1. Créer un projet Supabase, exécuter `supabase/schema.sql`, et activer *Authentication > Email*.
2. Renseigner les variables ci-dessus dans Vercel, puis déployer.

## Sécurité

- Les appels à Claude passent uniquement par `/api/*` ; limitation de débit par IP (en mémoire, protection de base),
  taille et type des images validés.
- Les textes saisis par les utilisateurs et les sorties de l'IA sont échappés (`esc()`) avant insertion dans le HTML.
- Authentification par Supabase Auth ; la RLS protège les données (voir `supabase/schema.sql`).
- Le « mode démo » (boutons *Accès démo* / `loginAs`) ne vérifie rien et n'accède à aucune donnée réelle.

## Reste à faire

Voir l'état des lieux : persistance des clients/dossiers/mandats/visites, intégrations de publication
(ImmoNC, Properstar, Facebook), découpage du fichier HTML en modules, tests.
