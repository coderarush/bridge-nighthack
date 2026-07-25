import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/0002_auth_and_rls.sql",
  import.meta.url,
);

test("auth migration enforces identities, roles, RLS, and atomic mutations", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();

  assert.match(sql, /create table public\.participants/);
  assert.match(sql, /role in \('provider', 'customer', 'operator'\)/);
  assert.match(sql, /create table public\.participant_invites/);
  assert.match(sql, /create or replace function public\.claim_participant_invite/);
  assert.match(sql, /grant execute on function public\.claim_participant_invite[^;]+to service_role/s);
  assert.match(sql, /create or replace function public\.acquire_run_lock/);
  assert.match(sql, /create or replace function public\.append_run_event/);

  for (const table of [
    "participants",
    "participant_invites",
    "providers",
    "provider_changes",
    "repositories",
    "migration_runs",
    "impacts",
    "migration_plans",
    "approvals",
    "comments",
    "run_events",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(sql, /revoke all on table[\s\S]+from anon, authenticated/);
  assert.match(sql, /create policy bridge_participant_read/);
  assert.match(sql, /create policy bridge_room_realtime_read/);
  assert.match(sql, /create policy bridge_room_presence_write/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]+to authenticated/);
});
