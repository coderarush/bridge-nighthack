# Bridge App

This directory contains the deployed Bridge product: a Next.js application,
Supabase/Postgres data layer, GitHub adapters, deterministic TypeScript migration
engine, workspace onboarding foundation, and test suite.

- Production: https://bridge-nighthack.vercel.app
- Root project guide: [`../../README.md`](../../README.md)
- Verified submission evidence: [`../../SUBMISSION.md`](../../SUBMISSION.md)
- Disclosure: [`../../DISCLOSURE.md`](../../DISCLOSURE.md)

## Commands

```bash
npm ci
cp .env.example .env.local
npm test
npm run typecheck
npm run build
npm run dev
```

`npm run patch:preview` previews the deterministic AtlasPay patch against the
controlled fixture in `../atlas-store-demo`.

## Main Modules

| Path | Responsibility |
| --- | --- |
| `app/api/runs` | Authenticated migration orchestration, validation, review, and recovery routes |
| `lib/openapi` | Controlled contract-diff normalization |
| `lib/scanner` | Guarded TypeScript impact discovery |
| `lib/patcher` | Deterministic AST edits; no LLM on the write path |
| `lib/adapters` | GitHub source, PR, check, and GitHub App boundaries |
| `lib/evidence` | Complete-chain and current-PR-head verification |
| `lib/jobs` | Durable job state, fenced leases, retries, and storage boundary |
| `lib/auth` | Human and capability session enforcement |
| `supabase/migrations` | Demo and production-foundation schema, RLS, and service RPCs |

## Environment

`.env.example` documents every public and server-only variable. Keep
`.env.local` untracked. The controlled demo still uses a fine-grained,
repository-scoped PAT. GitHub App installation credentials and short-lived
installation tokens are the production boundary, but arbitrary-team execution
is not enabled until that path passes end-to-end consent, callback, repository
access, lifecycle, and worker verification.

## Verification Snapshot

At application release `21fa19c`:

- 219 Node tests were discovered; 218 passed and one Docker-only integration
  test was skipped when Docker was unavailable.
- TypeScript, the optimized production build, dependency audit, diff checks,
  and PGlite migration execution passed.
- Production health, public routes, unauthenticated denial, current PR-head
  comparison, and desktop/mobile visual checks passed.

The preserved evidence run was produced by `3407bf9`, not by the later
production-foundation code. See the root disclosure before making provenance
claims.
