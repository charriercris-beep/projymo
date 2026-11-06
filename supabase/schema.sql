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

-- Demandes de devis aux artisans (assistant de valorisation)
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
