import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("run membership scopes provider and customer database reads", async () => {
  const sql = await readFile(
    new URL(
      "../../../supabase/migrations/0005_run_scoped_authorization.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /create table public\.run_participants/i);
  assert.match(sql, /primary key \(run_id, user_id\)/i);
  assert.match(
    sql,
    /alter table public\.participant_invites\s+add column run_id uuid/i,
  );
  assert.match(
    sql,
    /insert into public\.run_participants\(run_id, user_id\)/i,
  );
  assert.match(
    sql,
    /participant capability does not match existing identity[\s\S]*insert into public\.participants/i,
  );
  assert.match(sql, /participant\.role = 'operator'/i);
  assert.match(sql, /membership\.run_id = p_run_id/i);
  assert.match(
    sql,
    /create policy bridge_participant_self_read[\s\S]*participants\.user_id = \(select auth\.uid\(\)\)/i,
  );
  assert.match(
    sql,
    /create policy bridge_run_member_read[\s\S]*public\.can_read_run\(migration_runs\.id\)/i,
  );
  assert.match(
    sql,
    /create policy bridge_comment_member_read[\s\S]*public\.can_read_run\(comments\.run_id\)/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.run_participants from anon/i,
  );
});
