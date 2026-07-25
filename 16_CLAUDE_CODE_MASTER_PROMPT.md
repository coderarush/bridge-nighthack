# Claude Code Master Prompt

Copy the text below into Claude Code at the root of a clean repository together with this packet.

```text
You are the lead engineer for Bridge, a production-deployed NightHack project.

Bridge turns a third-party API breaking change into a repo-specific, tested draft pull request and a shared migration room. The NightHack build window is 4 hours 45 minutes (7:00 PM kickoff, 11:45 PM end). The demo must work from a public URL and show one controlled AtlasPay v1 -> v2 migration against one TypeScript GitHub repository.

Disclosed pre-built assets live under prebuilt/ (deployable skeleton, deterministic patcher/scanner/diff, Supabase schema, adapter interfaces, demo repo, specs). Tag nighthack-start at kickoff and build the live integrations on top of them. Do not rebuild what is already in prebuilt/. See DISCLOSURE.md.

READ FIRST
- 00_READ_ME_FIRST.md
- DISCLOSURE.md and PREBUILD_MANIFEST.md
- 02_NIGHTHACK_EXECUTION_PLAN.md
- 03_MVP_PRD.md
- 04_TECHNICAL_ARCHITECTURE.md
- 05_DATA_MODEL_AND_API_CONTRACTS.md
- 06_DEMO_FIXTURE_SPEC.md
- 11_QA_TEST_PLAN.md
- 17_FINAL_SUBMISSION_CHECKLIST.md
- prebuilt/bridge-app/IMPLEMENTATION_PLAN.md

NON-NEGOTIABLES
1. Build one vertical slice only.
2. Keep main deployable.
3. Use deterministic migration logic for the AtlasPay field rename.
4. Do not put the LLM on the critical path.
5. Never expose GitHub or Supabase secret credentials to the client.
6. Never claim a GitHub action succeeded without verifying the external result.
7. Open draft PRs only. Never merge.
8. Persist all critical state; presence may be ephemeral.
9. Every stage must be idempotent and create an audit event.
10. Stop adding features at integration freeze.
11. Use a backend-only fine-grained GitHub PAT (not a GitHub App). Poll check-runs for the exact commit SHA; do not build a webhook.
12. Do not rebuild anything under prebuilt/. Extend it, and disclose per DISCLOSURE.md.

FIRST ACTIONS
1. Inspect prebuilt/ and the available environment; tag nighthack-start.
2. Follow prebuilt/bridge-app/IMPLEMENTATION_PLAN.md (P0 mapped to the 4h45m schedule).
3. Deploy the pre-built skeleton to production immediately.
4. Apply the existing supabase/migrations/0001_init.sql to the Supabase project.
5. Make the room read one seeded run from the database, then replace stages with real integrations in P0 order.

IMPLEMENTATION ORDER
A. Production deployment and room route.
B. Persisted run and timeline.
C. AtlasPay spec diff normalization.
D. GitHub repository file fetch and exact impact scan.
E. Deterministic patch preview.
F. Branch, commit, and draft PR.
G. GitHub Actions status for exact commit SHA.
H. Supabase presence, comments, and approval.
I. Error states, reset flow, and demo polish.

INTERFACES
Create explicit adapters for:
- ChangeDetector
- RepositoryClient
- ImpactScanner
- PatchEngine
- ValidationClient
- RealtimePublisher

Keep AtlasPay-specific rules inside a migration recipe module, not UI components.

QUALITY GATES
- Typecheck and tests after each meaningful change.
- Confirm production deployment after each integration milestone.
- Add a false-positive test for strings containing payment_method.
- Assert that committed diff matches patch preview.
- Validate GitHub check/workflow SHA before success.
- Run the complete demo twice from reset.

REPORT AFTER EACH PHASE
- files changed,
- behavior now working,
- tests run,
- production URL status,
- known risk,
- next P0 task.

DO NOT
- generalize to arbitrary APIs,
- build billing or enterprise onboarding,
- create a generic agent chat,
- add multiple dashboards,
- refactor working code during the final hour,
- hide failures with fake success states.

Begin by creating the implementation plan and the smallest deployed room with seeded data. Then execute the P0 path in order.
```
