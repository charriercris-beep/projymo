-- Immo360 NC — schéma Supabase + sécurité par ligne (RLS)
-- À exécuter une fois dans Supabase > SQL Editor. Idempotent (peut être rejoué).

create table if not exists public.biens (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titre       text not null,
  type        text,
  surface     int,
  pieces      int,
  chambres    int,
  prix        bigint,
  quartier    text,
  ville       text,
  etat        text,
  dpe         text,
  description text,
  features    jsonb default '[]'::jsonb,
  statut      text default 'En vente',
  agent       text,
  tel         text,
  ref         text,
  created_at  timestamptz not null default now()
);

create table if not exists public.users (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nom        text,
  email      text,
  tel        text,
  profil     text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  bien_id    bigint references public.biens(id) on delete set null,
  from_user  uuid default auth.uid() references auth.users(id) on delete set null,
  to_user    uuid references auth.users(id) on delete set null,
  contenu    text not null,
  lu         boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.rdv (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bien_id    bigint references public.biens(id) on delete set null,
  date_rdv   timestamptz,
  nom        text,
  tel        text,
  notes      text,
  created_at timestamptz not null default now()
);

-- Base créée par une version antérieure du site (ex. colonne user_id au lieu de owner_id) :
-- les colonnes manquantes sont ajoutées, rien n'est supprimé ; le propriétaire est repris de user_id.
do $$
declare t text;
begin
  foreach t in array array['biens', 'users', 'rdv'] loop
    execute format('alter table public.%I add column if not exists owner_id uuid references auth.users(id) on delete cascade', t);
    execute format('alter table public.%I alter column owner_id set default auth.uid()', t);
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'user_id' and data_type = 'uuid') then
      execute format('update public.%I set owner_id = user_id where owner_id is null and user_id in (select id from auth.users)', t);
    end if;
    execute format('alter table public.%I add column if not exists created_at timestamptz not null default now()', t);
  end loop;
  alter table public.messages add column if not exists from_user uuid references auth.users(id) on delete set null;
  alter table public.messages alter column from_user set default auth.uid();
  alter table public.messages add column if not exists to_user uuid references auth.users(id) on delete set null;
  alter table public.messages add column if not exists lu boolean not null default false;
  alter table public.messages add column if not exists created_at timestamptz not null default now();
end $$;

alter table public.biens    enable row level security;
alter table public.users    enable row level security;
alter table public.messages enable row level security;
alter table public.rdv      enable row level security;

-- biens : annonces lisibles par tous (landing / mode visiteur), modifiables par leur propriétaire
drop policy if exists biens_read   on public.biens;
drop policy if exists biens_insert on public.biens;
drop policy if exists biens_update on public.biens;
drop policy if exists biens_delete on public.biens;
create policy biens_read   on public.biens for select using (true);
create policy biens_insert on public.biens for insert to authenticated with check (owner_id = auth.uid());
create policy biens_update on public.biens for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy biens_delete on public.biens for delete to authenticated using (owner_id = auth.uid());

-- users (contacts/acheteurs saisis par un agent) : strictement privés à leur créateur
drop policy if exists users_all on public.users;
create policy users_all on public.users for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- messages : visibles par l'expéditeur et le destinataire
drop policy if exists messages_read   on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
create policy messages_read   on public.messages for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
create policy messages_insert on public.messages for insert to authenticated with check (from_user = auth.uid());
create policy messages_update on public.messages for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());

-- rdv : privés à leur créateur
drop policy if exists rdv_all on public.rdv;
create policy rdv_all on public.rdv for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists biens_created_idx on public.biens (created_at desc);
create index if not exists messages_users_idx on public.messages (from_user, to_user);

-- Demandes de devis aux artisans — PREMIÈRE VERSION, remplacée par public.records (collections devis,
-- devis_reponse, devis_contact). Conservée pour ne pas casser une base déjà initialisée ; inutilisée par l'application.
create table if not exists public.devis_requests (
  id           bigint generated always as identity primary key,
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bien         jsonb,
  postes       jsonb,
  budget       bigint,
  artisan_ids  jsonb default '[]'::jsonb,
  message      text,
  contact_nom  text,
  contact_tel  text,
  delai        text,
  statut       text not null default 'En attente',
  created_at   timestamptz not null default now()
);
alter table public.devis_requests enable row level security;
drop policy if exists devis_owner on public.devis_requests;
create policy devis_owner on public.devis_requests for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Lecture par les artisans destinataires : ajoutée avec l'espace Artisan (table des professionnels).

-- ============================================================
-- Espaces métiers : socle commun
-- ============================================================
create table if not exists public.professionnels (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role        text not null check (role in ('artisan','notaire','banquier','courtier','diagnostiqueur','geometre','assureur','agent')),
  nom         text not null,
  ridet       text,
  tel         text,
  email       text,
  bio         text,
  metiers     text[] not null default '{}',
  zones       text[] not null default '{}',
  verifie     boolean not null default false,  -- validé par l'équipe Immo360 (jamais par le pro lui-même)
  created_at  timestamptz not null default now(),
  unique (owner_id, role)
);
create table if not exists public.justificatifs (
  id          bigint generated always as identity primary key,
  pro_id      bigint not null references public.professionnels(id) on delete cascade,
  type        text not null,            -- ridet, decennale, qualification, rcpro, cma, patente, cafat…
  reference   text,
  emetteur    text,
  expire_le   date,
  fichier_url text,
  created_at  timestamptz not null default now()
);
alter table public.devis_requests add column if not exists metiers jsonb default '[]'::jsonb;

create table if not exists public.devis_reponses (
  id             bigint generated always as identity primary key,
  devis_id       bigint references public.devis_requests(id) on delete cascade,
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lignes         jsonb not null default '[]'::jsonb,
  total_ht       bigint,
  total_ttc      bigint,
  validite_jours int,
  delai          text,
  note           text,
  statut         text not null default 'envoye',
  created_at     timestamptz not null default now()
);

alter table public.professionnels enable row level security;
alter table public.justificatifs  enable row level security;
alter table public.devis_reponses enable row level security;

-- Annuaire : fiches lisibles par tous ; modifiables uniquement par leur propriétaire, sans pouvoir s'auto-vérifier
drop policy if exists pro_read on public.professionnels;
drop policy if exists pro_insert on public.professionnels;
drop policy if exists pro_update on public.professionnels;
drop policy if exists pro_delete on public.professionnels;
create policy pro_read   on public.professionnels for select using (true);
create policy pro_insert on public.professionnels for insert to authenticated with check (owner_id = auth.uid());
create policy pro_update on public.professionnels for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Le champ « verifie » ne peut être modifié que par l'administration (éditeur SQL ou clé service_role),
-- jamais par un utilisateur connecté via l'API (rôles authenticated / anon).
create or replace function public.protect_pro_verifie() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then new.verifie := false; else new.verifie := old.verifie; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_pro_verifie on public.professionnels;
create trigger trg_protect_pro_verifie before insert or update on public.professionnels
  for each row execute function public.protect_pro_verifie();
create policy pro_delete on public.professionnels for delete to authenticated using (owner_id = auth.uid());

-- Justificatifs : privés au professionnel
drop policy if exists justif_owner on public.justificatifs;
create policy justif_owner on public.justificatifs for all to authenticated
  using (exists (select 1 from public.professionnels p where p.id = pro_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.professionnels p where p.id = pro_id and p.owner_id = auth.uid()));

-- Demandes de devis : un artisan voit celles qui concernent un de ses métiers
drop policy if exists devis_artisan_read on public.devis_requests;
create policy devis_artisan_read on public.devis_requests for select to authenticated
  using (exists (select 1 from public.professionnels p
                 where p.owner_id = auth.uid() and p.role = 'artisan' and devis_requests.metiers ?| p.metiers));

-- Réponses : l'artisan gère les siennes ; le demandeur lit celles reçues sur ses demandes
drop policy if exists rep_owner on public.devis_reponses;
drop policy if exists rep_client_read on public.devis_reponses;
create policy rep_owner on public.devis_reponses for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy rep_client_read on public.devis_reponses for select to authenticated
  using (exists (select 1 from public.devis_requests d where d.id = devis_id and d.owner_id = auth.uid()));

-- ============================================================
-- Synchronisation des espaces (js/sync.js) : enregistrements partagés
-- ============================================================
-- Un enregistrement appartient à son créateur (owner_id). Il peut viser un public professionnel
-- (audience_role, et éventuellement des métiers) : seuls les professionnels VÉRIFIÉS de ce rôle
-- le voient. Un professionnel qui le prend en charge en devient l'« assignee » et peut le modifier.
create table if not exists public.records (
  collection        text not null,             -- fin, notaire, devis, devis_reponse, mission_diag, mission_geo, mission_ass
  id                text not null,
  owner_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  audience_role     text,
  audience_metiers  text[],
  parent_id         text,                      -- ex. réponse d'artisan → demande de devis
  assignee          uuid references auth.users(id) on delete set null,
  data              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists records_audience_idx on public.records (collection, audience_role);
create index if not exists records_parent_idx on public.records (parent_id);
alter table public.records enable row level security;

-- Professionnel vérifié du rôle demandé (et d'au moins un des métiers, si précisés)
create or replace function public.is_verified_pro(p_role text, p_metiers text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.professionnels p
                 where p.owner_id = auth.uid() and p.role = p_role and p.verifie
                   and (p_metiers is null or cardinality(p_metiers) = 0 or p.metiers && p_metiers));
$$;
-- Propriétaire d'un enregistrement parent (lu sans RLS pour éviter la récursion des politiques)
create or replace function public.record_owner(p_collection text, p_id text)
returns uuid language sql stable security definer set search_path = public as $$
  select owner_id from public.records where collection = p_collection and id = p_id;
$$;

drop policy if exists rec_select on public.records;
drop policy if exists rec_insert on public.records;
drop policy if exists rec_update on public.records;
drop policy if exists rec_delete on public.records;
create policy rec_select on public.records for select to authenticated using (
  owner_id = auth.uid()
  or assignee = auth.uid()
  -- demande encore ouverte : visible des professionnels vérifiés visés ; une fois prise en charge, elle ne l'est plus
  or (audience_role is not null and assignee is null and public.is_verified_pro(audience_role, audience_metiers))
  or (collection = 'devis_reponse' and public.record_owner('devis', parent_id) = auth.uid())
);
create policy rec_insert on public.records for insert to authenticated with check (owner_id = auth.uid() and assignee is null);
create policy rec_update on public.records for update to authenticated
  using (owner_id = auth.uid() or assignee = auth.uid()
         or (assignee is null and audience_role is not null and public.is_verified_pro(audience_role, audience_metiers)))
  with check (owner_id = auth.uid() or assignee = auth.uid());
create policy rec_delete on public.records for delete to authenticated using (owner_id = auth.uid());
-- Contenus publics une fois publiés (annonces, photos d'annonces, visites vidéo) : visibles de tous,
-- y compris des visiteurs non connectés ; modifiables uniquement par leur auteur (politiques ci-dessus)
drop policy if exists rec_visite_public on public.records;
drop policy if exists rec_public on public.records;
create policy rec_public on public.records for select to anon, authenticated
  using (collection in ('visite', 'annonce', 'annonce_photos') and coalesce((data->>'publie')::boolean, false));

-- Un non-propriétaire ne peut ni changer le propriétaire ni le public visé ; en modifiant, il prend en charge
create or replace function public.records_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- Contenu retiré par la modération (back office) : son auteur ne peut pas le remettre en ligne
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') and coalesce((old.data->>'modere')::boolean, false) then
    new.data := new.data || jsonb_build_object('publie', false, 'modere', true, 'motif', old.data->'motif');
  end if;
  if tg_op = 'UPDATE' and old.owner_id is distinct from auth.uid() and current_user in ('authenticated', 'anon') then
    new.owner_id := old.owner_id; new.collection := old.collection; new.id := old.id;
    new.audience_role := old.audience_role; new.audience_metiers := old.audience_metiers; new.parent_id := old.parent_id;
    new.assignee := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_records_guard on public.records;
create trigger trg_records_guard before insert or update on public.records
  for each row execute function public.records_guard();

-- ============================================================
-- Administration : vérifier un professionnel (à exécuter dans l'éditeur SQL de Supabase)
-- ============================================================
-- select id, role, nom, ridet, metiers, verifie, created_at from public.professionnels where not verifie order by created_at;
-- update public.professionnels set verifie = true where id = <id>;   -- après contrôle des justificatifs

-- ============================================================
-- Monétisation (tarifs : js/tarifs.js ; procédure : docs/monetisation.md)
-- Principe : un utilisateur peut COMMANDER (statut « a_payer »), jamais s'activer lui-même une option
-- ou un abonnement payant. L'activation se fait ici, par l'administrateur, après paiement.
-- Seules exceptions, décidées par la base : options offertes en mode « lancement », et l'essai gratuit
-- d'un professionnel (une seule fois par métier).
-- ============================================================
create table if not exists public.parametres (cle text primary key, valeur text not null);
alter table public.parametres enable row level security;
drop policy if exists par_select on public.parametres;
create policy par_select on public.parametres for select to anon, authenticated using (true);
insert into public.parametres (cle, valeur) values ('mode_tarifs', 'off') on conflict (cle) do nothing;
create or replace function public.mode_tarifs() returns text language sql stable security definer set search_path = public as $$
  select coalesce((select valeur from public.parametres where cle = 'mode_tarifs'), 'off');
$$;

-- Options d'annonce
create or replace function public.option_jours(p text) returns int language sql immutable as $$
  select case p when 'remontee' then 1 when 'remontee7' then 7 when 'une' then 7 else 30 end;
$$;
create table if not exists public.options_annonce (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  annonce_id  bigint not null,
  option      text not null check (option in ('urgent', 'negociable', 'remontee', 'remontee7', 'une', 'couleur', 'portes')),
  info        text check (info is null or length(info) <= 20),   -- date des portes ouvertes
  prix        integer not null default 0 check (prix >= 0),       -- montant annoncé au client (à vérifier avant activation)
  statut      text not null default 'a_payer' check (statut in ('a_payer', 'active', 'annulee')),
  debut       timestamptz,
  fin         timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists options_annonce_idx on public.options_annonce (annonce_id);
alter table public.options_annonce enable row level security;
drop policy if exists opt_public on public.options_annonce;
drop policy if exists opt_own on public.options_annonce;
drop policy if exists opt_insert on public.options_annonce;
create policy opt_public on public.options_annonce for select to anon, authenticated using (statut = 'active' and fin > now());
create policy opt_own on public.options_annonce for select to authenticated using (owner_id = auth.uid());
-- Formule Agence+ : 2 « À la une » offertes par mois (abonnement actif, compteur tenu par la base)
-- (plpgsql : le corps n'est vérifié qu'à l'exécution, la table abonnements est créée plus bas)
create or replace function public.une_offerte_ok() returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from public.abonnements a where a.owner_id = auth.uid() and a.role = 'agt' and a.formule = 'premium' and a.statut = 'actif' and a.fin > now())
     and (select count(*) from public.options_annonce o where o.owner_id = auth.uid() and o.option = 'une' and o.prix = 0 and o.statut = 'active'
          and o.created_at >= date_trunc('month', now())) < 2;
end $$;
-- commande sur SA propre annonce ; « active » d'emblée seulement si offerte : mode lancement (base),
-- ou « À la une » incluse dans la formule Agence+ (dans la limite de 2 par mois)
create policy opt_insert on public.options_annonce for insert to authenticated with check (
  owner_id = auth.uid()
  and public.record_owner('annonce', annonce_id::text) = auth.uid()
  and (statut = 'a_payer' or (statut = 'active' and (public.mode_tarifs() = 'lancement' or (option = 'une' and public.une_offerte_ok()))))
);
-- (aucune politique update / delete : seul l'administrateur modifie une commande)
create or replace function public.options_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.statut = 'active' then  -- offerte (mode lancement) : dates fixées par la base
      new.prix := 0; new.debut := now(); new.fin := now() + make_interval(days => public.option_jours(new.option));
    else new.debut := null; new.fin := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_options_guard on public.options_annonce;
create trigger trg_options_guard before insert on public.options_annonce for each row execute function public.options_guard();
create or replace function public.activer_option(p_id bigint) returns void language sql security definer set search_path = public as $$
  update public.options_annonce set statut = 'active', debut = now(), fin = now() + make_interval(days => public.option_jours(option)) where id = p_id;
$$;
revoke execute on function public.activer_option(bigint) from public, anon, authenticated;

-- Abonnements des professionnels (historique : la ligne en cours est la plus récente encore valide)
create table if not exists public.abonnements (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role        text not null check (role in ('agt', 'art', 'bnk', 'not', 'diag', 'geo', 'ass')),
  formule     text not null,
  prix        integer not null default 0 check (prix >= 0),        -- prix mensuel annoncé
  statut      text not null default 'a_payer' check (statut in ('a_payer', 'essai', 'actif', 'termine')),
  debut       timestamptz,
  fin         timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists abonnements_owner_idx on public.abonnements (owner_id, role);
alter table public.abonnements enable row level security;
drop policy if exists abo_own on public.abonnements;
drop policy if exists abo_insert on public.abonnements;
create policy abo_own on public.abonnements for select to authenticated using (owner_id = auth.uid());
create policy abo_insert on public.abonnements for insert to authenticated with check (owner_id = auth.uid() and statut in ('a_payer', 'essai'));
create or replace function public.abonnements_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.statut = 'essai' then
      if exists (select 1 from public.abonnements a where a.owner_id = new.owner_id and a.role = new.role and a.statut in ('essai', 'actif')) then
        raise exception 'Essai déjà utilisé pour ce métier';
      end if;
      new.prix := 0; new.debut := now(); new.fin := now() + interval '30 days';
    else new.debut := null; new.fin := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_abonnements_guard on public.abonnements;
create trigger trg_abonnements_guard before insert on public.abonnements for each row execute function public.abonnements_guard();
create or replace function public.activer_abonnement(p_id bigint, p_mois int) returns void language sql security definer set search_path = public as $$
  update public.abonnements set statut = 'actif', debut = coalesce(debut, now()), fin = greatest(coalesce(fin, now()), now()) + make_interval(months => p_mois) where id = p_id;
$$;
revoke execute on function public.activer_abonnement(bigint, int) from public, anon, authenticated;

-- ============================================================
-- Back office (admin.html) : réservé aux comptes listés dans public.admins
-- Toutes les fonctions admin_* vérifient is_admin() : appelées par quelqu'un d'autre, elles refusent.
-- Donner l'accès (une seule fois, avec votre adresse) :
--   insert into public.admins (user_id) select id from auth.users where email = 'votre@adresse.nc';
-- ============================================================
create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table public.admins enable row level security;   -- aucune politique : invisible depuis le site
alter table public.professionnels add column if not exists refuse_le timestamptz;
alter table public.professionnels add column if not exists refus_motif text;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
create or replace function public.admin_garde() returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.is_admin() then raise exception 'Accès réservé à l''administrateur'; end if; end $$;

create or replace function public.admin_moi() returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(public.is_admin());
$$;
-- Professionnels : en attente, puis les plus récents traités
create or replace function public.admin_pros() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_garde();
  return coalesce((select jsonb_agg(x order by x.attente desc, x.created_at desc) from (
    select p.id, p.role, p.nom, p.ridet, p.tel, p.email, p.metiers, p.zones, p.verifie, p.refuse_le, p.refus_motif, p.created_at,
           (not p.verifie and p.refuse_le is null) as attente, u.email as compte
    from public.professionnels p left join auth.users u on u.id = p.owner_id
    order by (not p.verifie and p.refuse_le is null) desc, p.created_at desc limit 200) x), '[]'::jsonb);
end $$;
create or replace function public.admin_pro_decider(p_id bigint, p_ok boolean, p_motif text default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_garde();
  if p_ok then update public.professionnels set verifie = true, refuse_le = null, refus_motif = null where id = p_id;
  else update public.professionnels set verifie = false, refuse_le = now(), refus_motif = left(coalesce(p_motif, ''), 300) where id = p_id; end if;
  return jsonb_build_object('ok', found);
end $$;
-- Commandes à régler (options d'annonce et abonnements)
create or replace function public.admin_commandes() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_garde();
  return coalesce((select jsonb_agg(x order by x.created_at) from (
    select 'option' as type, o.id, o.option as quoi, o.annonce_id::text as cible, o.prix, o.info, o.created_at, u.email
      from public.options_annonce o left join auth.users u on u.id = o.owner_id where o.statut = 'a_payer'
    union all
    select 'abonnement', a.id, a.formule, a.role, a.prix, null, a.created_at, u.email
      from public.abonnements a left join auth.users u on u.id = a.owner_id where a.statut = 'a_payer') x), '[]'::jsonb);
end $$;
create or replace function public.admin_payer(p_type text, p_id bigint, p_mois int default 1) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_garde();
  if p_type = 'option' then perform public.activer_option(p_id);
  elsif p_type = 'abonnement' then perform public.activer_abonnement(p_id, greatest(1, least(coalesce(p_mois, 1), 24)));
  else raise exception 'Type inconnu'; end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.admin_annuler(p_type text, p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_garde();
  if p_type = 'option' then update public.options_annonce set statut = 'annulee' where id = p_id and statut = 'a_payer';
  elsif p_type = 'abonnement' then update public.abonnements set statut = 'termine' where id = p_id and statut = 'a_payer';
  else raise exception 'Type inconnu'; end if;
  return jsonb_build_object('ok', found);
end $$;
-- Annonces : les plus récentes (recherche facultative sur le titre, la commune ou l'email)
create or replace function public.admin_annonces(p_q text default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_garde();
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select r.id, r.data->>'titre' as titre, r.data->>'type' as type, (r.data->>'prix') as prix, r.data->>'ville' as ville, r.data->>'quartier' as quartier,
           coalesce((r.data->>'publie')::boolean, false) as publie, coalesce((r.data->>'modere')::boolean, false) as modere, r.data->>'motif' as motif,
           (r.data->>'nbPhotos') as photos, r.created_at, u.email
    from public.records r left join auth.users u on u.id = r.owner_id
    where r.collection = 'annonce' and (p_q is null or p_q = '' or (r.data->>'titre') ilike '%' || p_q || '%' or (r.data->>'ville') ilike '%' || p_q || '%'
                                         or (r.data->>'quartier') ilike '%' || p_q || '%' or u.email ilike '%' || p_q || '%')
    order by r.created_at desc limit 200) x), '[]'::jsonb);
end $$;
-- Retirer (ou rétablir) une annonce : annonce, photos et visite vidéo
create or replace function public.admin_moderer(p_id text, p_retirer boolean, p_motif text default null) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_garde();
  update public.records set data = data || jsonb_build_object('publie', not p_retirer, 'modere', p_retirer, 'motif', case when p_retirer then left(coalesce(p_motif, ''), 300) else null end), updated_at = now()
   where collection = 'annonce' and id = p_id;
  update public.records set data = data || jsonb_build_object('publie', not p_retirer, 'modere', p_retirer), updated_at = now()
   where (collection = 'annonce_photos' and id = p_id) or (collection = 'visite' and id = 'v' || p_id);
  return jsonb_build_object('ok', true);
end $$;
-- Prix modifiés depuis le back office (remplacent ceux de js/tarifs.js) ; '{}' = prix par défaut
create or replace function public.admin_tarifs(p_tarifs jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare g text; k text; v jsonb;
begin
  perform public.admin_garde();
  if jsonb_typeof(p_tarifs) <> 'object' then raise exception 'Format invalide'; end if;
  for g in select jsonb_object_keys(p_tarifs) loop
    if g not in ('options', 'packs', 'abonnements', 'services') or jsonb_typeof(p_tarifs->g) <> 'object' then raise exception 'Rubrique invalide : %', g; end if;
    for k, v in select * from jsonb_each(p_tarifs->g) loop
      if jsonb_typeof(v) <> 'number' or (v::text)::numeric < 0 or (v::text)::numeric > 10000000 then raise exception 'Prix invalide pour %', k; end if;
    end loop;
  end loop;
  insert into public.parametres (cle, valeur) values ('tarifs', p_tarifs::text) on conflict (cle) do update set valeur = excluded.valeur;
  return p_tarifs;
end $$;
revoke execute on function public.admin_tarifs(jsonb) from public, anon;
grant execute on function public.admin_tarifs(jsonb) to authenticated;
-- Interrupteur de la partie payante (le site le lit au chargement)
create or replace function public.admin_mode(p_mode text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_garde();
  if p_mode not in ('off', 'lancement', 'payant') then raise exception 'Mode inconnu'; end if;
  update public.parametres set valeur = p_mode where cle = 'mode_tarifs';
  return to_jsonb(p_mode);
end $$;
-- Journal d'événements ANONYMES (entonnoirs du tableau de bord) : aucun identifiant de personne,
-- ni compte, ni adresse IP ; seulement le nom de l'action, le profil (vendeur, acheteur, visiteur…),
-- le type d'appareil et la date. Écriture ouverte (liste fermée de noms), lecture réservée à l'admin.
create table if not exists public.evenements (
  id         bigint generated always as identity primary key,
  nom        text not null check (nom in ('visite', 'recherche', 'fiche_vue', 'favori', 'contact_vendeur', 'demande_visite', 'simulation_financement',
                                          'estimation', 'rapport_estimation', 'depot_debut', 'annonce_publiee', 'devis_demande', 'inscription', 'option_commande')),
  profil     text check (profil is null or profil in ('visiteur', 'sell', 'buy', 'agt', 'art', 'bnk', 'not', 'diag', 'geo', 'ass')),
  appareil   text check (appareil is null or appareil in ('mobile', 'ordinateur')),
  created_at timestamptz not null default now()
);
create index if not exists evenements_idx on public.evenements (nom, created_at);
alter table public.evenements enable row level security;
drop policy if exists evt_insert on public.evenements;
create policy evt_insert on public.evenements for insert to anon, authenticated with check (true);  -- contrôlé par les contraintes ci-dessus
-- (aucune politique de lecture : seul admin_kpis les compte)
-- Visiteurs uniques : identifiant ALÉATOIRE propre au navigateur (renouvelé au plus tard après 13 mois),
-- sans lien avec un compte ni une adresse IP ; sert uniquement à compter les visiteurs distincts.
alter table public.evenements add column if not exists visiteur text check (visiteur is null or visiteur ~ '^[a-z0-9]{8,24}$');
-- Provenance de la visite, zone (déduite du fuseau horaire de l'appareil), nouveau visiteur, et un détail
-- non personnel : commune ou type recherché (listes du site), numéro de l'annonce consultée.
alter table public.evenements add column if not exists source text check (source is null or source in ('direct', 'google', 'facebook', 'instagram', 'autre_reseau', 'autre_site'));
alter table public.evenements add column if not exists zone text check (zone is null or zone in ('nc', 'europe', 'autre'));
alter table public.evenements add column if not exists nouveau boolean;
alter table public.evenements add column if not exists detail text check (detail is null or (length(detail) <= 60 and detail !~ '[<>\x00-\x1f]'));
create index if not exists evenements_visiteur_idx on public.evenements (created_at, visiteur) where nom = 'visite';
-- Présence en direct : chaque onglet ouvert signale sa présence toutes les minutes (identifiant aléatoire
-- de l'onglet) ; une présence de plus de 2 minutes ne compte plus, au-delà de 15 minutes elle est effacée.
create table if not exists public.presence (
  sid      text primary key check (sid ~ '^[a-z0-9]{8,24}$'),
  appareil text check (appareil is null or appareil in ('mobile', 'ordinateur')),
  vu       timestamptz not null default now()
);
alter table public.presence enable row level security; -- aucune politique : accès uniquement par les fonctions ci-dessous
-- Détail anonyme de chaque visiteur en ligne : page en cours, zone, provenance, profil, arrivée
alter table public.presence add column if not exists page text check (page is null or page ~ '^[a-z0-9-]{1,30}$');
alter table public.presence add column if not exists zone text check (zone is null or zone in ('nc', 'europe', 'autre'));
alter table public.presence add column if not exists source text check (source is null or source in ('direct', 'google', 'facebook', 'instagram', 'autre_reseau', 'autre_site'));
alter table public.presence add column if not exists profil text check (profil is null or profil in ('visiteur', 'sell', 'buy', 'agt', 'art', 'bnk', 'not', 'diag', 'geo', 'ass'));
alter table public.presence add column if not exists debut timestamptz not null default now();
drop function if exists public.presence_ping(text, text);
create or replace function public.presence_ping(p_sid text, p_appareil text default null, p_page text default null, p_zone text default null,
                                                p_source text default null, p_profil text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_sid is null or p_sid !~ '^[a-z0-9]{8,24}$' then return; end if;
  insert into public.presence (sid, appareil, page, zone, source, profil, vu, debut)
    values (p_sid, case when p_appareil in ('mobile', 'ordinateur') then p_appareil end,
            case when p_page ~ '^[a-z0-9-]{1,30}$' then p_page end, case when p_zone in ('nc', 'europe', 'autre') then p_zone end,
            case when p_source in ('direct', 'google', 'facebook', 'instagram', 'autre_reseau', 'autre_site') then p_source end,
            case when p_profil in ('visiteur', 'sell', 'buy', 'agt', 'art', 'bnk', 'not', 'diag', 'geo', 'ass') then p_profil end, now(), now())
    on conflict (sid) do update set vu = now(), page = excluded.page, profil = excluded.profil,
      appareil = coalesce(excluded.appareil, presence.appareil), zone = coalesce(presence.zone, excluded.zone), source = coalesce(presence.source, excluded.source);
  delete from public.presence where vu < now() - interval '15 minutes';
end $$;
revoke execute on function public.presence_ping(text, text, text, text, text, text) from public;
grant execute on function public.presence_ping(text, text, text, text, text, text) to anon, authenticated;

-- Tableau de bord : tous les indicateurs en un appel (données agrégées, aucune donnée personnelle)
create or replace function public.admin_kpis() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform public.admin_garde();
  with ann as (
    select r.id, r.created_at, r.data, coalesce((r.data->>'publie')::boolean, false) as publie, coalesce((r.data->>'modere')::boolean, false) as modere,
           nullif(r.data->>'prix', '')::numeric as prix, nullif(r.data->>'surface', '')::numeric as surface, coalesce(nullif(r.data->>'nbPhotos', '')::int, 0) as photos
    from public.records r where r.collection = 'annonce'),
  enligne as (select * from ann where publie),
  semaines as (select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as s)
  select jsonb_build_object(
    'annonces', jsonb_build_object(
      'en_ligne', (select count(*) from enligne),
      'nouvelles_7j', (select count(*) from ann where created_at > now() - interval '7 days'),
      'nouvelles_30j', (select count(*) from ann where created_at > now() - interval '30 days'),
      'moderees', (select count(*) from ann where modere),
      'sans_photo', (select count(*) from enligne where photos = 0),
      'avec_video', (select count(*) from public.records v where v.collection = 'visite' and coalesce((v.data->>'publie')::boolean, false)),
      'prix_m2_median', (select round(percentile_cont(0.5) within group (order by prix / surface)) from enligne where prix > 0 and surface > 0 and data->>'type' <> 'Terrain'),
      'par_commune', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select coalesce(nullif(data->>'ville', ''), 'Non précisée') k, count(*) n from enligne group by 1 order by 2 desc limit 8) x), '[]'),
      'par_type', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select coalesce(nullif(data->>'type', ''), 'Autre') k, count(*) n from enligne group by 1) x), '[]'),
      'par_semaine', (select jsonb_agg(jsonb_build_object('s', to_char(s, 'YYYY-MM-DD'), 'n', (select count(*) from ann where date_trunc('week', created_at) = s)) order by s) from semaines)),
    'utilisateurs', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'nouveaux_7j', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'nouveaux_30j', (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'actifs_30j', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'par_profil', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select coalesce(nullif(raw_user_meta_data->>'profil', ''), 'inconnu') k, count(*) n from auth.users group by 1) x), '[]'),
      'par_semaine', (select jsonb_agg(jsonb_build_object('s', to_char(s, 'YYYY-MM-DD'), 'n', (select count(*) from auth.users u where date_trunc('week', u.created_at) = s)) order by s) from semaines)),
    'pros', jsonb_build_object(
      'verifies', (select count(*) from public.professionnels where verifie),
      'en_attente', (select count(*) from public.professionnels where not verifie and refuse_le is null),
      'par_role', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n, 'v', v) order by n desc) from (select role k, count(*) n, count(*) filter (where verifie) v from public.professionnels group by 1) x), '[]')),
    'relations', jsonb_build_object(
      'devis_30j', (select count(*) from public.records where collection = 'devis' and created_at > now() - interval '30 days'),
      'devis_total', (select count(*) from public.records where collection = 'devis'),
      'devis_avec_reponse', (select count(distinct parent_id) from public.records where collection = 'devis_reponse'),
      'financements_30j', (select count(*) from public.records where collection = 'fin' and created_at > now() - interval '30 days'),
      'missions_30j', (select count(*) from public.records where collection in ('mission_diag', 'mission_geo', 'mission_ass') and created_at > now() - interval '30 days'),
      'notaire_30j', (select count(*) from public.records where collection = 'notaire' and created_at > now() - interval '30 days')),
    'argent', jsonb_build_object(
      'options_mois', (select coalesce(sum(prix), 0) from public.options_annonce where statut = 'active' and prix > 0 and debut >= date_trunc('month', now())),
      'options_mois_n', (select count(*) from public.options_annonce where statut = 'active' and prix > 0 and debut >= date_trunc('month', now())),
      'abonnements_mensuel', (select coalesce(sum(prix), 0) from public.abonnements where statut = 'actif' and fin > now()),
      'abonnements_actifs', (select count(*) from public.abonnements where statut = 'actif' and fin > now()),
      'essais', (select count(*) from public.abonnements where statut = 'essai' and fin > now()),
      'a_regler', (select coalesce(sum(prix), 0) from public.options_annonce where statut = 'a_payer') + (select coalesce(sum(prix), 0) from public.abonnements where statut = 'a_payer'),
      'top_options', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n, 'm', m) order by n desc) from (select option k, count(*) n, sum(prix) m from public.options_annonce where statut = 'active' and prix > 0 group by 1) x), '[]'),
      'formules', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select role || ' · ' || formule k, count(*) n from public.abonnements where statut in ('actif', 'essai') and fin > now() group by 1) x), '[]')),
    'evenements', jsonb_build_object(
      'n30', coalesce((select jsonb_object_agg(nom, n) from (select nom, count(*) n from public.evenements where created_at > now() - interval '30 days' group by 1) x), '{}'),
      'mobile30', (select count(*) from public.evenements where nom = 'visite' and appareil = 'mobile' and created_at > now() - interval '30 days'),
      'visites_semaine', (select jsonb_agg(jsonb_build_object('s', to_char(s, 'YYYY-MM-DD'), 'n', (select count(*) from public.evenements e where e.nom = 'visite' and date_trunc('week', e.created_at) = s)) order by s) from semaines)),
    'audience', jsonb_build_object(
      'en_ligne', (select count(*) from public.presence where vu > now() - interval '2 minutes'),
      'en_ligne_mobile', (select count(*) from public.presence where vu > now() - interval '2 minutes' and appareil = 'mobile'),
      'uniques_jour', (select count(distinct visiteur) from public.evenements where nom = 'visite' and created_at >= (date_trunc('day', now() at time zone 'Pacific/Noumea') at time zone 'Pacific/Noumea')),
      'uniques_7j', (select count(distinct visiteur) from public.evenements where nom = 'visite' and created_at > now() - interval '7 days'),
      'uniques_30j', (select count(distinct visiteur) from public.evenements where nom = 'visite' and created_at > now() - interval '30 days'),
      'visites_jour', (select count(*) from public.evenements where nom = 'visite' and created_at >= (date_trunc('day', now() at time zone 'Pacific/Noumea') at time zone 'Pacific/Noumea')),
      'nouveaux_30j', (select count(distinct visiteur) from public.evenements where nom = 'visite' and nouveau and created_at > now() - interval '30 days'),
      'sources', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select source k, count(*) n from public.evenements where nom = 'visite' and source is not null and created_at > now() - interval '30 days' group by 1) x), '[]'),
      'zones', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select zone k, count(distinct visiteur) n from public.evenements where nom = 'visite' and zone is not null and created_at > now() - interval '30 days' group by 1) x), '[]'),
      'heures', (select jsonb_agg(jsonb_build_object('h', h, 'n', (select count(*) from public.evenements e where e.nom = 'visite' and e.created_at > now() - interval '30 days'
                   and extract(hour from e.created_at at time zone 'Pacific/Noumea') = h)) order by h) from generate_series(0, 23) h),
      'communes', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select split_part(detail, '|', 2) k, count(*) n from public.evenements where nom = 'recherche' and split_part(detail, '|', 2) <> '' and created_at > now() - interval '30 days' group by 1 order by 2 desc limit 10) x), '[]'),
      'types', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select split_part(detail, '|', 1) k, count(*) n from public.evenements where nom = 'recherche' and split_part(detail, '|', 1) <> '' and created_at > now() - interval '30 days' group by 1 order by 2 desc limit 8) x), '[]'),
      'fiches', coalesce((select jsonb_agg(jsonb_build_object('k', coalesce(r.data->>'titre', 'Annonce de démonstration n° ' || x.k), 'n', x.n) order by x.n desc)
                   from (select detail k, count(*) n from public.evenements where nom = 'fiche_vue' and detail ~ '^[0-9]{1,20}$' and created_at > now() - interval '30 days' group by 1 order by 2 desc limit 10) x
                   left join public.records r on r.collection = 'annonce' and r.id = x.k), '[]'),
      'par_jour', (select jsonb_agg(jsonb_build_object('s', to_char(j, 'YYYY-MM-DD'), 'n', (select count(distinct visiteur) from public.evenements e where e.nom = 'visite'
                     and (e.created_at at time zone 'Pacific/Noumea')::date = j)) order by j)
                   from generate_series((now() at time zone 'Pacific/Noumea')::date - 29, (now() at time zone 'Pacific/Noumea')::date, interval '1 day') g(d), lateral (select g.d::date as j) jj)),
    'calcule_le', now()) into r;
  return r;
end $$;

-- Nombre de personnes en ligne (rafraîchi toutes les 30 secondes dans le back office)
create or replace function public.admin_en_ligne() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_garde();
  return jsonb_build_object('n', (select count(*) from public.presence where vu > now() - interval '2 minutes'),
                            'mobile', (select count(*) from public.presence where vu > now() - interval '2 minutes' and appareil = 'mobile'),
                            'liste', coalesce((select jsonb_agg(jsonb_build_object('appareil', appareil, 'page', page, 'zone', zone, 'source', source, 'profil', profil,
                                       'depuis', extract(epoch from now() - debut)::int, 'vu', extract(epoch from now() - vu)::int) order by debut)
                                     from (select * from public.presence where vu > now() - interval '2 minutes' order by debut limit 100) x), '[]'));
end $$;
revoke execute on function public.admin_en_ligne() from public, anon;
grant execute on function public.admin_en_ligne() to authenticated;
revoke execute on function public.admin_garde() from public, anon;
revoke execute on function public.admin_kpis() from public, anon;
grant execute on function public.admin_kpis() to authenticated;
revoke execute on function public.admin_moi(), public.admin_pros(), public.admin_pro_decider(bigint, boolean, text), public.admin_commandes(),
  public.admin_payer(text, bigint, int), public.admin_annuler(text, bigint), public.admin_annonces(text), public.admin_moderer(text, boolean, text),
  public.admin_mode(text) from public, anon;
grant execute on function public.admin_moi(), public.admin_pros(), public.admin_pro_decider(bigint, boolean, text), public.admin_commandes(),
  public.admin_payer(text, bigint, int), public.admin_annuler(text, bigint), public.admin_annonces(text), public.admin_moderer(text, boolean, text),
  public.admin_mode(text) to authenticated;

-- ============================================================
-- Administration : commandes à régler et activation après paiement
-- ============================================================
-- select o.id, o.annonce_id, o.option, o.prix, o.created_at, u.email from public.options_annonce o join auth.users u on u.id = o.owner_id where o.statut = 'a_payer' order by o.created_at;
-- select public.activer_option(<id>);
-- select a.id, a.role, a.formule, a.prix, a.created_at, u.email from public.abonnements a join auth.users u on u.id = a.owner_id where a.statut = 'a_payer' order by a.created_at;
-- select public.activer_abonnement(<id>, 1);   -- 1 mois payé (12 pour une année)
-- Interrupteur côté base (doit correspondre à js/tarifs.js) :
-- update public.parametres set valeur = 'payant' where cle = 'mode_tarifs';   -- off | lancement | payant
