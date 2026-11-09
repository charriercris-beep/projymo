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

## Sécurité de la monétisation

`rls-monetisation.sql` vérifie, sur la même base, qu'un utilisateur peut commander une option ou un
abonnement mais jamais l'activer lui-même (ni via la fonction d'administration, ni en modifiant sa
commande, ni sur l'annonce d'un autre), que l'essai pro n'est accordé qu'une fois, et qu'en mode
« lancement » la base fixe elle-même le prix (0) et la durée.
```bash
psql -h $PG -p 54329 -U postgres -f tests/e2e/rls-monetisation.sql
```

## Back office

`admin.js` vérifie le back office (`admin.html`) : accès refusé à un compte non administrateur (page et
appel direct des fonctions), validation d'un pro, paiement d'une option et d'un abonnement (3 mois),
retrait d'une annonce (invisible des visiteurs, l'auteur ne peut pas la republier), rétablissement,
interrupteur de la partie payante lu par le site, tableau de bord (chiffres conformes à la base, refusé à un non-admin). 20 vérifications.
```bash
node tests/e2e/server.js $PG &   # si pas déjà lancé
node tests/e2e/admin.js $PG /tmp   # 2e argument : dossier de la capture du tableau de bord
```
