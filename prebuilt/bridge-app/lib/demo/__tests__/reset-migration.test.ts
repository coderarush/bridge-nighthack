import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/0003_demo_reset.sql", import.meta.url),
  "utf8",
);

test("demo reset is one service-role-only database transaction", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /create or replace function public\.reset_demo_run/);
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all on function public\.reset_demo_run\(uuid\)[\s\S]*authenticated/);
  assert.match(migration, /grant execute on function public\.reset_demo_run\(uuid\)[\s\S]*service_role/);
  assert.match(migration, /commit;/);
});

test("demo reset clears derived rows and all external evidence fields", () => {
  for (const table of [
    "approvals",
    "comments",
    "run_events",
    "impacts",
    "migration_plans",
  ]) {
    assert.match(
      migration,
      new RegExp(`delete from public\\.${table} where run_id = p_run_id`),
    );
  }

  for (const column of [
    "branch_name",
    "commit_sha",
    "pull_request_number",
    "pull_request_url",
    "validation_url",
    "validation_status",
    "validation_conclusion",
    "error_code",
    "error_message",
    "lock_owner",
    "lock_expires_at",
  ]) {
    assert.match(migration, new RegExp(`${column} = null`));
  }
});
