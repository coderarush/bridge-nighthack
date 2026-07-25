import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("demo preparation deduplicates active starts inside the database", async () => {
  const sql = await readFile(
    new URL(
      "../../../supabase/migrations/0004_idempotent_demo_prepare.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /create or replace function public\.prepare_demo_run/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /updated_at > now\(\) - interval '30 seconds'/i);
  assert.match(sql, /prepared := false/i);
  assert.match(sql, /delete from public\.impacts/i);
  assert.match(
    sql,
    /grant execute on function public\.prepare_demo_run\(uuid\)\s+to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.prepare_demo_run\(uuid\)\s+to (anon|authenticated)/i,
  );
});
