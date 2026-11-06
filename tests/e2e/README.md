# Test de bout en bout de la synchronisation

Vérifie, sur un vrai PostgreSQL avec les règles d'accès (RLS) de `supabase/schema.sql`, que plusieurs
utilisateurs — chacun dans un navigateur isolé — échangent correctement via la base : acheteur, vendeur,
banquiers (vérifié / non vérifié), peintre, notaire, diagnostiqueur. 31 vérifications.

Le client `supabase-js` est remplacé par `fake-supabase.js`, qui reproduit uniquement les appels utilisés
par `js/sync.js` (auth.getSession / signInWithPassword / signOut, from().select/insert/upsert/update/delete + eq).
`server.js` exécute chaque requête sur PostgreSQL **sous l'identité de l'utilisateur** (rôle `authenticated`,
`auth.uid()`), comme le ferait l'API de Supabase.

## Prérequis
- PostgreSQL 16 local, Node.js, Playwright (avec Chromium).

## Lancer
```bash
# 1. Base de test (socket dans le dossier $PG)
initdb -D $PG/data -A trust && pg_ctl -D $PG/data -o "-p 54329 -k $PG" -l $PG/log start
psql -h $PG -p 54329 -U postgres -f tests/e2e/supabase-stub.sql
psql -h $PG -p 54329 -U postgres -f supabase/schema.sql
# 2. Serveur de test (port 8125) puis scénario
node tests/e2e/server.js $PG &
node tests/e2e/e2e.js $PG /tmp
```
`supabase-stub.sql` imite le minimum de Supabase : schéma `auth`, rôles `anon` / `authenticated` /
`service_role`, fonctions `auth.uid()` et `auth.role()`.
