# Bridge — Live Build Plan (NightHack, 7:00 PM → 11:45 PM)

**Tag `nighthack-start` at 7:00 PM before the first commit.** Everything under
`prebuilt/` is disclosed pre-existing infrastructure (see `../DISCLOSURE.md`).
The judged work is wiring the migration engine live.

## Already pre-built (disclosed, not judged)
- Deployable Next.js skeleton (this app): landing + change + room shell rendering seed data, `/api/health`.
- Deterministic patcher (`lib/patcher`) + tests — **9 passing**.
- Impact scanner (`lib/scanner`) sharing the patcher's matcher.
- Controlled OpenAPI diff (`lib/openapi`).
- Supabase schema (`supabase/migrations/0001_init.sql`).
- Adapter interfaces (`lib/adapters/interfaces.ts`) — the seams.
- Customer repo `atlas-store-demo` with CI (typecheck fails pre-patch, passes post-patch).
- AtlasPay v1/v2 specs (`public/fixtures`).

## P0 — required for the live demo (build in this order)
1. **Deploy** this skeleton to Vercel; set env; confirm `/api/health` and `/room/demo` on the public URL. *(gate: public URL loads for the team)*
2. **Supabase**: run migration; seed one provider_change + repository. Room reads from DB instead of `seedRoom`. *(gate: seeded run survives refresh)*
3. **ChangeDetector wired** to `/api/runs/start`: create a real run row from the AtlasPay diff. *(gate: "Create migration" makes a real run)*
4. **RepositoryClient** (`@octokit/rest` + PAT): fetch the 4 target files, run the scanner, persist 3 impacts. *(gate: room shows the correct 3 files)*
5. **Patch + PR**: run the patch engine, create `bridge/atlaspay-v2-<id>`, commit the 3 files, open a **draft** PR with the body template. *(gate: real PR, correct diff)*
6. **ValidationClient**: poll check-runs for the exact commit SHA; store url + conclusion; only then transition to `ready_for_review`. *(gate: real green check tied to the SHA)*

## P1 — only if P0 is green
7. Supabase Realtime presence + broadcast; comments + one approval persisted. *(gate: two browsers update without refresh)*
8. Loading/empty/error states; "why this changed" copy.

## P2 — postponed
Multiple providers, AST generalization, auth polish, billing, onboarding.

## Freeze at 10:45 PM
Stop features. Run the reset-and-demo flow twice. Capture backup PR + CI + screen recording. Doors lock 11:00; build ends 11:45.
