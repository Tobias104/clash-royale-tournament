-- Etapa 1: torneos con historial, participantes, resultados, roles y auditoría.
-- Ejecutar completo en Supabase > SQL Editor. No borra las tablas anteriores (quedan sin usar).

-- ===== Roles del personal =====
create table public.staff (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('owner', 'admin', 'organizer', 'moderator'))
);
-- Tu usuario dueño se copia de la tabla anterior (admins)
insert into public.staff (email, role)
select email, 'owner' from public.admins where is_owner
on conflict do nothing;

create function public.fn_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.staff where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;
create function public.fn_is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select public.fn_role() is not null;
$$;
create function public.fn_can_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_role() in ('owner', 'admin'), false);
$$;
create function public.fn_can_organize() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_role() in ('owner', 'admin', 'organizer'), false);
$$;
create function public.fn_is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_role() = 'owner', false);
$$;

-- ===== Torneos (todos se conservan: historial) =====
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  size int not null check (size in (8, 16)),
  status text not null default 'draft' check (status in ('draft', 'live', 'finished')),
  sync_enabled boolean not null default true,
  bo_overrides jsonb not null default '{}'::jsonb,
  start_at timestamptz,
  finished_at timestamptz,
  champion_id uuid,
  runner_up_id uuid,
  created_at timestamptz not null default now()
);
-- Solo puede haber un torneo activo (borrador o en curso) a la vez
create unique index tournaments_one_active on public.tournaments ((true)) where status in ('draft', 'live');

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  slot int not null check (slot between 0 and 15),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  player_tag text not null check (player_tag ~ '^#[0-9A-Z]{3,15}$'),
  clan_name text,
  unique (tournament_id, slot),
  unique (tournament_id, player_tag)
);

create table public.match_results (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  match_id text not null,
  winner uuid not null references public.participants (id),
  score_a int not null,
  score_b int not null,
  source text not null default 'manual' check (source in ('api', 'manual')),
  decided_at timestamptz not null default now(),
  primary key (tournament_id, match_id),
  check (score_a >= 0 and score_b >= 0 and score_a <> score_b and greatest(score_a, score_b) in (2, 3))
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  table_name text not null,
  row_key text,
  old_data jsonb,
  new_data jsonb
);

-- ===== Controles de integridad =====
create function public.fn_guard_tournament() returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then -- funciones del servidor y editor SQL
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Un torneo iniciado no se puede borrar'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.start_at is not null or new.finished_at is not null or new.champion_id is not null or new.runner_up_id is not null then
      raise exception 'Un torneo nuevo debe empezar en borrador';
    end if;
    return new;
  end if;
  if old.status = 'finished' then raise exception 'Un torneo finalizado es historial y no se puede modificar'; end if;
  if new.status = 'finished' or new.champion_id is distinct from old.champion_id or new.runner_up_id is distinct from old.runner_up_id or new.finished_at is distinct from old.finished_at then
    raise exception 'El campeón y el cierre del torneo los define el sistema';
  end if;
  if old.status = 'live' and (new.status <> 'live' or new.size <> old.size or new.start_at is distinct from old.start_at or new.bo_overrides is distinct from old.bo_overrides) then
    raise exception 'Un torneo en curso no puede volver a borrador ni cambiar su tamaño, inicio o formatos';
  end if;
  if old.status = 'draft' and new.status = 'live' then
    select count(*) into n from public.participants where tournament_id = new.id;
    if n < 2 then raise exception 'Se necesitan al menos 2 participantes para iniciar'; end if;
    new.start_at := now();
  end if;
  return new;
end $$;
create trigger guard_tournament before insert or update or delete on public.tournaments
  for each row execute function public.fn_guard_tournament();

create function public.fn_guard_participant() returns trigger language plpgsql security definer set search_path = public as $$
declare t public.tournaments;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select * into t from public.tournaments where id = (case when tg_op = 'DELETE' then old.tournament_id else new.tournament_id end);
  if t.id is null then raise exception 'Torneo inexistente'; end if;
  if tg_op <> 'DELETE' and new.slot >= t.size then
    raise exception 'El lugar % no existe en un torneo de % jugadores', new.slot, t.size;
  end if;
  if t.status <> 'draft' then
    if not public.fn_can_admin() then raise exception 'Solo un administrador puede modificar participantes con el torneo iniciado'; end if;
    if tg_op = 'DELETE' then raise exception 'No se pueden quitar participantes con el torneo iniciado'; end if;
    if tg_op = 'INSERT' then raise exception 'No se pueden agregar participantes con el torneo iniciado'; end if;
    if new.slot <> old.slot or new.tournament_id <> old.tournament_id then raise exception 'No se puede cambiar el lugar de un participante'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_participant before insert or update or delete on public.participants
  for each row execute function public.fn_guard_participant();

-- ===== Auditoría automática (quién, qué, cuándo, valor anterior y nuevo) =====
create function public.fn_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare who text := coalesce(auth.jwt() ->> 'email', 'sistema');
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (actor, action, table_name, row_key, old_data)
    values (who, tg_op, tg_table_name, to_jsonb(old) ->> tg_argv[0], to_jsonb(old));
  elsif tg_op = 'INSERT' then
    insert into public.audit_log (actor, action, table_name, row_key, new_data)
    values (who, tg_op, tg_table_name, to_jsonb(new) ->> tg_argv[0], to_jsonb(new));
  else
    insert into public.audit_log (actor, action, table_name, row_key, old_data, new_data)
    values (who, tg_op, tg_table_name, to_jsonb(new) ->> tg_argv[0], to_jsonb(old), to_jsonb(new));
  end if;
  return null;
end $$;
create trigger audit_tournaments after insert or update or delete on public.tournaments for each row execute function public.fn_audit('id');
create trigger audit_participants after insert or update or delete on public.participants for each row execute function public.fn_audit('id');
create trigger audit_staff after insert or update or delete on public.staff for each row execute function public.fn_audit('email');

-- ===== Permisos (RLS) =====
alter table public.staff enable row level security;
alter table public.tournaments enable row level security;
alter table public.participants enable row level security;
alter table public.match_results enable row level security;
alter table public.audit_log enable row level security;

create policy "ver" on public.tournaments for select using (true);
create policy "crear" on public.tournaments for insert with check (public.fn_can_organize());
create policy "editar" on public.tournaments for update using (public.fn_can_organize()) with check (public.fn_can_organize());
create policy "borrar" on public.tournaments for delete using (public.fn_can_organize() and status = 'draft');

create policy "ver" on public.participants for select using (true);
create policy "crear" on public.participants for insert with check (public.fn_can_organize());
create policy "editar" on public.participants for update using (public.fn_can_organize()) with check (public.fn_can_organize());
create policy "borrar" on public.participants for delete using (public.fn_can_organize());

-- Los resultados solo se leen: se escriben desde la función "result" (valida con el motor) o "sync" (RoyaleAPI)
create policy "ver" on public.match_results for select using (true);

create policy "ver personal" on public.staff for select using (public.fn_is_staff());
create policy "owner agrega" on public.staff for insert with check (public.fn_is_owner() and role <> 'owner');
create policy "owner cambia" on public.staff for update using (public.fn_is_owner() and role <> 'owner') with check (public.fn_is_owner() and role <> 'owner');
create policy "owner quita" on public.staff for delete using (public.fn_is_owner() and role <> 'owner');

create policy "ver auditoria" on public.audit_log for select using (public.fn_is_staff());

-- Tiempo real
alter publication supabase_realtime add table public.tournaments, public.participants, public.match_results;
