# Prebuild Manifest

Everything under `prebuilt/` is disclosed pre-existing work (see `DISCLOSURE.md`).
Verified in a clean Node 22 sandbox on 2026-07-23.

## prebuilt/atlas-store-demo/  (the customer repo that receives the PR)

```
src/atlaspay/types.ts          AtlasPay v2 SDK types (payment_method_id required)
src/atlaspay/client.ts         minimal client stand-in
src/checkout/create-payment.ts IMPACTED #1  (payment_method on line 8)
src/subscriptions/renew.ts     IMPACTED #2  (payment_method on line 8)
src/refunds/retry-charge.ts    IMPACTED #3  (payment_method on line 9)
src/util/logging.ts            FALSE-POSITIVE guards (must never change)
tests/atlaspay-contract.test.ts
.github/workflows/ci.yml       npm ci → typecheck → test
package.json, tsconfig.json, package-lock.json, README.md
```

Verified behavior:
- `npm run typecheck` **FAILS** pre-patch with 3 errors (the 3 impacted files).
- `npm test` **passes**.
- After the deterministic patch, `npm run typecheck` **passes** and tests pass.

## prebuilt/bridge-app/  (the deployable Next.js skeleton)

```
app/page.tsx                       landing / pitch
app/change/[changeId]/page.tsx     change intake
app/room/[runId]/page.tsx          migration room (renders seed data)
app/api/health/route.ts            health check
components/*                        Timeline, ImpactedFiles, EvidencePanel, RoomSidebar
lib/patcher/atlaspay-rename.ts      deterministic rename (+ __tests__, 9 passing)
lib/scanner/impact-scanner.ts       impact discovery (shares the patcher matcher)
lib/openapi/atlaspay-diff.ts        controlled v1→v2 diff
lib/adapters/interfaces.ts          the live-build seams
lib/adapters/deterministic.ts       wires the pre-built deterministic impls
lib/state-machine/transitions.ts    run state guards
lib/db/supabase.ts                  browser + service clients
lib/types.ts, lib/seed/room.ts      domain types + seed aggregate
supabase/migrations/0001_init.sql   full schema
public/fixtures/*                   atlaspay-v1/v2 specs + migration note
scripts/preview-patch.ts            dev tool: preview the patch locally
IMPLEMENTATION_PLAN.md, README.md, .env.example
```

Verified behavior:
- `npx next build` **compiles** all routes.
- `npm test` → **9/9** patcher tests pass (incl. all false-positive guards).
- `npm run patch:preview` → **3 edits**, `logging.ts` correctly ignored.
- OpenAPI diff → `severity: breaking`, removed `payment_method`, added `payment_method_id`.

## Search-and-replace before Friday

Replace `your-org` with the real GitHub org/owner in:
`bridge-app/lib/seed/room.ts` and `.env.example` (`GITHUB_DEMO_OWNER`).

## To run locally

```
cd prebuilt/bridge-app     && npm install && npm run build && npm test
cd prebuilt/atlas-store-demo && npm install && npm run typecheck   # fails pre-patch (expected)
```
