\set ON_ERROR_STOP 0
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222') on conflict do nothing;
insert into public.records(collection,id,owner_id,data) values ('annonce','901','11111111-1111-1111-1111-111111111111','{"publie":true}') on conflict do nothing;
update public.parametres set valeur='off' where cle='mode_tarifs';
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
\echo '1. commande a_payer sur son annonce (doit réussir)'
insert into public.options_annonce(annonce_id,option,prix,statut) values (901,'urgent',1500,'a_payer');
\echo '2. auto-activation en mode off (doit ÉCHOUER)'
insert into public.options_annonce(annonce_id,option,prix,statut,debut,fin) values (901,'une',0,'active',now(),now()+interval '1 year');
\echo '3. activer_option par un utilisateur (doit ÉCHOUER)'
select public.activer_option(1);
\echo '4. modification de sa commande en active (0 ligne attendue)'
update public.options_annonce set statut='active' where annonce_id=901;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
\echo '5. commande sur l annonce d un autre (doit ÉCHOUER)'
insert into public.options_annonce(annonce_id,option,prix,statut) values (901,'urgent',0,'a_payer');
\echo '6. essai pro puis 2e essai (2e doit ÉCHOUER)'
insert into public.abonnements(role,formule,statut) values ('art','pro','essai');
insert into public.abonnements(role,formule,statut) values ('art','pro','essai');
\echo '7. abonnement actif auto-déclaré (doit ÉCHOUER)'
insert into public.abonnements(role,formule,statut,fin) values ('agt','premium','actif',now()+interval '10 years');
reset role;
\echo '8. admin active la commande 1'
select public.activer_option(id) from public.options_annonce where statut='a_payer' and annonce_id=901;
update public.parametres set valeur='lancement' where cle='mode_tarifs';
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
\echo '9. mode lancement : option offerte active (doit réussir, prix forcé 0, fin 7 j)'
insert into public.options_annonce(annonce_id,option,prix,statut,fin) values (901,'une',5900,'active',now()+interval '5 years');
set role anon;
\echo '10. visiteur : options actives visibles'
select option, statut, prix, (fin - debut) as duree from public.options_annonce order by id;
reset role;
select a.role,a.statut,(a.fin-a.debut) duree from public.abonnements a;
update public.parametres set valeur='off' where cle='mode_tarifs';
delete from public.options_annonce; delete from public.abonnements; delete from public.records where id='901'; delete from auth.users where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
