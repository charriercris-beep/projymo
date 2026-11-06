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

-- Un non-propriétaire ne peut ni changer le propriétaire ni le public visé ; en modifiant, il prend en charge
create or replace function public.records_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
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
