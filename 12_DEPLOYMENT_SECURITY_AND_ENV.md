# Deployment, Security, and Environment Checklist

## Production topology

- Web/server deployment.
- Supabase project.
- Backend GitHub PAT (fine-grained, single demo repo) for the preserved demo.
- Registered least-privilege GitHub App for the later team pre-install flow.
- No deployed GitHub App lifecycle webhook route or worker is claimed.
- GitHub demo organization/repository.
- Model API only if used for optional explanation.
- Public provider-spec URLs.

## Environment variables

Suggested names:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
GITHUB_TOKEN
GITHUB_DEMO_OWNER
GITHUB_DEMO_REPO
GITHUB_DEMO_BASE_BRANCH
GITHUB_APP_SLUG
GITHUB_APP_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY
GITHUB_APP_WEBHOOK_SECRET
GITHUB_INSTALLATION_REFERENCE_KEY
MODEL_API_KEY
DEMO_MODE
```

Never commit real values. Use separate development and production secrets. The
`GITHUB_TOKEN` is a fine-grained PAT scoped to only the demo repo (see
`ENV_EXAMPLE.txt`). GitHub App client/private/webhook material and the installation
reference key are server-only values. `MODEL_API_KEY` is optional and unused by
the verified deterministic path.

## GitHub security

- Scope the fine-grained PAT to only the demo repository, least privilege.
- Keep the token server-side only; never send it to the browser.
- Hard-code (from env) the demo owner/repo; never let arbitrary owner/repo input reach write operations.
- Ensure branch creation and PR creation are scoped to the configured demo repository.
- The preserved demo uses polling and no webhook.
- Keep the GitHub App webhook inactive until a signed, durable lifecycle route is
  deployed and verified.
- Archive the preserved evidence before rotating the PAT; revoke immediately if
  it ever appears in chat, logs, or client code.

## Supabase security

- Persist room and workspace data behind enforced Row Level Security.
- Use server-side service credentials only on trusted routes.
- Keep publishable key in the browser; keep secret/service key server-side.
- Do not put secrets in Realtime presence payloads.
- Persist comments/approvals; treat presence as ephemeral.

## Deployment checklist

- Production build succeeds locally or in CI before deployment.
- Correct Node/runtime version configured.
- Database migrations applied to production.
- Validation route polls the exact-SHA check-runs on production.
- GitHub PAT present in production env and scoped to the demo repo only.
- Public app URL matches the room links inserted into PR bodies.
- Health route returns success.
- Logs can be filtered by migration run ID.
- Error reporting is enabled or logs are easy to inspect.

Current verified state: migrations `0001` through `0010` are present locally,
`0006` through `0010` were applied as forward production migrations, the
canonical deployment is healthy, unauthenticated workspace/GitHub routes fail
closed, and a human workspace/create-read-audit/pre-install probe passed.
External GitHub callback and deployed-worker evidence remain incomplete.

## Observability

For each stage log:

- run ID,
- stage,
- attempt,
- duration,
- result,
- external request category,
- external ID after successful creation.

Never log:

- tokens,
- private keys,
- full private repository files,
- the GitHub token or raw GitHub response bodies.

## Demo mode

`DEMO_MODE` may:

- restrict product access to configured fixtures,
- expose a reset control to team members,
- use named demo identities,
- shorten polling intervals,
- disable unrelated routes.

It must not fabricate external success. A demo mode should reduce scope, not falsify evidence.

## Final credential audit

- Search repository history for key prefixes.
- Rotate any token ever pasted into chat, issue text, or client code.
- Remove temporary personal access tokens after the event.
- Revoke or narrow the GitHub PAT after the demo.
