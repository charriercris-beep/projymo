# PetsNC (nom de travail)

Réseau social animalier de Nouvelle-Calédonie. Voir `docs/ARCHITECTURE.md` (décisions validées : facturation
manuelle d'abord, MVP, annonces de vente d'animaux interdites au lancement).

## État d'avancement
| Phase | Statut |
|---|---|
| 1 Fondations | **Base de données + sécurité (RLS) + app : auth, onboarding, profil, animaux, espèces, navigation 5 onglets** |
| 2 Réseau social (fil, photos/vidéos, likes, stories) | à faire |
| 3–6 | à faire |

Les onglets Accueil / Explorer / Publier / Communauté affichent honnêtement « arrive bientôt » là où la fonction n'existe pas encore.

## Lancer les vérifications
```bash
./scripts/test-db.sh                 # PostgreSQL 16 jetable + 64 tests de sécurité RLS
cd apps/mobile && npm install
npm run typecheck && npm test        # TypeScript + tests unitaires
npx expo export --platform android   # vérifie que le bundle se construit
```

## Démarrer l'app avec un vrai projet Supabase
Voir `docs/DEPLOY.md`.
