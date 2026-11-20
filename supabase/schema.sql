-- Ejecutar completo en Supabase > SQL Editor

create table public.tournament (
  id int primary key default 1 check (id = 1),
  name text not null default 'Torneo Clash Royale',
  best_of int not null default 3 check (best_of in (1, 3, 5)),
  started_at timestamptz
);
insert into public.tournament (id) values (1);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  seed int unique check (seed between 1 and 8),
  p1_name text not null,
  p1_tag text not null,
  p2_name text,
  p2_tag text
);

create table public.results (
  match_id text primary key,
  winner uuid not null,
  score_a int not null default 0,
  score_b int not null default 0,
  source text not null default 'manual' check (source in ('api', 'manual')),
  decided_at timestamptz not null default now()
);

create table public.admins (
  email text primary key check (email = lower(email)),
  is_owner boolean not null default false
);

-- ⚠️ Cambiá este correo por el tuyo (el mismo con el que vas a crear la cuenta)
insert into public.admins (email, is_owner) values ('tu_correo@ejemplo.com', true);

create function public.fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
create function public.fn_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where is_owner and email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

alter table public.tournament enable row level security;
alter table public.teams enable row level security;
alter table public.results enable row level security;
alter table public.admins enable row level security;

create policy "ver" on public.tournament for select using (true);
create policy "editar" on public.tournament for all using (public.fn_is_admin()) with check (public.fn_is_admin());
create policy "ver" on public.teams for select using (true);
create policy "editar" on public.teams for all using (public.fn_is_admin()) with check (public.fn_is_admin());
create policy "ver" on public.results for select using (true);
create policy "editar" on public.results for all using (public.fn_is_admin()) with check (public.fn_is_admin());

create policy "admins ven" on public.admins for select using (public.fn_is_admin());
create policy "owner agrega" on public.admins for insert with check (public.fn_is_owner() and not is_owner);
create policy "owner quita" on public.admins for delete using (public.fn_is_owner() and not is_owner);

-- Tiempo real
alter publication supabase_realtime add table public.tournament, public.teams, public.results;
