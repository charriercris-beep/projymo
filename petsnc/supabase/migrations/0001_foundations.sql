-- PetsNC — Migration 0001 : fondations (Phase 1)
-- Territoires, classification animale, profils, animaux, abonnements (follows), blocages,
-- foyers, rôles du personnel, journal d'audit immuable, documents légaux, paramètres de marque.
-- Principe : TOUTE règle d'accès est ici (RLS). Le client n'a que la clé « anon ».
-- Les tables des phases suivantes (posts, forums, pros…) auront leurs propres migrations
-- avec leurs politiques RLS et leurs tests.

------------------------------------------------------------------------
-- 0. Utilitaires
------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

------------------------------------------------------------------------
-- 1. Territoires, régions, communes (extensible : Polynésie, Wallis…)
------------------------------------------------------------------------
create table public.territories (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  currency   text not null default 'XPF',
  timezone   text not null default 'Pacific/Noumea',
  locale     text not null default 'fr',
  tax_label  text,                 -- ex. 'TGC' (taux à définir avec l'expert-comptable)
  is_active  boolean not null default true
);

create table public.regions (
  id           uuid primary key default gen_random_uuid(),
  territory_id uuid not null references public.territories(id),
  name         text not null,
  sort         int  not null default 0,
  unique (territory_id, name)
);

-- Pas de coordonnées précises : seulement la commune (et un centroïde ajouté plus tard).
create table public.communes (
  id        uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id),
  name      text not null,
  lat       numeric(9,6),
  lon       numeric(9,6),
  unique (region_id, name)
);

------------------------------------------------------------------------
-- 2. Classification animale (administrable)
------------------------------------------------------------------------
create table public.species (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name            text not null,
  icon            text,
  sort            int not null default 0,
  is_launch_focus boolean not null default false,
  is_active       boolean not null default true
);

create table public.species_subcategories (
  id         uuid primary key default gen_random_uuid(),
  species_id uuid not null references public.species(id) on delete cascade,
  name       text not null,
  is_active  boolean not null default true,
  unique (species_id, name)
);

------------------------------------------------------------------------
-- 3. Profils
------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       text not null check (handle = lower(handle) and handle ~ '^[a-z0-9_.]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url   text,
  bio          text check (char_length(bio) <= 500),
  commune_id   uuid references public.communes(id),
  territory_id uuid references public.territories(id),
  is_private   boolean not null default false,
  status       text not null default 'active' check (status in ('active','suspended','banned','deleted')),
  locale       text not null default 'fr',
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index profiles_handle_key on public.profiles (handle);
create index profiles_commune_idx on public.profiles (commune_id);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.profile_species_interests (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  species_id uuid not null references public.species(id) on delete cascade,
  primary key (profile_id, species_id)
);

-- Création automatique du profil à l'inscription (e-mail, Apple, Google).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; candidate text; i int := 0; dn text;
begin
  base := lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-z0-9_.]', '', 'g'));
  if char_length(base) < 3 then base := 'membre'; end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) loop
    i := i + 1;
    candidate := base || '_' || substr(md5(random()::text || i::text), 1, 4);
  end loop;
  dn := left(nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), ''), 60);
  insert into public.profiles (id, handle, display_name)
  values (new.id, candidate, coalesce(dn, candidate));
  return new;
end $$;

------------------------------------------------------------------------
-- 4. Rôles du personnel (back-office)
------------------------------------------------------------------------
create table public.staff_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('super_admin','admin','moderator','commercial','partners')),
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

-- true si l'utilisateur courant a l'un des rôles demandés (le super_admin les a tous).
create or replace function public.is_staff(roles text[] default array['super_admin','admin','moderator','commercial','partners'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.staff_roles s join public.profiles p on p.id = s.profile_id
    where s.profile_id = auth.uid() and p.status = 'active'
      and (s.role = any(roles) or s.role = 'super_admin')
  )
$$;

------------------------------------------------------------------------
-- 5. Blocages et abonnements (follows)
------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('profile','pet')),
  target_id   uuid not null,
  status      text not null default 'accepted' check (status in ('pending','accepted')),
  created_at  timestamptz not null default now(),
  primary key (follower_id, target_type, target_id)
);
create index follows_target_idx on public.follows (target_type, target_id);

------------------------------------------------------------------------
-- 6. Foyers et animaux
------------------------------------------------------------------------
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (household_id, profile_id)
);

create or replace function public.is_household_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = hid and profile_id = auth.uid())
$$;

create or replace function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'authentification requise'; end if;
  insert into public.households (name) values (p_name) returning id into hid;
  insert into public.household_members (household_id, profile_id) values (hid, auth.uid());
  return hid;
end $$;

create table public.pets (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  household_id   uuid references public.households(id) on delete set null,
  species_id     uuid not null references public.species(id),
  subcategory_id uuid references public.species_subcategories(id),
  name           text not null check (char_length(name) between 1 and 50),
  breed_text     text check (char_length(breed_text) <= 80),
  birth_date     date check (birth_date <= current_date),
  sex            text check (sex in ('male','female')),   -- facultatif
  bio            text check (char_length(bio) <= 1000),
  commune_id     uuid references public.communes(id),
  avatar_url     text,
  interests      text[] not null default '{}' check (cardinality(interests) <= 20),
  is_private     boolean not null default false,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index pets_owner_idx on public.pets (owner_id);
create index pets_species_idx on public.pets (species_id);
create trigger pets_updated before update on public.pets
  for each row execute function public.set_updated_at();

-- Propriétaire d'une cible de follow.
create or replace function public.follow_target_owner(t_type text, t_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case t_type
    when 'profile' then (select id from public.profiles where id = t_id)
    when 'pet'     then (select owner_id from public.pets where id = t_id and deleted_at is null)
  end
$$;

-- Le contenu du propriétaire `owner` est-il visible par l'utilisateur courant ?
-- Non si : propriétaire inactif/supprimé, blocage dans un sens ou l'autre,
-- ou profil privé sans abonnement accepté. (Fonction « portier » réutilisée par les phases suivantes.)
create or replace function public.can_view_content_of(owner uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); p record;
begin
  if me is null then return false; end if;
  if owner = me then return true; end if;
  select status, is_private, deleted_at into p from public.profiles where id = owner;
  if not found or p.status <> 'active' or p.deleted_at is not null then return false; end if;
  if public.is_blocked_between(me, owner) then return false; end if;
  if p.is_private then
    return exists (select 1 from public.follows
                   where follower_id = me and target_type = 'profile' and target_id = owner and status = 'accepted');
  end if;
  return true;
end $$;

-- Le statut d'un follow est décidé par la base : « pending » si le propriétaire est privé.
create or replace function public.follows_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; priv boolean;
begin
  owner := public.follow_target_owner(new.target_type, new.target_id);
  if owner is null then raise exception 'cible introuvable'; end if;
  if owner = new.follower_id then raise exception 'impossible de se suivre soi-même'; end if;
  if public.is_blocked_between(new.follower_id, owner) then raise exception 'action impossible'; end if;
  select is_private into priv from public.profiles where id = owner;
  new.status := case when priv then 'pending' else 'accepted' end;
  return new;
end $$;
create trigger follows_bi before insert on public.follows
  for each row execute function public.follows_before_insert();

-- Un blocage supprime les abonnements dans les deux sens.
create or replace function public.blocks_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows f
   where (f.follower_id = new.blocker_id and public.follow_target_owner(f.target_type, f.target_id) = new.blocked_id)
      or (f.follower_id = new.blocked_id and public.follow_target_owner(f.target_type, f.target_id) = new.blocker_id);
  return null;
end $$;
create trigger blocks_ai after insert on public.blocks
  for each row execute function public.blocks_after_insert();

------------------------------------------------------------------------
-- 7. Marque, textes légaux, consentements, audit
------------------------------------------------------------------------
create table public.app_settings (
  key       text primary key,
  value     jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.legal_documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('cgu','privacy','charter','refund')),
  version      text not null,
  body         text not null,
  published_at timestamptz,
  unique (kind, version)
);

create table public.consents (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  doc_kind    text not null,
  version     text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, doc_kind, version)
);

create table public.audit_log (
  id        bigint generated always as identity primary key,
  actor_id  uuid,
  action    text not null,
  entity    text not null,
  entity_id text,
  diff      jsonb,
  at        timestamptz not null default now()
);

-- Journal immuable : aucune modification ni suppression, y compris pour service_role.
create or replace function public.audit_immutable() returns trigger
language plpgsql as $$ begin raise exception 'audit_log est en ajout seul'; end $$;
create trigger audit_no_update before update or delete on public.audit_log
  for each row execute function public.audit_immutable();
create trigger audit_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_immutable();

create or replace function public.log_audit(p_action text, p_entity text, p_entity_id text, p_diff jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'réservé au personnel';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, diff)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_diff);
end $$;

------------------------------------------------------------------------
-- 8. Suppression de compte (exigée par Apple / Google)
------------------------------------------------------------------------
-- Anonymise immédiatement et masque les contenus. La suppression définitive de la ligne
-- auth.users est faite par une Edge Function (service_role) sous 30 jours.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'authentification requise'; end if;
  update public.pets set deleted_at = now() where owner_id = me and deleted_at is null;
  delete from public.follows where follower_id = me
     or (target_type = 'profile' and target_id = me)
     or (target_type = 'pet' and target_id in (select id from public.pets where owner_id = me));
  delete from public.blocks where blocker_id = me or blocked_id = me;
  delete from public.profile_species_interests where profile_id = me;
  delete from public.staff_roles where profile_id = me;
  update public.profiles
     set status = 'deleted', deleted_at = now(), display_name = 'Compte supprimé',
         bio = null, avatar_url = null, commune_id = null, is_private = true,
         handle = 'supprime_' || substr(md5(me::text), 1, 12)
   where id = me;
  insert into public.audit_log (actor_id, action, entity, entity_id) values (me, 'delete_account', 'profiles', me::text);
end $$;

------------------------------------------------------------------------
-- 9. Sécurité : RLS sur TOUTES les tables + privilèges au plus juste
------------------------------------------------------------------------
alter table public.territories              enable row level security;
alter table public.regions                  enable row level security;
alter table public.communes                 enable row level security;
alter table public.species                  enable row level security;
alter table public.species_subcategories    enable row level security;
alter table public.profiles                 enable row level security;
alter table public.profile_species_interests enable row level security;
alter table public.staff_roles              enable row level security;
alter table public.blocks                   enable row level security;
alter table public.follows                  enable row level security;
alter table public.households               enable row level security;
alter table public.household_members        enable row level security;
alter table public.pets                     enable row level security;
alter table public.app_settings             enable row level security;
alter table public.legal_documents          enable row level security;
alter table public.consents                 enable row level security;
alter table public.audit_log                enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Référentiels : lecture publique, écriture par l'administration.
do $$
declare t text;
begin
  foreach t in array array['territories','regions','communes','species','species_subcategories'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy %I on public.%I for select using (true)$p$, t || '_read', t);
    execute format($p$create policy %I on public.%I for all to authenticated
                      using (public.is_staff(array['admin'])) with check (public.is_staff(array['admin']))$p$,
                   t || '_admin_write', t);
  end loop;
end $$;

-- Profils
grant select on public.profiles to authenticated;
grant update (handle, display_name, avatar_url, bio, commune_id, is_private, locale) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or (status = 'active' and deleted_at is null and not public.is_blocked_between(auth.uid(), id))
  or public.is_staff(array['moderator','admin'])
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and status = 'active') with check (id = auth.uid());
-- Modération : suspension / bannissement par le personnel (via fonction dédiée, voir 0002).

grant select, insert, delete on public.profile_species_interests to authenticated;
create policy psi_own on public.profile_species_interests for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Rôles du personnel : lisibles par soi-même et l'administration ; attribués par le super-admin seulement.
grant select, insert, delete on public.staff_roles to authenticated;
create policy staff_read on public.staff_roles for select to authenticated
  using (profile_id = auth.uid() or public.is_staff(array['admin']));
create policy staff_write on public.staff_roles for insert to authenticated
  with check (public.is_staff(array['super_admin']));
create policy staff_delete on public.staff_roles for delete to authenticated
  using (public.is_staff(array['super_admin']));

-- Blocages : privés (on ne voit que les siens).
grant select, insert, delete on public.blocks to authenticated;
create policy blocks_select on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Abonnements
grant select, insert, update (status), delete on public.follows to authenticated;
create policy follows_select on public.follows for select to authenticated using (
  follower_id = auth.uid() or public.follow_target_owner(target_type, target_id) = auth.uid()
);
create policy follows_insert on public.follows for insert to authenticated
  with check (follower_id = auth.uid());
create policy follows_accept on public.follows for update to authenticated
  using (public.follow_target_owner(target_type, target_id) = auth.uid())
  with check (public.follow_target_owner(target_type, target_id) = auth.uid());
create policy follows_delete on public.follows for delete to authenticated using (
  follower_id = auth.uid() or public.follow_target_owner(target_type, target_id) = auth.uid()
);

-- Foyers
grant select on public.households to authenticated;
grant select, delete on public.household_members to authenticated;
create policy hh_select on public.households for select to authenticated using (public.is_household_member(id));
create policy hhm_select on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy hhm_leave on public.household_members for delete to authenticated using (profile_id = auth.uid());

-- Animaux
grant select, insert on public.pets to authenticated;
grant update (household_id, species_id, subcategory_id, name, breed_text, birth_date, sex, bio,
              commune_id, avatar_url, interests, is_private, deleted_at) on public.pets to authenticated;
create policy pets_select on public.pets for select to authenticated using (
  owner_id = auth.uid()
  or (deleted_at is null
      and public.can_view_content_of(owner_id)
      and (not is_private or (household_id is not null and public.is_household_member(household_id))))
);
create policy pets_insert on public.pets for insert to authenticated with check (
  owner_id = auth.uid()
  and exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
  and (household_id is null or public.is_household_member(household_id))
);
create policy pets_update on public.pets for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (household_id is null or public.is_household_member(household_id)));

-- Paramètres, documents légaux
grant select on public.app_settings to anon, authenticated;
grant insert, update, delete on public.app_settings to authenticated;
create policy settings_read on public.app_settings for select using (is_public or public.is_staff());
create policy settings_write on public.app_settings for all to authenticated
  using (public.is_staff(array['admin'])) with check (public.is_staff(array['admin']));

grant select on public.legal_documents to anon, authenticated;
grant insert, update, delete on public.legal_documents to authenticated;
create policy legal_read on public.legal_documents for select
  using ((published_at is not null and published_at <= now()) or public.is_staff(array['admin']));
create policy legal_write on public.legal_documents for all to authenticated
  using (public.is_staff(array['admin'])) with check (public.is_staff(array['admin']));

grant select, insert on public.consents to authenticated;
create policy consents_own_read on public.consents for select to authenticated using (user_id = auth.uid());
create policy consents_own_insert on public.consents for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.legal_documents d
              where d.kind = doc_kind and d.version = consents.version and d.published_at <= now())
);

-- Journal d'audit : lecture par l'administration ; AUCUNE écriture directe (passer par log_audit).
grant select on public.audit_log to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (public.is_staff(array['admin']));

-- Fonctions appelables par les utilisateurs connectés.
grant execute on function public.create_household(text)        to authenticated;
grant execute on function public.delete_account()               to authenticated;
grant execute on function public.log_audit(text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.is_staff(text[])               to anon, authenticated;
grant execute on function public.is_household_member(uuid)      to authenticated;
grant execute on function public.is_blocked_between(uuid,uuid)  to authenticated;
grant execute on function public.can_view_content_of(uuid)      to authenticated;
grant execute on function public.follow_target_owner(text,uuid) to authenticated;

------------------------------------------------------------------------
-- 10. Données initiales
------------------------------------------------------------------------
insert into public.territories (code, name, tax_label) values ('NC', 'Nouvelle-Calédonie', 'TGC');

with t as (select id from public.territories where code = 'NC')
insert into public.regions (territory_id, name, sort)
select t.id, r.name, r.sort from t, (values ('Province Sud',1),('Province Nord',2),('Îles Loyauté',3)) as r(name, sort);

insert into public.communes (region_id, name)
select r.id, c.name from public.regions r
join (values
  ('Province Sud','Nouméa'),('Province Sud','Dumbéa'),('Province Sud','Mont-Dore'),('Province Sud','Païta'),
  ('Province Sud','Boulouparis'),('Province Sud','Bourail'),('Province Sud','Farino'),('Province Sud','Île des Pins'),
  ('Province Sud','La Foa'),('Province Sud','Moindou'),('Province Sud','Sarraméa'),('Province Sud','Thio'),('Province Sud','Yaté'),
  ('Province Nord','Belep'),('Province Nord','Canala'),('Province Nord','Hienghène'),('Province Nord','Houaïlou'),
  ('Province Nord','Kaala-Gomen'),('Province Nord','Koné'),('Province Nord','Kouaoua'),('Province Nord','Koumac'),
  ('Province Nord','Ouégoa'),('Province Nord','Poindimié'),('Province Nord','Ponérihouen'),('Province Nord','Pouébo'),
  ('Province Nord','Pouembout'),('Province Nord','Poum'),('Province Nord','Poya'),('Province Nord','Touho'),('Province Nord','Voh'),
  ('Îles Loyauté','Lifou'),('Îles Loyauté','Maré'),('Îles Loyauté','Ouvéa')
) as c(region, name) on c.region = r.name;

insert into public.species (slug, name, sort, is_launch_focus) values
  ('chiens','Chiens',1,true), ('chats','Chats',2,true), ('chevaux','Chevaux',3,false),
  ('oiseaux','Oiseaux',4,false), ('nac','NAC',5,false), ('lapins','Lapins',6,false),
  ('rongeurs','Rongeurs',7,false), ('reptiles','Reptiles',8,false), ('poissons','Poissons',9,false),
  ('animaux-de-ferme','Animaux de ferme',10,false), ('autres','Autres animaux',11,false);

insert into public.app_settings (key, value, is_public) values
  ('brand', '{"name":"PetsNC","logo_url":null,"colors":{"primary":"#E8743B","secondary":"#2F6F6D","background":"#FFF9F3","text":"#2B2B2B"}}', true),
  ('features', '{"video_max_seconds":30,"stories":true,"ads":false,"animal_sale_listings":false}', true);

-- Création automatique du profil à l'inscription.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
