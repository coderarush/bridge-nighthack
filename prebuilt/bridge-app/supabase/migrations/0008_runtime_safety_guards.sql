begin;

create table public.participant_invite_claims (
  invite_id uuid not null
    references public.participant_invites(id) on delete cascade,
  user_id uuid not null
    references public.participants(user_id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

alter table public.participant_invite_claims enable row level security;
alter table public.participant_invite_claims force row level security;

revoke all on table public.participant_invite_claims
  from anon, authenticated, service_role;
grant select on table public.participant_invite_claims
  to service_role;

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
  v_claim_count integer;
  v_max_claims integer;
  v_already_claimed boolean;
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
    invite.run_id,
    invite.claim_count,
    invite.max_claims
  into
    v_invite_id,
    v_name,
    v_role,
    v_run_id,
    v_claim_count,
    v_max_claims
  from public.participant_invites invite
  where invite.token_digest = p_token_digest
    and invite.expires_at > now()
  for update;

  if not found then
    raise exception 'invalid or expired participant capability'
      using errcode = '28000';
  end if;

  select exists (
    select 1
    from public.participant_invite_claims claim
    where claim.invite_id = v_invite_id
      and claim.user_id = p_user_id
  )
  into v_already_claimed;

  if not v_already_claimed and v_claim_count >= v_max_claims then
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
  else
    insert into public.participants(user_id, display_name, role)
    values (p_user_id, v_name, v_role);
  end if;

  if not v_already_claimed then
    insert into public.participant_invite_claims(invite_id, user_id)
    values (v_invite_id, p_user_id);

    update public.participant_invites
    set claim_count = claim_count + 1
    where id = v_invite_id;
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
end;
$$;

revoke all on function public.claim_participant_invite(uuid, bytea)
  from public, anon, authenticated;
grant execute on function public.claim_participant_invite(uuid, bytea)
  to service_role;

create or replace function public.reset_demo_run(p_run_id uuid)
returns setof public.migration_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_run public.migration_runs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));

  select run.*
    into current_run
  from public.migration_runs run
  where run.id = p_run_id
  for update;

  if not found then
    return;
  end if;

  if current_run.lock_owner is not null
    and current_run.lock_expires_at > now()
  then
    raise exception 'migration run has an active worker lease'
      using errcode = '55P03';
  end if;

  delete from public.approvals where run_id = p_run_id;
  delete from public.comments where run_id = p_run_id;
  delete from public.run_events where run_id = p_run_id;
  delete from public.impacts where run_id = p_run_id;
  delete from public.migration_plans where run_id = p_run_id;

  return query
    update public.migration_runs run
    set
      status = 'analyzing_change',
      current_stage = 'analyzing_change',
      plan_version = 1,
      branch_name = null,
      commit_sha = null,
      pull_request_number = null,
      pull_request_url = null,
      validation_url = null,
      validation_status = null,
      validation_conclusion = null,
      error_code = null,
      error_message = null,
      lock_owner = null,
      lock_expires_at = null,
      updated_at = now()
    where run.id = p_run_id
    returning run.*;
end;
$$;

revoke all on function public.reset_demo_run(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_demo_run(uuid)
  to service_role;

commit;
