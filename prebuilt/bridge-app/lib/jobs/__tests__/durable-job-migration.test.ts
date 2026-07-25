import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../../supabase/migrations/0007_durable_job_leases.sql",
  import.meta.url,
);

const fixtureSql = `
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.orchestration_jobs (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    repository_id uuid not null,
    recipe_id uuid,
    provider_connection_id uuid,
    source_delivery_id uuid,
    idempotency_key text not null,
    job_type text not null,
    request_summary jsonb not null default '{}'::jsonb,
    status text not null default 'queued'
      check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    priority smallint not null default 100,
    max_attempts smallint not null default 3,
    available_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (workspace_id, id),
    unique (workspace_id, idempotency_key)
  );

  create table public.orchestration_attempts (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    job_id uuid not null,
    attempt_number smallint not null,
    worker_id text not null,
    status text not null default 'running'
      check (status in ('running', 'succeeded', 'failed', 'cancelled')),
    result_summary jsonb not null default '{}'::jsonb,
    error_code text,
    error_message text,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    created_at timestamptz not null default now(),
    unique (workspace_id, id),
    unique (job_id, attempt_number),
    foreign key (workspace_id, job_id)
      references public.orchestration_jobs(workspace_id, id)
      on delete cascade
  );

  create or replace function public.service_start_orchestration_attempt(
    p_job_id uuid,
    p_worker_id text
  )
  returns public.orchestration_attempts
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    locked_job public.orchestration_jobs;
    next_attempt smallint;
    created_attempt public.orchestration_attempts;
  begin
    select *
    into locked_job
    from public.orchestration_jobs job
    where job.id = p_job_id
    for update;

    if locked_job.id is null then
      raise exception 'orchestration job not found'
        using errcode = 'P0002';
    end if;
    if locked_job.status not in ('queued', 'failed') then
      raise exception 'orchestration job cannot start from current state'
        using errcode = '55000';
    end if;

    select (coalesce(max(attempt.attempt_number), 0) + 1)::smallint
    into next_attempt
    from public.orchestration_attempts attempt
    where attempt.job_id = p_job_id;

    if next_attempt > locked_job.max_attempts then
      raise exception 'orchestration job exhausted attempts'
        using errcode = '54000';
    end if;

    insert into public.orchestration_attempts(
      workspace_id,
      job_id,
      attempt_number,
      worker_id
    )
    values (
      locked_job.workspace_id,
      locked_job.id,
      next_attempt,
      btrim(p_worker_id)
    )
    returning * into created_attempt;

    update public.orchestration_jobs
    set
      status = 'running',
      started_at = coalesce(started_at, now()),
      finished_at = null,
      updated_at = now()
    where id = p_job_id;

    return created_attempt;
  end;
  $$;

  create or replace function public.service_finish_orchestration_attempt(
    p_attempt_id uuid,
    p_status text,
    p_result_summary jsonb default '{}'::jsonb,
    p_error_code text default null,
    p_error_message text default null
  )
  returns public.orchestration_attempts
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    saved_attempt public.orchestration_attempts;
  begin
    if p_status not in ('succeeded', 'failed', 'cancelled') then
      raise exception 'invalid terminal attempt status'
        using errcode = '22023';
    end if;

    update public.orchestration_attempts attempt
    set
      status = p_status,
      result_summary = coalesce(p_result_summary, '{}'::jsonb),
      error_code = p_error_code,
      error_message = p_error_message,
      finished_at = now()
    where attempt.id = p_attempt_id
      and attempt.status = 'running'
    returning * into saved_attempt;

    if saved_attempt.id is null then
      raise exception 'running orchestration attempt not found'
        using errcode = 'P0002';
    end if;

    update public.orchestration_jobs
    set
      status = p_status,
      finished_at = now(),
      updated_at = now()
    where id = saved_attempt.job_id;

    return saved_attempt;
  end;
  $$;
`;

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "20000000-0000-4000-8000-000000000001";
const JOB_ID = "30000000-0000-4000-8000-000000000001";
const LEGACY_JOB_ID = "30000000-0000-4000-8000-000000000090";
const ATTEMPT_1_ID = "40000000-0000-4000-8000-000000000001";
const ATTEMPT_2_ID = "40000000-0000-4000-8000-000000000002";
const ATTEMPT_3_ID = "40000000-0000-4000-8000-000000000003";
const TOKEN_1 = "50000000-0000-4000-8000-000000000001";
const TOKEN_2 = "50000000-0000-4000-8000-000000000002";
const TOKEN_3 = "50000000-0000-4000-8000-000000000003";
const WRONG_TOKEN = "50000000-0000-4000-8000-000000000099";
const T0 = "2026-07-24T21:00:00.000Z";

type JsonRecord = Record<string, unknown>;

async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(fixtureSql);
  const migrationSql = await readFile(migrationUrl, "utf8").catch(() => "");
  if (migrationSql) await db.exec(migrationSql);
  return db;
}

async function enqueue(
  db: PGlite,
  {
    jobId = JOB_ID,
    key = "migration:atlaspay:v2",
    maxAttempts = 3,
    baseDelayMs = 1_000,
    maxDelayMs = 1_500,
    now = T0,
  }: {
    jobId?: string;
    key?: string;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    now?: string;
  } = {},
): Promise<JsonRecord> {
  const result = await db.query<{ result: JsonRecord }>(
    `select public.service_enqueue_durable_orchestration_job(
      $1::uuid, $2::uuid, $3::uuid, null::uuid, null::uuid, null::uuid,
      $4::text, 'repository_migration'::text, '{"provider":"atlaspay"}'::jsonb,
      100::smallint, $5::smallint, $6::integer, $7::integer, $8::timestamptz
    ) as result`,
    [
      jobId,
      WORKSPACE_ID,
      REPOSITORY_ID,
      key,
      maxAttempts,
      baseDelayMs,
      maxDelayMs,
      now,
    ],
  );
  return result.rows[0].result;
}

async function claim(
  db: PGlite,
  {
    jobId = JOB_ID,
    attemptId,
    token,
    now,
    expiresAt,
  }: {
    jobId?: string;
    attemptId: string;
    token: string;
    now: string;
    expiresAt: string;
  },
): Promise<JsonRecord | null> {
  const result = await db.query<{ result: JsonRecord | null }>(
    `select public.service_claim_orchestration_job(
      $1::uuid, 'worker-a'::text, $2::uuid, $3::uuid,
      $4::timestamptz, $5::timestamptz
    ) as result`,
    [jobId, attemptId, token, now, expiresAt],
  );
  return result.rows[0].result;
}

async function insertLegacyJob(
  db: PGlite,
  {
    jobId = LEGACY_JOB_ID,
    key = "legacy:atlaspay:v1",
    status = "queued",
    terminalFailure = null,
  }: {
    jobId?: string;
    key?: string;
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    terminalFailure?: JsonRecord | null;
  } = {},
): Promise<void> {
  await db.query(
    `insert into public.orchestration_jobs(
      id, workspace_id, repository_id, idempotency_key, job_type,
      request_summary, status, priority, max_attempts, available_at,
      terminal_failure, created_at, updated_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, $4::text, 'legacy_migration'::text,
      '{}'::jsonb, $5::text, 100::smallint, 3::smallint, $6::timestamptz,
      $7::jsonb, $6::timestamptz, $6::timestamptz
    )`,
    [
      jobId,
      WORKSPACE_ID,
      REPOSITORY_ID,
      key,
      status,
      T0,
      terminalFailure === null ? null : JSON.stringify(terminalFailure),
    ],
  );
}

type FailureRpcInput = {
  expectedAttemptNumber?: number | null;
  expectedMaxAttempts?: number | null;
  expectedBaseDelayMs?: number | null;
  expectedMaxDelayMs?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  failureRetryable?: boolean | null;
  failureDetails?: unknown;
  nextAvailableAt?: string | null;
  terminalFailure?: unknown;
  now?: string | null;
};

async function failAttempt(
  db: PGlite,
  {
    expectedAttemptNumber = 1,
    expectedMaxAttempts = 2,
    expectedBaseDelayMs = 1_000,
    expectedMaxDelayMs = 1_500,
    failureCode = "PERMANENT",
    failureMessage = "Cannot continue.",
    failureRetryable = false,
    failureDetails = { provider: "atlaspay" },
    nextAvailableAt = null,
    terminalFailure = {
      code: "PERMANENT",
      message: "Cannot continue.",
      retryable: false,
      originalRetryable: false,
      details: { provider: "atlaspay" },
      occurredAt: "2026-07-24T21:00:01.000Z",
      attemptNumber: 1,
      reason: "non_retryable",
    },
    now = "2026-07-24T21:00:01.000Z",
  }: FailureRpcInput = {},
): Promise<JsonRecord> {
  const result = await db.query<{ result: JsonRecord }>(
    `select public.service_fail_orchestration_attempt(
      $1::uuid, $2::uuid, $3::uuid, $4::smallint, $5::smallint,
      $6::integer, $7::integer, $8::text, $9::text, $10::boolean,
      $11::jsonb, $12::timestamptz, $13::jsonb, $14::timestamptz
    ) as result`,
    [
      JOB_ID,
      ATTEMPT_1_ID,
      TOKEN_1,
      expectedAttemptNumber,
      expectedMaxAttempts,
      expectedBaseDelayMs,
      expectedMaxDelayMs,
      failureCode,
      failureMessage,
      failureRetryable,
      failureDetails === null ? null : JSON.stringify(failureDetails),
      nextAvailableAt,
      terminalFailure === null ? null : JSON.stringify(terminalFailure),
      now,
    ],
  );
  return result.rows[0].result;
}

test("durable enqueue returns the original job for a repeated workspace key", async () => {
  const db = await createDatabase();
  try {
    const first = await enqueue(db);
    const second = await enqueue(db, {
      jobId: "30000000-0000-4000-8000-000000000099",
    });
    const count = await db.query<{ count: number; all_durable: boolean }>(
      `select count(*)::integer as count,
              bool_and(lease_required) as all_durable
       from public.orchestration_jobs`,
    );

    assert.equal(first.created, true);
    assert.equal((first.job as JsonRecord).id, JOB_ID);
    assert.equal(second.created, false);
    assert.equal((second.job as JsonRecord).id, JOB_ID);
    assert.equal(count.rows[0].count, 1);
    assert.equal(count.rows[0].all_durable, true);
  } finally {
    await db.close();
  }
});

test("durable enqueue rejects a same-key legacy job instead of returning unclaimable work", async () => {
  const db = await createDatabase();
  try {
    await insertLegacyJob(db, { key: "migration:atlaspay:v2" });

    await assert.rejects(
      enqueue(db, {
        jobId: "30000000-0000-4000-8000-000000000099",
      }),
      /legacy orchestration job/,
    );

    const stored = await db.query<{
      count: number;
      id: string;
      lease_required: boolean;
    }>(
      `select count(*) over ()::integer as count, id, lease_required
       from public.orchestration_jobs`,
    );
    assert.deepEqual(stored.rows, [
      {
        count: 1,
        id: LEGACY_JOB_ID,
        lease_required: false,
      },
    ]);
  } finally {
    await db.close();
  }
});

test("legacy start and finish continue to work for non-durable jobs", async () => {
  const db = await createDatabase();
  try {
    await insertLegacyJob(db);

    const started = await db.query<{
      id: string;
      job_id: string;
      status: string;
      lease_token: string | null;
    }>(
      `select *
       from public.service_start_orchestration_attempt(
         $1::uuid, 'legacy-worker'
       )`,
      [LEGACY_JOB_ID],
    );
    assert.equal(started.rows[0].job_id, LEGACY_JOB_ID);
    assert.equal(started.rows[0].status, "running");
    assert.equal(started.rows[0].lease_token, null);

    const finished = await db.query<{
      id: string;
      status: string;
      result_summary: JsonRecord;
    }>(
      `select *
       from public.service_finish_orchestration_attempt(
         $1::uuid, 'succeeded'::text, '{"legacy":true}'::jsonb,
         null::text, null::text
       )`,
      [started.rows[0].id],
    );
    assert.equal(finished.rows[0].status, "succeeded");
    assert.deepEqual(finished.rows[0].result_summary, { legacy: true });

    const job = await db.query<{
      status: string;
      lease_required: boolean;
      terminal_failure: JsonRecord | null;
    }>(
      `select status, lease_required, terminal_failure
       from public.orchestration_jobs where id = $1::uuid`,
      [LEGACY_JOB_ID],
    );
    assert.deepEqual(job.rows[0], {
      status: "succeeded",
      lease_required: false,
      terminal_failure: null,
    });
  } finally {
    await db.close();
  }
});

test("legacy RPCs and durable claim cannot cross the lease-required boundary", async () => {
  const db = await createDatabase();
  try {
    await enqueue(db);

    await assert.rejects(
      db.query(
        `select public.service_start_orchestration_attempt(
          $1::uuid, 'legacy-worker'::text
        )`,
        [JOB_ID],
      ),
      /durable orchestration jobs require lease-aware RPCs/,
    );

    await claim(db, {
      attemptId: ATTEMPT_1_ID,
      token: TOKEN_1,
      now: T0,
      expiresAt: "2026-07-24T21:01:00.000Z",
    });
    await assert.rejects(
      db.query(
        `select public.service_finish_orchestration_attempt(
          $1::uuid, 'succeeded'::text, '{}'::jsonb, null::text, null::text
        )`,
        [ATTEMPT_1_ID],
      ),
      /durable orchestration attempts require lease-aware RPCs/,
    );

    const durableState = await db.query<{
      job_status: string;
      attempt_status: string;
      lease_token: string;
    }>(
      `select job.status as job_status,
              attempt.status as attempt_status,
              attempt.lease_token
       from public.orchestration_jobs job
       join public.orchestration_attempts attempt on attempt.job_id = job.id
       where job.id = $1::uuid and attempt.id = $2::uuid`,
      [JOB_ID, ATTEMPT_1_ID],
    );
    assert.deepEqual(durableState.rows[0], {
      job_status: "running",
      attempt_status: "running",
      lease_token: TOKEN_1,
    });

    await insertLegacyJob(db, {
      jobId: "30000000-0000-4000-8000-000000000091",
      key: "legacy:terminal:v1",
      status: "failed",
      terminalFailure: {
        code: "PERMANENT",
        message: "Stopped.",
      },
    });
    await assert.rejects(
      db.query(
        `select public.service_start_orchestration_attempt(
          '30000000-0000-4000-8000-000000000091'::uuid,
          'legacy-worker'::text
        )`,
      ),
      /terminal orchestration job cannot start/,
    );

    await insertLegacyJob(db, {
      jobId: "30000000-0000-4000-8000-000000000092",
      key: "legacy:claim:v1",
    });
    await assert.rejects(
      claim(db, {
        jobId: "30000000-0000-4000-8000-000000000092",
        attemptId: "40000000-0000-4000-8000-000000000092",
        token: "50000000-0000-4000-8000-000000000092",
        now: T0,
        expiresAt: "2026-07-24T21:01:00.000Z",
      }),
      /does not require durable leases/,
    );
  } finally {
    await db.close();
  }
});

test("lease-bound renewal rejects wrong tokens and the exact expiry boundary", async () => {
  const db = await createDatabase();
  try {
    await enqueue(db);
    await claim(db, {
      attemptId: ATTEMPT_1_ID,
      token: TOKEN_1,
      now: T0,
      expiresAt: "2026-07-24T21:00:10.000Z",
    });

    await assert.rejects(
      db.query(
        `select public.service_renew_orchestration_lease(
          $1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz
        )`,
        [
          JOB_ID,
          ATTEMPT_1_ID,
          WRONG_TOKEN,
          "2026-07-24T21:00:01.000Z",
          "2026-07-24T21:00:20.000Z",
        ],
      ),
      /stale or expired orchestration lease/,
    );

    await assert.rejects(
      db.query(
        `select public.service_renew_orchestration_lease(
          $1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz
        )`,
        [
          JOB_ID,
          ATTEMPT_1_ID,
          TOKEN_1,
          "2026-07-24T21:00:10.000Z",
          "2026-07-24T21:00:20.000Z",
        ],
      ),
      /stale or expired orchestration lease/,
    );

    const stored = await db.query<{ status: string; expires_ms: number }>(
      `select status, (extract(epoch from lease_expires_at) * 1000)::double precision as expires_ms
       from public.orchestration_attempts where id = $1::uuid`,
      [ATTEMPT_1_ID],
    );
    assert.deepEqual(stored.rows[0], {
      status: "running",
      expires_ms: Date.parse("2026-07-24T21:00:10.000Z"),
    });
  } finally {
    await db.close();
  }
});

test("completion requires a live matching fence and atomically succeeds both rows", async () => {
  const db = await createDatabase();
  try {
    await enqueue(db);
    await claim(db, {
      attemptId: ATTEMPT_1_ID,
      token: TOKEN_1,
      now: T0,
      expiresAt: "2026-07-24T21:00:10.000Z",
    });

    const completed = await db.query<{ result: JsonRecord }>(
      `select public.service_complete_orchestration_attempt(
        $1::uuid, $2::uuid, $3::uuid, '{"commitSha":"abc123"}'::jsonb,
        $4::timestamptz
      ) as result`,
      [
        JOB_ID,
        ATTEMPT_1_ID,
        TOKEN_1,
        "2026-07-24T21:00:09.999Z",
      ],
    );

    assert.equal(
      ((completed.rows[0].result.job as JsonRecord).status),
      "succeeded",
    );
    assert.equal(
      ((completed.rows[0].result.attempt as JsonRecord).status),
      "succeeded",
    );
    assert.deepEqual(
      ((completed.rows[0].result.attempt as JsonRecord).result_summary),
      { commitSha: "abc123" },
    );
  } finally {
    await db.close();
  }
});

test("explicit failure schedules a retry and preserves a structured terminal failure", async () => {
  const db = await createDatabase();
  try {
    await enqueue(db, { maxAttempts: 2 });
    await claim(db, {
      attemptId: ATTEMPT_1_ID,
      token: TOKEN_1,
      now: T0,
      expiresAt: "2026-07-24T21:01:00.000Z",
    });

    await db.query(
      `select public.service_fail_orchestration_attempt(
        $1::uuid, $2::uuid, $3::uuid, 1::smallint, 2::smallint,
        1000::integer, 1500::integer, 'UPSTREAM_UNAVAILABLE'::text,
        'Try later.'::text, true, '{"provider":"atlaspay"}'::jsonb,
        '2026-07-24T21:00:01.000Z'::timestamptz, null::jsonb,
        '2026-07-24T21:00:00.000Z'::timestamptz
      )`,
      [JOB_ID, ATTEMPT_1_ID, TOKEN_1],
    );
    const retry = await db.query<{ status: string; available_ms: number }>(
      `select status, (extract(epoch from available_at) * 1000)::double precision as available_ms
       from public.orchestration_jobs where id = $1::uuid`,
      [JOB_ID],
    );
    assert.deepEqual(retry.rows[0], {
      status: "queued",
      available_ms: Date.parse("2026-07-24T21:00:01.000Z"),
    });

    await claim(db, {
      attemptId: ATTEMPT_2_ID,
      token: TOKEN_2,
      now: "2026-07-24T21:00:01.000Z",
      expiresAt: "2026-07-24T21:01:01.000Z",
    });
    const terminalFailure = {
      code: "UPSTREAM_UNAVAILABLE",
      message: "Attempts exhausted.",
      retryable: false,
      originalRetryable: true,
      details: { upstreamStatus: 503 },
      occurredAt: "2026-07-24T21:00:02.000Z",
      attemptNumber: 2,
      reason: "attempts_exhausted",
    };
    await db.query(
      `select public.service_fail_orchestration_attempt(
        $1::uuid, $2::uuid, $3::uuid, 2::smallint, 2::smallint,
        1000::integer, 1500::integer, 'UPSTREAM_UNAVAILABLE'::text,
        'Attempts exhausted.'::text, true, '{"upstreamStatus":503}'::jsonb,
        null::timestamptz, $4::jsonb, '2026-07-24T21:00:02.000Z'::timestamptz
      )`,
      [JOB_ID, ATTEMPT_2_ID, TOKEN_2, JSON.stringify(terminalFailure)],
    );
    const terminal = await db.query<{
      status: string;
      terminal_failure: JsonRecord;
    }>(
      `select status, terminal_failure
       from public.orchestration_jobs where id = $1::uuid`,
      [JOB_ID],
    );
    assert.equal(terminal.rows[0].status, "failed");
    assert.deepEqual(terminal.rows[0].terminal_failure, terminalFailure);
  } finally {
    await db.close();
  }
});

test("malformed or inconsistent terminal failures are rejected without mutation", async () => {
  const db = await createDatabase();
  try {
    await enqueue(db, { maxAttempts: 2 });
    await claim(db, {
      attemptId: ATTEMPT_1_ID,
      token: TOKEN_1,
      now: T0,
      expiresAt: "2026-07-24T21:01:00.000Z",
    });

    const validTerminal = {
      code: "PERMANENT",
      message: "Cannot continue.",
      retryable: false,
      originalRetryable: false,
      details: { provider: "atlaspay" },
      occurredAt: "2026-07-24T21:00:01.000Z",
      attemptNumber: 1,
      reason: "non_retryable",
    };
    const invalidCases: Array<{
      name: string;
      input: FailureRpcInput;
    }> = [
      { name: "null code", input: { failureCode: null } },
      { name: "blank code", input: { failureCode: "   " } },
      { name: "null message", input: { failureMessage: null } },
      { name: "blank message", input: { failureMessage: "   " } },
      { name: "null details", input: { failureDetails: null } },
      { name: "non-object details", input: { failureDetails: [] } },
      { name: "missing terminal fields", input: { terminalFailure: {} } },
      {
        name: "extra terminal field",
        input: {
          terminalFailure: { ...validTerminal, unexpected: true },
        },
      },
      {
        name: "wrong terminal code type",
        input: { terminalFailure: { ...validTerminal, code: 7 } },
      },
      {
        name: "mismatched terminal code",
        input: {
          terminalFailure: { ...validTerminal, code: "DIFFERENT" },
        },
      },
      {
        name: "wrong terminal message type",
        input: { terminalFailure: { ...validTerminal, message: false } },
      },
      {
        name: "mismatched terminal message",
        input: {
          terminalFailure: { ...validTerminal, message: "Different." },
        },
      },
      {
        name: "terminal retryable is not false",
        input: {
          terminalFailure: { ...validTerminal, retryable: true },
        },
      },
      {
        name: "wrong terminal retryable type",
        input: {
          terminalFailure: { ...validTerminal, retryable: "false" },
        },
      },
      {
        name: "mismatched original retryability",
        input: {
          terminalFailure: { ...validTerminal, originalRetryable: true },
        },
      },
      {
        name: "wrong original retryability type",
        input: {
          terminalFailure: {
            ...validTerminal,
            originalRetryable: "false",
          },
        },
      },
      {
        name: "non-object terminal details",
        input: { terminalFailure: { ...validTerminal, details: [] } },
      },
      {
        name: "mismatched terminal details",
        input: {
          terminalFailure: {
            ...validTerminal,
            details: { provider: "different" },
          },
        },
      },
      {
        name: "wrong occurrence type",
        input: { terminalFailure: { ...validTerminal, occurredAt: 7 } },
      },
      {
        name: "mismatched occurrence",
        input: {
          terminalFailure: {
            ...validTerminal,
            occurredAt: "2026-07-24T21:00:02.000Z",
          },
        },
      },
      {
        name: "invalid occurrence timestamp",
        input: {
          terminalFailure: {
            ...validTerminal,
            occurredAt: "not-a-timestamp",
          },
        },
      },
      {
        name: "non-integer attempt number",
        input: {
          terminalFailure: { ...validTerminal, attemptNumber: 1.5 },
        },
      },
      {
        name: "mismatched attempt number",
        input: {
          terminalFailure: { ...validTerminal, attemptNumber: 2 },
        },
      },
      {
        name: "inconsistent terminal reason",
        input: {
          terminalFailure: {
            ...validTerminal,
            reason: "attempts_exhausted",
          },
        },
      },
      {
        name: "wrong terminal reason type",
        input: {
          terminalFailure: { ...validTerminal, reason: false },
        },
      },
      {
        name: "retryable terminal before exhaustion",
        input: {
          failureRetryable: true,
          terminalFailure: {
            ...validTerminal,
            originalRetryable: true,
            reason: "attempts_exhausted",
          },
        },
      },
      {
        name: "null retryability in retry branch",
        input: {
          failureRetryable: null,
          nextAvailableAt: "2026-07-24T21:00:02.000Z",
          terminalFailure: null,
        },
      },
      {
        name: "missing failure disposition",
        input: {
          nextAvailableAt: null,
          terminalFailure: null,
        },
      },
      {
        name: "conflicting failure dispositions",
        input: {
          nextAvailableAt: "2026-07-24T21:00:02.000Z",
          terminalFailure: validTerminal,
        },
      },
      {
        name: "non-retryable retry disposition",
        input: {
          nextAvailableAt: "2026-07-24T21:00:02.000Z",
          terminalFailure: null,
        },
      },
      {
        name: "null transition time",
        input: { now: null },
      },
    ];

    for (const invalidCase of invalidCases) {
      await assert.rejects(
        failAttempt(db, invalidCase.input),
        `${invalidCase.name} should reject`,
      );
    }

    const unchanged = await db.query<{
      job_status: string;
      terminal_failure: JsonRecord | null;
      attempt_status: string;
      error_code: string | null;
      error_message: string | null;
      retryable: boolean | null;
      finished_at: string | null;
    }>(
      `select job.status as job_status,
              job.terminal_failure,
              attempt.status as attempt_status,
              attempt.error_code,
              attempt.error_message,
              attempt.retryable,
              attempt.finished_at
       from public.orchestration_jobs job
       join public.orchestration_attempts attempt on attempt.job_id = job.id
       where job.id = $1::uuid and attempt.id = $2::uuid`,
      [JOB_ID, ATTEMPT_1_ID],
    );
    assert.deepEqual(unchanged.rows[0], {
      job_status: "running",
      terminal_failure: null,
      attempt_status: "running",
      error_code: null,
      error_message: null,
      retryable: null,
      finished_at: null,
    });
  } finally {
    await db.close();
  }
});

test("a valid non-retryable terminal failure remains supported", async () => {
  const db = await createDatabase();
  try {
    await enqueue(db, { maxAttempts: 2 });
    await claim(db, {
      attemptId: ATTEMPT_1_ID,
      token: TOKEN_1,
      now: T0,
      expiresAt: "2026-07-24T21:01:00.000Z",
    });

    const transition = await failAttempt(db);

    assert.equal((transition.job as JsonRecord).status, "failed");
    assert.equal((transition.attempt as JsonRecord).status, "failed");
    assert.deepEqual(
      (transition.job as JsonRecord).terminal_failure,
      {
        code: "PERMANENT",
        message: "Cannot continue.",
        retryable: false,
        originalRetryable: false,
        details: { provider: "atlaspay" },
        occurredAt: "2026-07-24T21:00:01.000Z",
        attemptNumber: 1,
        reason: "non_retryable",
      },
    );
  } finally {
    await db.close();
  }
});

test("failure rejects a mismatched expected attempt or retry policy without mutation", async () => {
  const db = await createDatabase();
  try {
    await enqueue(db, { maxAttempts: 2 });
    await claim(db, {
      attemptId: ATTEMPT_1_ID,
      token: TOKEN_1,
      now: T0,
      expiresAt: "2026-07-24T21:01:00.000Z",
    });

    await assert.rejects(
      db.query(
        `select public.service_fail_orchestration_attempt(
          $1::uuid, $2::uuid, $3::uuid, 2::smallint, 2::smallint,
          1000::integer, 1500::integer, 'UPSTREAM_UNAVAILABLE'::text,
          'Try later.'::text, true, '{"provider":"atlaspay"}'::jsonb,
          '2026-07-24T21:00:01.000Z'::timestamptz, null::jsonb,
          '2026-07-24T21:00:00.000Z'::timestamptz
        )`,
        [JOB_ID, ATTEMPT_1_ID, TOKEN_1],
      ),
      /stale or expired orchestration lease/,
    );

    await assert.rejects(
      db.query(
        `select public.service_fail_orchestration_attempt(
          $1::uuid, $2::uuid, $3::uuid, 1::smallint, 2::smallint,
          999::integer, 1500::integer, 'UPSTREAM_UNAVAILABLE'::text,
          'Try later.'::text, true, '{"provider":"atlaspay"}'::jsonb,
          '2026-07-24T21:00:01.000Z'::timestamptz, null::jsonb,
          '2026-07-24T21:00:00.000Z'::timestamptz
        )`,
        [JOB_ID, ATTEMPT_1_ID, TOKEN_1],
      ),
      /stale or expired orchestration lease/,
    );

    await assert.rejects(
      db.query(
        `select public.service_fail_orchestration_attempt(
          $1::uuid, $2::uuid, $3::uuid, null::smallint, 2::smallint,
          1000::integer, 1500::integer, 'UPSTREAM_UNAVAILABLE'::text,
          'Try later.'::text, true, '{"provider":"atlaspay"}'::jsonb,
          '2026-07-24T21:00:01.000Z'::timestamptz, null::jsonb,
          '2026-07-24T21:00:00.000Z'::timestamptz
        )`,
        [JOB_ID, ATTEMPT_1_ID, TOKEN_1],
      ),
      /stale or expired orchestration lease/,
    );

    const unchanged = await db.query<{
      job_status: string;
      attempt_status: string;
      error_code: string | null;
      finished_at: string | null;
    }>(
      `select job.status as job_status,
              attempt.status as attempt_status,
              attempt.error_code,
              attempt.finished_at
       from public.orchestration_jobs job
       join public.orchestration_attempts attempt on attempt.job_id = job.id
       where job.id = $1::uuid and attempt.id = $2::uuid`,
      [JOB_ID, ATTEMPT_1_ID],
    );
    assert.deepEqual(unchanged.rows[0], {
      job_status: "running",
      attempt_status: "running",
      error_code: null,
      finished_at: null,
    });
  } finally {
    await db.close();
  }
});

test("expired leases fail lazily, use capped backoff, and terminalize after exhaustion", async () => {
  const db = await createDatabase();
  try {
    await enqueue(db, {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 1_500,
    });
    await claim(db, {
      attemptId: ATTEMPT_1_ID,
      token: TOKEN_1,
      now: T0,
      expiresAt: "2026-07-24T21:00:10.000Z",
    });

    assert.equal(
      await claim(db, {
        attemptId: ATTEMPT_2_ID,
        token: TOKEN_2,
        now: "2026-07-24T21:00:10.000Z",
        expiresAt: "2026-07-24T21:00:20.000Z",
      }),
      null,
    );
    let retry = await db.query<{
      status: string;
      available_ms: number;
      error_code: string;
    }>(
      `select job.status,
              (extract(epoch from job.available_at) * 1000)::double precision as available_ms,
              attempt.error_code
       from public.orchestration_jobs job
       join public.orchestration_attempts attempt on attempt.job_id = job.id
       where job.id = $1::uuid and attempt.id = $2::uuid`,
      [JOB_ID, ATTEMPT_1_ID],
    );
    assert.deepEqual(retry.rows[0], {
      status: "queued",
      available_ms: Date.parse("2026-07-24T21:00:11.000Z"),
      error_code: "LEASE_EXPIRED",
    });

    await claim(db, {
      attemptId: ATTEMPT_2_ID,
      token: TOKEN_2,
      now: "2026-07-24T21:00:11.000Z",
      expiresAt: "2026-07-24T21:00:20.000Z",
    });
    assert.equal(
      await claim(db, {
        attemptId: ATTEMPT_3_ID,
        token: TOKEN_3,
        now: "2026-07-24T21:00:20.000Z",
        expiresAt: "2026-07-24T21:00:30.000Z",
      }),
      null,
    );
    retry = await db.query<{
      status: string;
      available_ms: number;
      error_code: string;
    }>(
      `select job.status,
              (extract(epoch from job.available_at) * 1000)::double precision as available_ms,
              attempt.error_code
       from public.orchestration_jobs job
       join public.orchestration_attempts attempt on attempt.job_id = job.id
       where job.id = $1::uuid and attempt.id = $2::uuid`,
      [JOB_ID, ATTEMPT_2_ID],
    );
    assert.deepEqual(retry.rows[0], {
      status: "queued",
      available_ms: Date.parse("2026-07-24T21:00:21.500Z"),
      error_code: "LEASE_EXPIRED",
    });

    await claim(db, {
      attemptId: ATTEMPT_3_ID,
      token: TOKEN_3,
      now: "2026-07-24T21:00:21.500Z",
      expiresAt: "2026-07-24T21:00:30.000Z",
    });
    assert.equal(
      await claim(db, {
        attemptId: "40000000-0000-4000-8000-000000000004",
        token: "50000000-0000-4000-8000-000000000004",
        now: "2026-07-24T21:00:30.000Z",
        expiresAt: "2026-07-24T21:00:40.000Z",
      }),
      null,
    );

    const terminal = await db.query<{
      status: string;
      code: string;
      message: string;
      original_retryable: boolean;
      attempt_number: number;
      reason: string;
      occurred_ms: number;
    }>(
      `select status,
              terminal_failure ->> 'code' as code,
              terminal_failure ->> 'message' as message,
              (terminal_failure ->> 'originalRetryable')::boolean as original_retryable,
              (terminal_failure ->> 'attemptNumber')::integer as attempt_number,
              terminal_failure ->> 'reason' as reason,
              (extract(epoch from (terminal_failure ->> 'occurredAt')::timestamptz) * 1000)::double precision as occurred_ms
       from public.orchestration_jobs where id = $1::uuid`,
      [JOB_ID],
    );
    assert.deepEqual(terminal.rows[0], {
      status: "failed",
      code: "LEASE_EXPIRED",
      message: "Lease expired before completion.",
      original_retryable: true,
      attempt_number: 3,
      reason: "attempts_exhausted",
      occurred_ms: Date.parse("2026-07-24T21:00:30.000Z"),
    });
  } finally {
    await db.close();
  }
});

test("durable RPC execution is granted to service_role but not API user roles", async () => {
  const db = await createDatabase();
  try {
    const privileges = await db.query<{
      function_name: string;
      service_role: boolean;
      anon: boolean;
      authenticated: boolean;
    }>(
      `select routine.proname as function_name,
              has_function_privilege('service_role', routine.oid, 'execute') as service_role,
              has_function_privilege('anon', routine.oid, 'execute') as anon,
              has_function_privilege('authenticated', routine.oid, 'execute') as authenticated
       from pg_proc routine
       join pg_namespace namespace on namespace.oid = routine.pronamespace
       where namespace.nspname = 'public'
         and routine.proname = any(array[
           'service_enqueue_durable_orchestration_job',
           'service_claim_orchestration_job',
           'service_renew_orchestration_lease',
           'service_complete_orchestration_attempt',
           'service_fail_orchestration_attempt'
         ])
       order by routine.proname`,
    );

    assert.deepEqual(privileges.rows, [
      {
        function_name: "service_claim_orchestration_job",
        service_role: true,
        anon: false,
        authenticated: false,
      },
      {
        function_name: "service_complete_orchestration_attempt",
        service_role: true,
        anon: false,
        authenticated: false,
      },
      {
        function_name: "service_enqueue_durable_orchestration_job",
        service_role: true,
        anon: false,
        authenticated: false,
      },
      {
        function_name: "service_fail_orchestration_attempt",
        service_role: true,
        anon: false,
        authenticated: false,
      },
      {
        function_name: "service_renew_orchestration_lease",
        service_role: true,
        anon: false,
        authenticated: false,
      },
    ]);
  } finally {
    await db.close();
  }
});
