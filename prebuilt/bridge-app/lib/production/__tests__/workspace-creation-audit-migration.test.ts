import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/0010_workspace_creation_audit.sql",
  import.meta.url,
);

test("workspace creation and its audit entry share one service-only RPC", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /create or replace function public\.service_create_workspace_with_audit\(\s*p_name text,\s*p_slug text,\s*p_owner_user_id uuid\s*\)/i,
  );
  assert.match(
    sql,
    /returns public\.workspaces\s+language plpgsql\s+security definer\s+set search_path = ''/i,
  );
  assert.match(
    sql,
    /public\.service_create_workspace\(\s*p_name,\s*p_slug,\s*p_owner_user_id\s*\)/i,
  );
  assert.match(
    sql,
    /public\.service_append_workspace_audit_log\(\s*created_workspace\.id,\s*'user',\s*'workspace\.created',\s*'workspace',\s*p_owner_user_id,\s*null,\s*created_workspace\.id::text,\s*null,\s*jsonb_build_object\('slug', created_workspace\.slug\)\s*\)/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.service_create_workspace_with_audit\(text,\s*text,\s*uuid\)\s+from public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /revoke execute on function public\.service_create_workspace\(text,\s*text,\s*uuid\)\s+from service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.service_create_workspace_with_audit\(text,\s*text,\s*uuid\)\s+to service_role/i,
  );
});
