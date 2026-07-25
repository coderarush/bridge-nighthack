# bridge-app

Deployable Next.js skeleton for **Bridge** (NightHack). Renders the landing page,
the AtlasPay change intake, and the migration room from seed data with **no backend
required**, so it deploys immediately. Every place the live integration plugs in is
marked `LIVE-BUILD:`.

## Run
    npm install
    npm run dev            # http://localhost:3000  (deploy target: Vercel, no localhost for judging)
    npm run build          # production build
    npm test               # patcher unit tests (9)
    npm run patch:preview  # preview the deterministic patch vs ../atlas-store-demo

## Pre-built vs live
See `IMPLEMENTATION_PLAN.md` and `../DISCLOSURE.md`. The deterministic scan/patch/diff
are done; the GitHub, validation, and realtime adapters are the judged live work.

## Key files
- `lib/patcher/atlaspay-rename.ts` — deterministic key rename (no LLM).
- `lib/scanner/impact-scanner.ts` — impact discovery (shares the patcher matcher).
- `lib/openapi/atlaspay-diff.ts` — controlled v1→v2 diff.
- `lib/adapters/interfaces.ts` — the seams to implement live.
- `supabase/migrations/0001_init.sql` — schema.
