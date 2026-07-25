# Production Architecture and Judge Q&A

## Status and boundary

Bridge's NightHack demo proves one controlled migration for AtlasPay, a fictional provider fixture, against one fixture repository. The later release adds a live tenant onboarding data plane, but it is not yet a complete multi-tenant migration-execution service.

Migrations `0006` through `0010` and the associated adapters are applied to production Supabase. The final application tree executed the complete migration chain in PGlite with tenant/RLS, service-RPC, and atomic rollback assertions. The deployed workspace and GitHub App routes then passed anonymous rejection, human workspace creation/read, audit persistence, and state-bound pre-install checks. GitHub's external consent/callback is not end-to-end verified, the controlled demo run graph remains outside this workspace model, and no durable worker is wired into the demo route.

## Production invariants

1. Every new production-foundation entity introduced by migration `0006` has one non-null `workspace_id`. The existing demo run graph still requires a staged workspace retrofit.
2. Cross-entity foreign keys include `workspace_id`, preventing a job in one workspace from referencing another workspace's repository, recipe, connection, delivery, or attempt.
3. Authenticated users receive read-only access through fail-closed RLS. No authenticated insert, update, or delete policy exists.
4. Mutations are exposed through narrowly named `SECURITY DEFINER` RPCs granted only to `service_role`.
5. Credentials are never stored in application tables. `secret_references` stores a secret-manager provider and locator only.
6. Webhook delivery identity and orchestration request identity are unique within a workspace.
7. Audit history is append-only through a service RPC.
8. Existing unscoped demo repositories are backfilled into a suspended, membership-free quarantine workspace before `repositories.workspace_id` becomes required.

## Tenant data graph

```text
workspace
  |-- memberships -> auth.users
  |-- secret references -> external secret manager
  |-- GitHub App installations
  |     `-- repositories
  |-- provider connections
  |-- migration recipes
  |-- webhook deliveries
  |-- orchestration jobs
  |     `-- orchestration attempts
  `-- audit logs
```

| Entity | Tenant boundary | Production purpose |
| --- | --- | --- |
| `workspaces` | Workspace root | Customer organization and lifecycle |
| `workspace_memberships` | `(workspace_id, user_id)` | Owner, admin, engineer, viewer, and auditor roles |
| `secret_references` | Workspace | Locator and version metadata for an external secret manager; never credential material |
| `github_app_installations` | Workspace plus globally unique keyed installation digest | Encrypted GitHub account installation reference, permissions, events, and lifecycle |
| `provider_connections` | Workspace plus provider account | Provider-side change source and non-sensitive configuration |
| `repositories` | Workspace plus installation | GitHub repository identity and default branch |
| `migration_recipes` | Workspace plus recipe key/version | Versioned deterministic transformation manifest and digest |
| `webhook_deliveries` | Workspace plus source/delivery ID | Deduplicated, sanitized webhook receipt |
| `orchestration_jobs` | Workspace plus idempotency key | Durable unit of migration work |
| `orchestration_attempts` | Workspace plus job/attempt number | Bounded worker execution history |
| `workspace_audit_logs` | Workspace | Append-only actor, action, target, request, and non-sensitive metadata |

## Authorization model

### Human reads

RLS is enabled and forced on every production table. Workspace membership must be active before a row is visible. Secret-reference locators are limited to owners and admins; audit logs are limited to owners, admins, and auditors.

The membership helper functions are `SECURITY DEFINER`, set an empty search path, and return only authorization booleans. Public and anonymous execution is revoked.

### Mutations

Direct mutation privileges are revoked from `anon`, `authenticated`, and `service_role`. The service role receives table reads plus execution on explicit mutation RPCs for:

- workspace creation and membership changes,
- secret-reference registration,
- GitHub installation, provider connection, repository, and recipe registration,
- idempotent webhook receipt and state updates,
- idempotent job enqueueing,
- attempt start and terminal completion,
- append-only workspace audit events.

The backend remains responsible for authenticating the caller and authorizing the requested workspace action before invoking a service RPC. A service credential is privileged infrastructure, not a substitute for application authorization.

### Secret handling

Application tables store only `secret_provider`, `secret_locator`, purpose, version, installation metadata, and other non-sensitive values. Referenced customer secrets belong in Supabase Vault or another external secret manager. GitHub App configuration is currently held as encrypted server-only Vercel environment variables. OAuth user tokens and installation tokens remain transient. None of these credential values may enter application tables, logs, webhook snapshots, job summaries, audit metadata, browser responses, or source control.

## Event-to-migration flow

1. A GitHub App or provider webhook reaches a server endpoint that verifies its signature before any database write.
2. The server resolves the workspace from the installation or provider connection.
3. `service_record_webhook_delivery` records a payload digest and sanitized payload. Reusing a delivery ID with a different digest fails closed.
4. `service_enqueue_durable_orchestration_job` deduplicates the work by `(workspace_id, idempotency_key)`.
5. A worker claims an attempt with an expiring fenced lease, loads the workspace-scoped repository/recipe/connection graph, and performs bounded migration stages. Renewal, success, and failure require the live lease token; stale workers are rejected.
6. Retryable failures receive deterministic capped exponential backoff. Success or terminal failure records the attempt/job result and appends audit evidence.
7. Bridge represents a migration as verified only when the controlled base failure, bounded PR diff, PR head SHA, and successful check SHA form one evidence chain.

This is the target event flow represented in source and tests. No deployed webhook route or worker currently executes it end to end.

## Red base -> green head proof

The fixture is intentionally red before migration: `demo-base` fails TypeScript validation on exactly the three deprecated AtlasPay request keys. Bridge must then produce a draft PR whose diff changes only those keys. The green GitHub Actions result counts only when its SHA equals the final PR head and the SHA displayed in Bridge.

This framing proves remediation, not merely that some branch happened to have a green check.

## Test evidence and its limit

The regular-expression migration tests assert that required tables, tenant keys, idempotency constraints, RLS declarations, grants, and RPC boundaries remain present. Those are migration-shape tests.

The final `npm test` snapshot discovered 219 tests: 218 passed and one Docker-only test was skipped because Docker Desktop's storage became unavailable. The exact final `0001` through `0010` migration chain separately executed in PGlite and passed tenant isolation, RLS visibility, service-only mutation boundaries, runtime guards, durable leases, workspace audit creation, and injected atomic-onboarding rollback.

Production Supabase then accepted `0006` through `0010`; a live human identity created and read its workspace through RLS, produced one audit record, and received the state-bound GitHub installation URL, while unauthenticated routes returned `401`. This is meaningful live evidence, but it does **not** prove the external GitHub callback, the full production role matrix, lifecycle webhook reconciliation, worker execution, customer-volume query plans, or external secret-manager operation.

## Remaining production gate

The clean migration execution, production apply, preserved-run regression, unauthenticated denial, human workspace/RLS probe, audit probe, and pre-install handshake are complete. Before inviting arbitrary teams to execute migrations:

1. Complete GitHub consent, OAuth callback, repository registration, and installation-token repository access end to end.
2. Test owner, admin, engineer, viewer, auditor, non-member, anonymous, and service identities against live RLS.
3. Confirm authenticated direct inserts, updates, deletes, and cross-workspace reads all fail in production.
4. Confirm the last active workspace owner cannot be removed or suspended.
5. Deploy lifecycle webhook reconciliation, then replay duplicate and conflicting deliveries.
6. Wire and deploy the durable worker, then test duplicate jobs, lease expiry, retries, and stale-worker rejection operationally.
7. Confirm secret values never appear in database rows, logs, job summaries, audit metadata, or browser payloads.
8. Measure indexes and query plans with realistic workspace, delivery, job, attempt, and audit volumes.
9. Rehearse backup, restore, rollback, retention, suspension, and incident-response procedures.
10. Retrofit the legacy demo run graph into workspace ownership before allowing team-created runs.

## Judge Q&A

### Is Bridge multi-tenant in production now?

Partially. The workspace data plane, forced RLS, human workspace creation, and GitHub pre-install handshake are live. The migration-execution plane is not fully tenant-ready because the preserved demo graph is not workspace-scoped, GitHub callback/lifecycle handling is incomplete, and no durable worker is deployed.

### What did you build before versus during NightHack?

The tagged baseline already contained the fictional AtlasPay fixture, deterministic scanner/patcher, initial schema, app scaffold, and integration plumbing. The in-window work added authenticated roles, fail-closed room access, persisted orchestration, GitHub draft-PR and exact-head validation, realtime collaboration, reset/idempotency controls, recursive source-discovery code, executable tenant/RLS migration tests, fenced durable jobs, workspace creation, a GitHub App callback foundation, and the rebuilt product UI. The preserved live run exercised only the `3407bf9` workflow; `DISCLOSURE.md` is the authoritative boundary.

### Why was the demo built with a repository-scoped credential instead of a GitHub App?

The scoped demo credential reduced installation risk inside a short build window and remains the credential used by the preserved run. A public GitHub App is now registered as `bridge-api-control-plane` (App ID `4389231`) with selected-repository scope and Actions, Checks, and Metadata read plus Contents and Pull requests write. Seven GitHub App variables are encrypted in Vercel Production. Migrations and routes are live, and the pre-install handshake passed. External consent/callback verification, lifecycle reconciliation, workspace execution through installation tokens, and PAT retirement remain required.

### How will the production tenant boundary prevent cross-tenant data leaks?

Every new production entity introduced by `0006` carries `workspace_id`; composite foreign keys prevent cross-workspace references; forced RLS requires active membership for human reads; authenticated users have no direct mutation grants; and service RPCs are the only database mutation surface. One live owner probe passed. The full role/non-member matrix and the legacy demo-graph retrofit remain.

### How do you stop duplicate webhook or worker activity?

Webhook deliveries are unique by workspace, source, and external delivery ID. A conflicting payload digest is rejected. Durable jobs are unique by workspace and idempotency key. Attempts use expiring fenced leases; renew, success, and failure reject stale tokens, while retryable failures use deterministic capped backoff and terminal failures retain structured evidence. These behaviors are implemented and tested, but no deployed worker uses them yet.

### Where are provider and GitHub credentials stored?

Outside application tables. Customer credential material is represented by secret-manager references. GitHub App configuration is in encrypted server-only Vercel environment variables, while OAuth user tokens and installation tokens are transient. Resolved values must not be persisted, logged, or sent to the browser.

### Is the SQL migration test proof that RLS works?

The regex test alone is not proof. The final PGlite run executed the complete chain and scripted tenant/RLS assertions; production Supabase accepted the migrations; and one real human identity passed create/read/audit checks. That still does not replace the full production role matrix, external callback test, or operational worker test.

### What is the strongest technical proof in the demo?

The complete evidence chain: an intentionally red base with three relevant type failures, a deterministic three-key draft-PR diff, and a green GitHub Actions job tied to the exact final PR head SHA shown in Bridge.

### What remains before this architecture is production-ready?

End-to-end GitHub installation callback verification, lifecycle webhook reconciliation, full live tenant-role probes, worker deployment and runtime wiring, queue operations, audit export/retention, observability, backup/restore rehearsal, data-retention policy, and migration away from the demo's direct data paths. Human workspace creation and the GitHub pre-install handshake are live; arbitrary-team migration execution is not yet claimed.
