begin;

create table public.run_participants (
  run_id uuid not null
    references public.migration_runs(id) on delete cascade,
  user_id uuid not null
    references public.participants(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (run_id, user_id)
);

alter table public.participant_invites
  add column run_id uuid
    references public.migration_runs(id) on delete cascade;

alter table public.run_participants enable row level security;

revoke all on table public.run_participants from anon, authenticated;
grant select on table public.run_participants to authenticated;

create or replace function public.can_read_run(p_run_id uuid)
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
      and participant.role = 'operator'
  ) or exists (
    select 1
    from public.run_participants membership
    where membership.user_id = (select auth.uid())
      and membership.run_id = p_run_id
  );
$$;

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
  v_run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if not exists (
    select 1
    from auth.users bridge_user
    where bridge_user.id = p_user_id
      and bridge_user.is_anonymous is true
  ) then
    raise exception 'anonymous user required'
      using errcode = '28000';
  end if;

  select
    invite.id,
    invite.display_name,
    invite.role,
    invite.run_id
  into
    v_invite_id,
    v_name,
    v_role,
    v_run_id
  from public.participant_invites invite
  where invite.token_digest = p_token_digest
    and invite.expires_at > now()
    and invite.claim_count < invite.max_claims
  for update;

  if not found then
    raise exception 'invalid or expired participant capability'
      using errcode = '28000';
  end if;

  if exists (
    select 1
    from public.participants participant
    where participant.user_id = p_user_id
  ) then
    if exists (
      select 1
      from public.participants participant
      where participant.user_id = p_user_id
        and (
          participant.display_name <> v_name
          or participant.role <> v_role
        )
    ) then
      raise exception 'participant capability does not match existing identity'
        using errcode = '28000';
    end if;

    if v_run_id is not null then
      insert into public.run_participants(run_id, user_id)
      values (v_run_id, p_user_id)
      on conflict do nothing;
    end if;

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

  insert into public.participants(user_id, display_name, role)
  values (p_user_id, v_name, v_role);

  if v_run_id is not null then
    insert into public.run_participants(run_id, user_id)
    values (v_run_id, p_user_id)
    on conflict do nothing;
  end if;

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

revoke all on function public.can_read_run(uuid)
  from public, anon;
revoke all on function public.claim_participant_invite(uuid, bytea)
  from public, anon, authenticated;
grant execute on function public.can_read_run(uuid)
  to authenticated;
grant execute on function public.claim_participant_invite(uuid, bytea)
  to service_role;

drop policy if exists bridge_participant_read on public.participants;
drop policy if exists bridge_participant_read on public.providers;
drop policy if exists bridge_participant_read on public.provider_changes;
drop policy if exists bridge_participant_read on public.repositories;
drop policy if exists bridge_participant_read on public.migration_runs;
drop policy if exists bridge_participant_read on public.impacts;
drop policy if exists bridge_participant_read on public.migration_plans;
drop policy if exists bridge_participant_read on public.approvals;
drop policy if exists bridge_participant_read on public.comments;
drop policy if exists bridge_participant_read on public.run_events;

create policy bridge_participant_self_read
on public.participants
for select
to authenticated
using (participants.user_id = (select auth.uid()));

create policy bridge_membership_self_read
on public.run_participants
for select
to authenticated
using (run_participants.user_id = (select auth.uid()));

create policy bridge_run_member_read
on public.migration_runs
for select
to authenticated
using (public.can_read_run(migration_runs.id));

create policy bridge_comment_member_read
on public.comments
for select
to authenticated
using (public.can_read_run(comments.run_id));

create policy bridge_approval_member_read
on public.approvals
for select
to authenticated
using (public.can_read_run(approvals.run_id));

create policy bridge_event_member_read
on public.run_events
for select
to authenticated
using (public.can_read_run(run_events.run_id));

commit;
