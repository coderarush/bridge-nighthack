import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/0006_workspaces_and_installations.sql",
  import.meta.url,
);

async function migrationSql(): Promise<string> {
  return readFile(migrationUrl, "utf8").catch(() => "");
}

test("production migration defines the workspace-owned data graph", async () => {
  const sql = await migrationSql();
  assert.ok(sql.length > 0, "0006 workspace migration must exist");

  for (const table of [
    "workspaces",
    "workspace_memberships",
    "secret_references",
    "github_app_installations",
    "provider_connections",
    "migration_recipes",
    "webhook_deliveries",
    "orchestration_jobs",
    "orchestration_attempts",
    "workspace_audit_logs",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
  }

  assert.match(
    sql,
    /alter table public\.repositories[\s\S]*add column workspace_id uuid/i,
  );
  assert.match(
    sql,
    /alter table public\.repositories[\s\S]*alter column workspace_id set not null/i,
  );
  assert.match(
    sql,
    /unique \(workspace_id, source, delivery_id\)/i,
  );
  assert.match(
    sql,
    /unique \(workspace_id, idempotency_key\)/i,
  );
  assert.match(sql, /unique \(job_id, attempt_number\)/i);
});

test("production migration stores references instead of raw secrets", async () => {
  const sql = await migrationSql();

  assert.match(sql, /create table public\.secret_references/i);
  assert.match(sql, /secret_provider text not null/i);
  assert.match(sql, /secret_locator text not null/i);
  assert.match(sql, /credential_reference_id uuid/i);
  assert.doesNotMatch(
    sql,
    /\b(client_secret|private_key|access_token|refresh_token|webhook_secret|encrypted_secret)\b/i,
  );
});

test("production migration enables fail-closed workspace RLS", async () => {
  const sql = await migrationSql();

  for (const table of [
    "workspaces",
    "workspace_memberships",
    "secret_references",
    "github_app_installations",
    "provider_connections",
    "repositories",
    "migration_recipes",
    "webhook_deliveries",
    "orchestration_jobs",
    "orchestration_attempts",
    "workspace_audit_logs",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `alter table public\\.${table} force row level security`,
        "i",
      ),
    );
  }

  assert.match(
    sql,
    /revoke all on table[\s\S]+from anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant (insert|update|delete|truncate|references|trigger|all)[^;]+to authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /for (insert|update|delete|all)\s+to authenticated/i,
  );
  assert.match(sql, /create policy workspace_member_read/i);
  assert.match(sql, /create policy workspace_repository_read/i);
});

test("production mutations are exposed only through service-role RPCs", async () => {
  const sql = await migrationSql();

  for (const rpc of [
    "service_create_workspace",
    "service_set_workspace_membership",
    "service_register_github_installation",
    "service_upsert_provider_connection",
    "service_register_repository",
    "service_register_recipe",
    "service_record_webhook_delivery",
    "service_update_webhook_delivery",
    "service_enqueue_orchestration_job",
    "service_start_orchestration_attempt",
    "service_finish_orchestration_attempt",
    "service_append_workspace_audit_log",
    "service_store_secret_reference",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `create or replace function public\\.${rpc}[\\s\\S]+?security definer[\\s\\S]+?set search_path = ''`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${rpc}`, "i"),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${rpc}[\\s\\S]+?to service_role`,
        "i",
      ),
    );
  }
});
