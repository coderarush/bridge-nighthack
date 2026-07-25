# Demo Script and Runbook

## Two versions — know which you are giving

- **90-second stage version** (Top 10, 12:45 AM): this is what wins or loses. Rehearse it most.
- **At-table version** (initial judging, 12:15 AM): four to six minutes, more detail and Q&A.

No slides. No localhost. The product is the presentation.

## 90-second stage script (the one that matters)

Have these open before you walk up, all on the deployed URL:
Room in browser A (mid-run or resettable), the real GitHub PR tab, and browser B
(incognito) already in the same room. Zoom 125%.

> **0:00–0:15 — Category.** "Every time an external API ships a breaking change,
> engineers have to find the affected code, patch it, test it, and coordinate. Bridge
> turns that whole event into a tested draft pull request. Here's AtlasPay removing a
> payment field." *(Show the breaking-change intake.)*

> **0:15–0:40 — Detect + map.** *(Click Create migration; room opens.)* "Bridge read
> the contract, marked it breaking, and — without asking an AI to rewrite anything —
> found the exact three call sites and ignored the look-alike strings." *(Point at the
> 3 impacted files.)*

> **0:40–1:05 — Execute + prove.** "It applied a deterministic rename, opened a real
> draft PR, and tied validation to the exact commit." *(Open the PR tab: three-line
> diff. Back to room: green check on the SHA.)*

> **1:05–1:30 — Multiplayer close.** *(Browser B visible.)* "The provider and customer
> are in the same room. The provider approves…" *(Approve in B; A updates live.)*
> "…and the run goes green. Changelogs announce changes. Agents can edit code. Bridge
> owns the system between them — Dependabot for APIs, with the migration actually done."

End on the green **Ready for review** state. If any live step is at risk, open the
backup PR/CI tab and say the honest line (see Failure recoveries) — never wait silently.

## At-table version (four to six minutes)

## Presenter setup

Open these tabs before the demo:

1. Bridge change intake.
2. Bridge migration room in browser A.
3. Same room in browser B or incognito for presence.
4. GitHub demo repository.
5. Backup completed PR and CI run.
6. Deployment logs hidden but available to the engineer.

Use 110-125% browser zoom and close unrelated tabs.

## Exact demo narrative

### 0:00-0:35 - Problem and category

> Every time an external API changes, engineering teams have to read the changelog, find the affected code, write the migration, test it, and coordinate the rollout. Bridge turns that entire event into a tested draft pull request.

Show the AtlasPay v1 -> v2 change intake.

### 0:35-1:10 - Detect the breaking change

> AtlasPay removed `payment_method` and now requires `payment_method_id` on payment creation. Bridge reads the provider contract, marks this as breaking, and creates a migration against the customer repository.

Click `Create migration`.

### 1:10-2:00 - Map customer impact

Open the room as the timeline advances.

> Bridge does not blindly ask an agent to rewrite the repo. It maps the provider change to verified call sites first. Here it found exactly three TypeScript files and ignored unrelated strings with similar names.

Open one impacted snippet.

### 2:00-2:50 - Plan and collaboration

Bring browser B into view so presence is visible.

> The provider and customer work in the same migration room. The plan is explicit: rename the AtlasPay request property in these three call sites, change nothing else, then validate the exact commit.

Post the provider comment in browser B and approve the plan.

### 2:50-3:50 - Execute and open the PR

> Bridge creates a migration branch, applies the bounded patch, and opens a draft pull request. It never merges automatically.

Reveal the PR card and click into the real GitHub diff. Scroll only enough to show the three intended changes.

### 3:50-4:40 - Verify

> A patch is not complete because an AI says it is. Bridge ties validation to the migration commit and waits for GitHub Actions.

Return to the room. Show the check URL, commit SHA, and passing status.

### 4:40-5:15 - Close

> Changelogs tell you an API changed. Coding agents can edit code. Bridge owns the missing system between them: detecting the change, proving where it matters, executing the migration, validating it, and coordinating review. It is Dependabot for APIs, with the migration actually done.

End on the green `Ready for review` state.

## Live-demo controls

- One teammate presents and clicks.
- One teammate controls browser B and provider comment.
- One teammate watches logs and CI status.
- Do not switch drivers mid-demo.

## Reset procedure

1. Create a new run from `demo-base`.
2. Confirm no active branch uses the new run ID.
3. Confirm both browser identities join the room.
4. Keep the completed backup run open.
5. Run the exact demo once after reset.

## Failure recoveries

### Actions queue is slow

Say:

> The workflow is running against this exact commit. To keep the demo moving, here is the completed run from our previous migration using the same deployed path.

Open the backup completed run. Do not pretend the queued run passed.

### GitHub write fails

Show the generated patch preview and completed backup PR, then state that the live GitHub request failed. This is weaker but honest.

### Realtime fails

Use two windows with the persisted comments already visible after refresh. Continue the core migration story.

### Spec diff fails

Use the normalized change record already stored in the app and explain that the official source links are attached.

## Demo anti-patterns

- Do not explain database tables.
- Do not show code unless asked.
- Do not wait silently for CI.
- Do not claim support for every language.
- Do not say the AI is autonomous.
- Do not introduce unrelated future features before the core story lands.
