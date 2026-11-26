-- Tests de sécurité (RLS) des fondations. Chaque vérification échoue bruyamment.
-- Exécuté par scripts/test-db.sh sur un PostgreSQL local avec un stub Supabase.
\set ON_ERROR_STOP on
create schema t;
grant usage on schema t to public;
create table t.results (n serial, ok boolean, msg text);
grant all on t.results to public; grant usage on all sequences in schema t to public;

create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  insert into t.results (ok, msg) values (coalesce(cond, false), msg);
  if not coalesce(cond, false) then raise exception 'ÉCHEC : %', msg; end if;
end $$;

-- Doit échouer (permission, RLS ou règle métier). Réussit seulement si la requête lève une erreur.
create function t.fails(sql text, msg text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin execute sql; exception when others then failed := true; end;
  perform t.ok(failed, msg);
end $$;

-- Doit s'exécuter mais n'affecter aucune ligne (RLS qui filtre silencieusement).
create function t.affects_none(sql text, msg text) returns void language plpgsql as $$
declare n int := 0;
begin
  begin execute sql; get diagnostics n = row_count; exception when others then n := 0; end;
  perform t.ok(n = 0, msg);
end $$;

create function t.as_user(uid uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  perform set_config('request.jwt.claim.role', case when uid is null then 'anon' else 'authenticated' end, false);
  execute case when uid is null then 'set role anon' else 'set role authenticated' end;
end $$;
create function t.as_service() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  set role service_role;
end $$;
grant execute on all functions in schema t to public;

-- Utilisateurs de test
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name":"Alice"}'),
 ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{}'),
 ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{}'),
 ('00000000-0000-0000-0000-00000000000d', 'dave@example.com',  '{}'),
 ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com', '{}'),
 ('00000000-0000-0000-0000-0000000000a2', 'alice@autre.com',   '{}');   -- même préfixe que alice
insert into public.staff_roles (profile_id, role) values
 ('00000000-0000-0000-0000-0000000000a1', 'super_admin');
update public.profiles set is_private = true where id = '00000000-0000-0000-0000-00000000000c';

-- 1. RLS activée partout (garde-fou pour toutes les migrations futures)
do $$ begin
  perform t.ok(not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ), 'toutes les tables du schéma public ont la RLS activée');
end $$;

-- 2. Profils créés automatiquement
do $$ begin
  perform t.ok((select count(*) from public.profiles) = 6, 'un profil est créé pour chaque inscription');
  perform t.ok((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Alice',
               'nom affiché repris des métadonnées');
  perform t.ok((select count(distinct handle) from public.profiles) = 6, 'les pseudonymes sont uniques malgré les doublons de préfixe');
end $$;

-- 3. Référentiels : lisibles par tous, modifiables seulement par l'administration
do $$ begin
  perform t.as_user(null);
  perform t.ok((select count(*) from public.communes) = 33, 'anonyme : 33 communes lisibles');
  perform t.ok((select count(*) from public.species) = 11, 'anonyme : 11 catégories d''espèces lisibles');
  perform t.fails($q$select * from public.profiles$q$, 'anonyme : profils inaccessibles');
  perform t.ok((select count(*) from public.app_settings) = 2, 'anonyme : paramètres publics lisibles');
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.fails($q$insert into public.species (slug, name) values ('hack','Hack')$q$, 'un membre ne peut pas créer d''espèce');
  perform t.affects_none($q$update public.species set name = 'X' where slug = 'chiens'$q$, 'un membre ne peut pas modifier une espèce');
  perform t.as_user('00000000-0000-0000-0000-0000000000a1');
  perform t.ok((select count(*) from public.profiles) = 6, 'admin : voit les profils');
  insert into public.species (slug, name) values ('insectes','Insectes');
  perform t.ok(true, 'un administrateur peut créer une espèce');
end $$;

-- 4. Profil : champs protégés
do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  update public.profiles set bio = 'Salut', commune_id = (select id from public.communes where name = 'Nouméa')
   where id = auth.uid();
  perform t.ok((select bio from public.profiles where id = auth.uid()) = 'Salut', 'un membre modifie sa présentation');
  perform t.fails($q$update public.profiles set status = 'banned' where id = auth.uid()$q$, 'un membre ne peut pas changer son statut');
  perform t.fails($q$update public.profiles set created_at = now() - interval '1 year' where id = auth.uid()$q$, 'created_at non modifiable');
  perform t.affects_none($q$update public.profiles set bio = 'piraté' where id = '00000000-0000-0000-0000-00000000000b'$q$, 'impossible de modifier le profil d''un autre');
  perform t.fails($q$insert into public.profiles (id, handle, display_name) values (gen_random_uuid(), 'fake', 'Fake')$q$, 'insertion directe de profil interdite');
  perform t.fails($q$update public.profiles set handle = 'Majuscule' where id = auth.uid()$q$, 'pseudonyme invalide refusé');
end $$;

-- 5. Rôles du personnel et audit
do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.fails($q$insert into public.staff_roles (profile_id, role) values (auth.uid(), 'super_admin')$q$, 'auto-promotion impossible');
  perform t.fails($q$insert into public.audit_log (action, entity) values ('x','y')$q$, 'écriture directe dans l''audit impossible');
  perform t.fails($q$select public.log_audit('x','y','z')$q$, 'log_audit réservé au personnel');
  perform t.ok((select count(*) from public.audit_log) = 0, 'un membre ne lit pas l''audit');
  perform t.as_user('00000000-0000-0000-0000-0000000000a1');
  perform public.log_audit('test', 'profiles', 'abc', '{"k":1}');
  perform t.ok((select count(*) from public.audit_log) = 1, 'le personnel écrit et lit l''audit');
  insert into public.staff_roles (profile_id, role) values ('00000000-0000-0000-0000-00000000000d', 'moderator');
  perform t.ok(true, 'un super-admin attribue un rôle');
  perform t.as_user('00000000-0000-0000-0000-00000000000d');
  perform t.fails($q$insert into public.staff_roles (profile_id, role) values (auth.uid(), 'admin')$q$, 'un modérateur ne s''élève pas au rang d''admin');
  perform t.fails($q$insert into public.species (slug,name) values ('mod','Mod')$q$, 'un modérateur ne gère pas les espèces');
  delete from public.staff_roles where profile_id = '00000000-0000-0000-0000-00000000000d';
  perform t.as_user('00000000-0000-0000-0000-0000000000a1');
  delete from public.staff_roles where profile_id = '00000000-0000-0000-0000-00000000000d';
  perform t.ok(not exists (select 1 from public.staff_roles where profile_id = '00000000-0000-0000-0000-00000000000d'), 'seul le super-admin retire un rôle');
  perform t.as_service();
  perform t.fails($q$update public.audit_log set action = 'falsifié'$q$, 'audit immuable (UPDATE) même pour service_role');
  perform t.fails($q$delete from public.audit_log$q$, 'audit immuable (DELETE) même pour service_role');
end $$;

-- 6. Animaux
do $$
declare chien uuid := (select id from public.species where slug = 'chiens'); hh uuid;
begin
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  insert into public.pets (owner_id, species_id, name, sex) values (auth.uid(), chien, 'Rex', 'male');
  insert into public.pets (owner_id, species_id, name, is_private) values (auth.uid(), chien, 'Secret', true);
  perform t.ok((select count(*) from public.pets) = 2, 'le propriétaire voit tous ses animaux');
  perform t.fails($q$insert into public.pets (owner_id, species_id, name)
        values ('00000000-0000-0000-0000-00000000000b', (select id from public.species limit 1), 'Volé')$q$,
        'impossible de créer un animal au nom d''un autre');
  perform t.fails($q$insert into public.pets (owner_id, species_id, name, birth_date)
        values (auth.uid(), (select id from public.species limit 1), 'Futur', current_date + 5)$q$, 'date de naissance future refusée');
  perform t.fails($q$update public.pets set owner_id = '00000000-0000-0000-0000-00000000000b'$q$, 'transfert de propriété par le client interdit');
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.ok((select count(*) from public.pets) = 1 and (select name from public.pets limit 1) = 'Rex',
               'un autre membre voit l''animal public mais pas le privé');
  perform t.affects_none($q$update public.pets set name = 'Piraté' where name = 'Rex'$q$, 'impossible de modifier l''animal d''un autre');
  -- Foyer
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  hh := public.create_household('Famille Alice');
  perform t.ok(exists (select 1 from public.households where id = hh), 'création de foyer');
  update public.pets set household_id = hh where name = 'Rex';
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.ok((select count(*) from public.households) = 0, 'un foyer n''est visible que de ses membres');
  perform t.fails(format($q$insert into public.pets (owner_id, species_id, name, household_id)
        values (auth.uid(), (select id from public.species limit 1), 'Intrus', %L)$q$, hh), 'impossible de rattacher un animal au foyer d''autrui');
end $$;

-- 7. Profil privé et abonnements
do $$
declare chien uuid := (select id from public.species where slug = 'chiens'); carol_pet uuid;
begin
  perform t.as_user('00000000-0000-0000-0000-00000000000c');
  insert into public.pets (owner_id, species_id, name) values (auth.uid(), chien, 'Luna') returning id into carol_pet;
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.ok((select count(*) from public.pets where name = 'Luna') = 0, 'animal d''un profil privé invisible sans abonnement');
  insert into public.follows (follower_id, target_type, target_id, status)
    values (auth.uid(), 'profile', '00000000-0000-0000-0000-00000000000c', 'accepted');   -- tentative de forcer « accepted »
  perform t.ok((select status from public.follows where follower_id = auth.uid()) = 'pending',
               'le statut du follow est imposé par la base (pending pour un profil privé)');
  perform t.ok((select count(*) from public.pets where name = 'Luna') = 0, 'toujours invisible tant que non accepté');
  perform t.affects_none($q$update public.follows set status = 'accepted' where follower_id = auth.uid()$q$, 'on ne s''auto-accepte pas');
  perform t.fails($q$insert into public.follows (follower_id, target_type, target_id)
        values ('00000000-0000-0000-0000-00000000000a', 'profile', '00000000-0000-0000-0000-00000000000c')$q$, 'impossible de suivre au nom d''un autre');
  perform t.as_user('00000000-0000-0000-0000-00000000000c');
  perform t.ok((select count(*) from public.follows) = 1, 'la propriétaire voit la demande');
  update public.follows set status = 'accepted' where target_id = auth.uid();
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.ok((select count(*) from public.pets where name = 'Luna') = 1, 'visible après acceptation');
  perform t.fails($q$insert into public.follows (follower_id, target_type, target_id)
        values (auth.uid(), 'profile', auth.uid())$q$, 'auto-abonnement refusé');
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.ok((select count(*) from public.follows) = 0, 'les follows des autres sont invisibles');
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  insert into public.follows (follower_id, target_type, target_id) values (auth.uid(), 'pet', carol_pet);
  perform t.ok(true, 'abonnement à un animal');
end $$;

-- 8. Blocage
do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  insert into public.follows (follower_id, target_type, target_id)
    values (auth.uid(), 'profile', '00000000-0000-0000-0000-00000000000a');
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-00000000000b');
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.ok((select count(*) from public.pets where owner_id = '00000000-0000-0000-0000-00000000000a') = 0, 'bloqué : ne voit plus les animaux du bloqueur');
  perform t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 0, 'bloqué : ne voit plus le profil du bloqueur');
  perform t.ok((select count(*) from public.follows where target_id = '00000000-0000-0000-0000-00000000000a') = 0, 'le blocage supprime l''abonnement');
  perform t.fails($q$insert into public.follows (follower_id, target_type, target_id)
        values (auth.uid(), 'profile', '00000000-0000-0000-0000-00000000000a')$q$, 'bloqué : ne peut plus s''abonner');
  perform t.ok((select count(*) from public.blocks) = 0, 'le bloqué ne voit pas le blocage');
  perform t.as_user('00000000-0000-0000-0000-00000000000a');
  perform t.ok((select count(*) from public.pets where owner_id = '00000000-0000-0000-0000-00000000000b') = 0, 'le blocage vaut dans les deux sens');
  delete from public.blocks where blocker_id = auth.uid();
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 1, 'déblocage rétablit la visibilité');
end $$;

-- 9. Documents légaux et consentements
do $$ begin
  reset role;
  insert into public.legal_documents (kind, version, body, published_at) values
    ('cgu', '1.0', 'CGU', now() - interval '1 day'), ('cgu', '2.0', 'Brouillon', null);
  perform t.as_user(null);
  perform t.ok((select count(*) from public.legal_documents) = 1, 'anonyme : seuls les documents publiés sont lisibles');
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  insert into public.consents (user_id, doc_kind, version) values (auth.uid(), 'cgu', '1.0');
  perform t.fails($q$insert into public.consents (user_id, doc_kind, version) values (auth.uid(), 'cgu', '2.0')$q$, 'consentement à un brouillon refusé');
  perform t.fails($q$insert into public.consents (user_id, doc_kind, version) values ('00000000-0000-0000-0000-00000000000a', 'cgu', '1.0')$q$, 'consentement au nom d''un autre refusé');
end $$;

-- 10. Suppression de compte
do $$ begin
  perform t.as_user('00000000-0000-0000-0000-00000000000d');
  insert into public.pets (owner_id, species_id, name) values (auth.uid(), (select id from public.species where slug='chats'), 'Mimi');
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.ok((select count(*) from public.pets where name = 'Mimi') = 1, 'avant suppression : animal visible');
  perform t.as_user('00000000-0000-0000-0000-00000000000d');
  perform public.delete_account();
  perform t.as_user('00000000-0000-0000-0000-00000000000b');
  perform t.ok((select count(*) from public.pets where name = 'Mimi') = 0, 'après suppression : animal masqué');
  perform t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000d') = 0, 'après suppression : profil masqué');
  reset role;
  perform t.ok((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000d') = 'Compte supprimé', 'données personnelles effacées');
  perform t.as_user('00000000-0000-0000-0000-00000000000d');
  perform t.affects_none($q$update public.profiles set bio = 'zombie' where id = auth.uid()$q$, 'un compte supprimé ne peut plus rien modifier');
  perform t.as_user(null);
  perform t.fails($q$select public.delete_account()$q$, 'delete_account exige une session');
end $$;

reset role;
select format('%s vérifications réussies sur %s', count(*) filter (where ok), count(*)) as resultat from t.results;
