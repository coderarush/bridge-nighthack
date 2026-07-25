# Bridge — Friday Game Plan (step by step)

**What's different now:** the whole migration engine is pre-built and the app is
built + deploys. Supabase is live and seeded. So Friday is not "build the plumbing" —
it's *deploy, prove one real migration early, then spend the window making it
impressive* (realtime + polish + AI explanation). That's your judged in-window work.
Everything pre-built is disclosed in `DISCLOSURE.md`; tag `nighthack-start` at 7:00.

Two people: **A** drives GitHub/deploy + the live run; **B** builds the realtime room + polish.

---

# PHASE 0 — Before kickoff (mostly done — see `SETUP_STATUS.md`)

Left for you (~15 min): push the `atlas-store-demo` repo + make a GitHub token,
`npx vercel@latest --prod --yes`, paste the pre-filled env values in Vercel, redeploy.
Full details and exact values are in **`SETUP_STATUS.md`**.

**✅ Done when:** your Vercel URL loads, the seeded room renders from the database,
and a comment/approval persists across two windows.

---

# PHASE 1 — Build window (7:00 PM → 11:45 PM)

You'll mostly use **Claude Code** for the in-window work. Open
`16_CLAUDE_CODE_MASTER_PROMPT.md`, paste it into Claude Code at the root of the
bridge-app repo, and point it at `IMPLEMENTATION_PLAN.md` and `DISCLOSURE.md`.

## 7:00–7:25 — Tag, then prove ONE real migration end-to-end (A)
- `git tag nighthack-start && git push --tags`.
- Add `GITHUB_TOKEN` + `GITHUB_DEMO_OWNER` in Vercel if not already; redeploy.
- On the live URL: **Change → Create migration → Run migration → draft PR**. Watch
  the PR open on GitHub and the CI check go green; the room flips to Ready for review.

**✅ Gate (the big one):** a real draft PR + real green CI, tied to the exact commit,
visible on the deployed URL. Once this is green, you already have a winning demo — the
rest is upside.

## 7:25–9:15 — Flagship in-window build: live multiplayer room (B)
Replace the 5-second poll (marked `LIVE-BUILD:` in `components/RoomSidebar.tsx`) with
real **Supabase Realtime**.
> **Prompt:** "Using `@supabase/supabase-js` Realtime on channel
> `migration-run:<runId>`, add presence (avatars/roles for both participants) and
> broadcast comment/approval/status events so two browsers update instantly without a
> poll. Keep the DB the source of truth; refetch on a sequence gap."

**✅ Gate:** two browsers see each other's presence; a comment and the approval appear
instantly in both. **Doors lock 11:00 PM — don't leave.**

## 9:15–10:15 — AI explanation + UX polish (A+B)
- **"Why this changed" (Claude):** a server call that turns the diff + impacts into a
  plain-English summary. Keep it OFF the critical path (cache it; never block the run).
  On-brand — the prizes are Claude credits.
- Timeline animation as real stages complete; clear loading/empty/error states; make
  the GitHub links obvious; tighten the 90-second visual flow.

**✅ Gate:** a first-time viewer understands the product in 30 seconds.

## 10:15–10:50 — Second live run + backups (A)
- Reset (new run) and run the whole flow again live to confirm repeatability.
- Leave the real PR + green CI tab open as a backup; record a 60-second screen capture.

**✅ Gate:** two independent live runs succeeded; backup captured.

## 10:50–11:15 — Freeze
Stop building. Pin the last known-good Vercel deployment. Only fix confirmed demo blockers.

## 11:15–11:45 — Rehearse
Rehearse the **90-second stage script** (`09_DEMO_SCRIPT_AND_RUNBOOK.md`) at least 3×,
timed. Practice the honest recovery line if a live step lags.

**✅ Gate:** two clean rehearsals; you can recover from any single failure in <15 sec.

---

# AFTER 11:45 — Judging
- **11:45** submit (repo + live URL; mention the `nighthack-start` tag and `DISCLOSURE.md`).
- **12:15** at-table judging — 4–6 min version; offer to show the tag + in-window diff.
- **12:45** if Top 10 — the **90-second** stage version. Close: *"Dependabot for APIs,
  with the migration actually done."*

# If you fall behind (cut in this order)
AI explanation → animations → extra polish → realtime (fall back to the 5s poll that's
already there → or two refreshed windows).

**Never cut:** the public URL, the correct 3 impacted files, the real draft PR, the
real green CI on the exact SHA, coherent room state, reset.

# Absolute-minimum demo if the live path breaks
Change → 3 impacts (live) → `npm run patch:preview` shows the 3-edit patch → open the
pre-made real PR + green CI tab and say honestly "this is the completed run from the
same deployed workflow." Never fake a green check.

# The one sentence, memorized by both of you
**"Bridge turns breaking API changes into tested draft pull requests."**
