begin;

create table public.participants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
    check (
      display_name = btrim(display_name)
      and length(display_name) between 1 and 64
    ),
  role text not null
    check (role in ('provider', 'customer', 'operator')),
  created_at timestamptz not null default now()
);

create table public.participant_invites (
  id uuid primary key default gen_random_uuid(),
  token_digest bytea unique not null
    check (octet_length(token_digest) = 32),
  display_name text not null
    check (
      display_name = btrim(display_name)
      and length(display_name) between 1 and 64
    ),
  role text not null
    check (role in ('provider', 'customer', 'operator')),
  expires_at timestamptz not null,
  max_claims integer not null default 1
    check (max_claims between 1 and 20),
  claim_count integer not null default 0
    check (claim_count between 0 and max_claims),
  created_at timestamptz not null default now()
);

alter table public.comments
  add constraint comments_participant_fk
    foreign key (participant_id)
    references public.participants(user_id)
    not valid,
  add constraint comments_participant_required
    check (participant_id is not null)
    not valid,
  add constraint comments_role_allowed
    check (role in ('provider', 'customer', 'operator'))
    not valid,
  add constraint comments_body_length
    check (length(btrim(body)) between 1 and 2000)
    not valid;

alter table public.approvals
  add constraint approvals_participant_fk
    foreign key (participant_id)
    references public.participants(user_id)
    not valid,
  add constraint approvals_participant_required
    check (participant_id is not null)
    not valid,
  add constraint approvals_decision_allowed
    check (decision in ('approved', 'rejected'))
    not valid;

create unique index approvals_one_decision_per_actor
  on public.approvals(run_id, plan_version, participant_id)
  where participant_id is not null;

create or replace function public.claim_participant_invite(
  p_user_id uuid,
  p_token_digest bytea
)
returns table (
  user_id uuid,
  display_name text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_name text;
  v_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if exists (
    select 1
    from public.participants participant
    where participant.user_id = p_user_id
  ) then
    return query
      select
        participant.user_id,
        participant.display_name,
        participant.role,
        participant.created_at
      from public.participants participant
      where participant.user_id = p_user_id;
    return;
  end if;

  if not exists (
    select 1
    from auth.users bridge_user
    where bridge_user.id = p_user_id
      and bridge_user.is_anonymous is true
  ) then
    raise exception 'anonymous user required'
      using errcode = '28000';
  end if;

  select invite.id, invite.display_name, invite.role
    into v_invite_id, v_name, v_role
  from public.participant_invites invite
  where invite.token_digest = p_token_digest
    and invite.expires_at > now()
    and invite.claim_count < invite.max_claims
  for update;

  if not found then
    raise exception 'invalid or expired participant capability'
      using errcode = '28000';
  end if;

  insert into public.participants(user_id, display_name, role)
  values (p_user_id, v_name, v_role);

  update public.participant_invites
  set claim_count = claim_count + 1
  where id = v_invite_id;

  return query
    select
      participant.user_id,
      participant.display_name,
      participant.role,
      participant.created_at
    from public.participants participant
    where participant.user_id = p_user_id;
end;
$$;

create or replace function public.set_comment_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.participants%rowtype;
begin
  select *
    into actor
  from public.participants participant
  where participant.user_id = new.participant_id;

  if not found then
    raise exception 'unknown comment participant'
      using errcode = '23503';
  end if;

  new.participant_name := actor.display_name;
  new.role := actor.role;
  return new;
end;
$$;

drop trigger if exists comments_set_actor on public.comments;
create trigger comments_set_actor
before insert on public.comments
for each row execute function public.set_comment_actor();

create or replace function public.set_approval_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.participants%rowtype;
begin
  select *
    into actor
  from public.participants participant
  where participant.user_id = new.participant_id;

  if not found then
    raise exception 'unknown approval participant'
      using errcode = '23503';
  end if;
  if actor.role <> 'provider' then
    raise exception 'provider role required'
      using errcode = '42501';
  end if;

  new.participant_name := actor.display_name;
  return new;
end;
$$;

drop trigger if exists approvals_set_actor on public.approvals;
create trigger approvals_set_actor
before insert on public.approvals
for each row execute function public.set_approval_actor();

create or replace function public.is_bridge_participant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.participants participant
    where participant.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_read_run(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_bridge_participant()
    and exists (
      select 1
      from public.migration_runs run
      where run.id = p_run_id
    );
$$;

create or replace function public.bridge_run_id_from_topic(p_topic text)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_topic ~* '^migration-run:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(p_topic, ':', 2)::uuid
    else null
  end;
$$;

create or replace function public.acquire_run_lock(
  p_run_id uuid,
  p_lock_owner text,
  p_lease_seconds integer default 90
)
returns setof public.migration_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lock_owner is null or btrim(p_lock_owner) = '' then
    raise exception 'lock owner required';
  end if;
  if p_lease_seconds not between 10 and 300 then
    raise exception 'lease must be between 10 and 300 seconds';
  end if;

  return query
    update public.migration_runs run
    set
      lock_owner = p_lock_owner,
      lock_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
    where run.id = p_run_id
      and (
        run.lock_owner is null
        or run.lock_expires_at <= now()
        or run.lock_owner = p_lock_owner
      )
    returning run.*;
end;
$$;

create or replace function public.release_run_lock(
  p_run_id uuid,
  p_lock_owner text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  released_count integer;
begin
  update public.migration_runs run
  set
    lock_owner = null,
    lock_expires_at = null,
    updated_at = now()
  where run.id = p_run_id
    and run.lock_owner = p_lock_owner;

  get diagnostics released_count = row_count;
  return released_count = 1;
end;
$$;

create or replace function public.append_run_event(
  p_run_id uuid,
  p_actor_type text,
  p_actor_id text,
  p_event_type text,
  p_stage text,
  p_status text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.run_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_sequence integer;
  inserted_event public.run_events;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));

  select coalesce(max(event.sequence), 0) + 1
    into next_sequence
  from public.run_events event
  where event.run_id = p_run_id;

  insert into public.run_events(
    run_id,
    sequence,
    actor_type,
    actor_id,
    event_type,
    stage,
    status,
    message,
    metadata
  )
  values (
    p_run_id,
    next_sequence,
    p_actor_type,
    p_actor_id,
    p_event_type,
    p_stage,
    p_status,
    p_message,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into inserted_event;

  return inserted_event;
end;
$$;

revoke all on function public.claim_participant_invite(uuid, bytea)
  from public, anon, authenticated;
revoke all on function public.set_comment_actor()
  from public, anon, authenticated;
revoke all on function public.set_approval_actor()
  from public, anon, authenticated;
revoke all on function public.is_bridge_participant()
  from public, anon;
revoke all on function public.can_read_run(uuid)
  from public, anon;
revoke all on function public.bridge_run_id_from_topic(text)
  from public, anon;
revoke all on function public.acquire_run_lock(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.release_run_lock(uuid, text)
  from public, anon, authenticated;
revoke all on function public.append_run_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.claim_participant_invite(uuid, bytea)
  to service_role;
grant execute on function public.is_bridge_participant()
  to authenticated;
grant execute on function public.can_read_run(uuid)
  to authenticated;
grant execute on function public.bridge_run_id_from_topic(text)
  to authenticated;
grant execute on function public.acquire_run_lock(uuid, text, integer)
  to service_role;
grant execute on function public.release_run_lock(uuid, text)
  to service_role;
grant execute on function public.append_run_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

alter table public.participants enable row level security;
alter table public.participant_invites enable row level security;
alter table public.providers enable row level security;
alter table public.provider_changes enable row level security;
alter table public.repositories enable row level security;
alter table public.migration_runs enable row level security;
alter table public.impacts enable row level security;
alter table public.migration_plans enable row level security;
alter table public.approvals enable row level security;
alter table public.comments enable row level security;
alter table public.run_events enable row level security;

revoke all on table
  public.participants,
  public.participant_invites,
  public.providers,
  public.provider_changes,
  public.repositories,
  public.migration_runs,
  public.impacts,
  public.migration_plans,
  public.approvals,
  public.comments,
  public.run_events
from anon, authenticated;

grant select on table
  public.participants,
  public.providers,
  public.provider_changes,
  public.repositories,
  public.migration_runs,
  public.impacts,
  public.migration_plans,
  public.approvals,
  public.comments,
  public.run_events
to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'participants',
    'providers',
    'provider_changes',
    'repositories',
    'migration_runs',
    'impacts',
    'migration_plans',
    'approvals',
    'comments',
    'run_events'
  ]
  loop
    execute format(
      'create policy bridge_participant_read on public.%I
       for select to authenticated
       using ((select public.is_bridge_participant()))',
      table_name
    );
  end loop;
end
$$;

create policy bridge_room_realtime_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and public.can_read_run(
    public.bridge_run_id_from_topic((select realtime.topic()))
  )
);

create policy bridge_room_presence_write
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and public.can_read_run(
    public.bridge_run_id_from_topic((select realtime.topic()))
  )
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'migration_runs',
    'comments',
    'approvals',
    'run_events'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public'
        and publication_table.tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end
$$;

commit;
