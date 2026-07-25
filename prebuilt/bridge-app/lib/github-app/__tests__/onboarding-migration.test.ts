import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/0009_github_app_onboarding.sql",
  import.meta.url,
);

async function migrationSql(): Promise<string> {
  return readFile(migrationUrl, "utf8").catch(() => "");
}

test("onboarding migration adds a forward-only opaque state table", async () => {
  const sql = await migrationSql();

  assert.ok(sql.length > 0, "0009 GitHub App onboarding migration must exist");
  assert.match(sql, /create table public\.github_installation_states/i);
  assert.match(sql, /state_digest bytea primary key/i);
  assert.match(sql, /octet_length\(state_digest\) = 32/i);
  assert.match(sql, /expires_at timestamptz not null/i);
  assert.match(sql, /consumed_at timestamptz/i);
  assert.match(sql, /phase text not null/i);
  assert.match(sql, /installation_reference_ciphertext text/i);
  assert.match(sql, /installation_reference_digest text/i);
  assert.match(
    sql,
    /phase = 'setup'[\s\S]+installation_reference_ciphertext is null[\s\S]+phase = 'oauth'[\s\S]+installation_reference_ciphertext is not null/i,
  );
  assert.doesNotMatch(sql, /\bstate_token\b|\braw_state\b|\baccess_token\b/i);
  assert.doesNotMatch(
    sql,
    /alter table public\.github_app_installations[\s\S]+drop column installation_id/i,
  );
});

test("forward migration makes new installation persistence encrypted", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /alter table public\.github_app_installations[\s\S]+add column installation_reference_ciphertext text[\s\S]+add column installation_reference_digest text/i,
  );
  assert.match(
    sql,
    /alter column installation_id drop not null/i,
  );
  assert.match(
    sql,
    /unique[\s\S]+installation_reference_digest/i,
  );
  assert.match(
    sql,
    /revoke execute on function public\.service_register_github_installation[\s\S]+from service_role/i,
  );
});

test("onboarding completion is one service-only encrypted RPC", async () => {
  const sql = await migrationSql();
  const completeSql = sql.slice(
    sql.indexOf(
      "create or replace function public.service_complete_github_app_onboarding",
    ),
  );

  assert.match(
    completeSql,
    /p_installation_reference_ciphertext text/i,
  );
  assert.match(
    completeSql,
    /p_installation_reference_digest text/i,
  );
  assert.doesNotMatch(completeSql, /\bp_installation_id\b/i);
  assert.match(completeSql, /p_repositories jsonb/i);
  assert.match(
    completeSql,
    /public\.service_register_repository\(/i,
  );
  assert.match(
    completeSql,
    /public\.service_append_workspace_audit_log\(/i,
  );
  assert.match(
    completeSql,
    /revoke all on function public\.service_complete_github_app_onboarding[\s\S]+from public, anon, authenticated/i,
  );
  assert.match(
    completeSql,
    /grant execute on function public\.service_complete_github_app_onboarding[\s\S]+to service_role/i,
  );
});

test("state creation is service-only and restricted to active human admins", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /create or replace function public\.service_create_github_installation_state/i,
  );
  assert.match(
    sql,
    /join auth\.users[\s\S]+is_anonymous is false/i,
  );
  assert.match(sql, /workspace\.status = 'active'/i);
  assert.match(sql, /membership\.status = 'active'/i);
  assert.match(sql, /membership\.role in \('owner', 'admin'\)/i);
  assert.match(sql, /interval '10 minutes'/i);
  assert.match(
    sql,
    /revoke all on function public\.service_create_github_installation_state[\s\S]+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.service_create_github_installation_state[\s\S]+to service_role/i,
  );
});

test("state claim atomically rejects replay and expiry", async () => {
  const sql = await migrationSql();
  const claimSql = sql.slice(
    sql.indexOf(
      "create or replace function public.service_claim_github_installation_state",
    ),
  );

  assert.match(
    sql,
    /create or replace function public\.service_claim_github_installation_state/i,
  );
  assert.match(
    sql,
    /update public\.github_installation_states[\s\S]+set consumed_at = clock_timestamp\(\)[\s\S]+phase = p_expected_phase[\s\S]+consumed_at is null[\s\S]+expires_at > clock_timestamp\(\)[\s\S]+returning/i,
  );
  assert.match(
    sql,
    /if claimed_state\.state_digest is null[\s\S]+raise exception 'invalid, expired, or consumed installation state'/i,
  );
  assert.match(
    claimSql,
    /from public\.workspaces workspace[\s\S]+public\.workspace_memberships membership[\s\S]+auth\.users human/i,
  );
  assert.match(claimSql, /workspace\.status = 'active'/i);
  assert.match(claimSql, /membership\.status = 'active'/i);
  assert.match(claimSql, /membership\.role in \('owner', 'admin'\)/i);
  assert.match(claimSql, /human\.is_anonymous is false/i);
});

test("state rows are force-RLS protected from direct client mutation", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /alter table public\.github_installation_states enable row level security/i,
  );
  assert.match(
    sql,
    /alter table public\.github_installation_states force row level security/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.github_installation_states from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[\s\S]+on public\.github_installation_states/i,
  );
});
