# Déploiement (développement)

## 1. Supabase (compte gratuit suffisant pour développer)
1. Créer un projet (région la plus proche de la Nouvelle-Calédonie, p. ex. Sydney). Créer deux autres projets plus tard pour préproduction et production.
2. SQL Editor : exécuter `supabase/migrations/0001_foundations.sql` (les migrations suivantes à la suite, dans l'ordre).
3. Authentication → Providers : e-mail activé, **Confirm email = ON**. URL de redirection : `petsnc://`.
4. Settings → API : copier l'URL et la clé **anon** (publique). La clé `service_role` ne va JAMAIS dans l'app.
5. Créer le premier super-admin (une fois, depuis le SQL Editor, après votre inscription dans l'app) :
   `insert into public.staff_roles (profile_id, role) select id, 'super_admin' from public.profiles where handle = '<votre_pseudo>';`

## 2. App mobile
```bash
cd apps/mobile && cp .env.example .env   # renseigner URL + clé anon
npm install && npx expo start            # tester avec Expo Go sur un vrai téléphone
```

## 3. Builds boutiques (plus tard)
EAS Build (`eas build`) nécessite un compte Expo ; iOS nécessite Apple Developer, Android un compte Google Play.
Voir `docs/ARCHITECTURE.md` §9–10 et §15.

## À faire côté base avant la production
- Edge Function (service_role) qui supprime définitivement `auth.users` des comptes `status='deleted'` après 30 jours.
- Sauvegardes (PITR) activées et test de restauration documenté.
