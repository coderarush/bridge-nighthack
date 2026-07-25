# Landing Page Copy and Design Specification

## Objective

Make Bridge understandable in ten seconds and credible in thirty. The landing page is not the hackathon demo, but it creates confidence when judges or investors open the public URL after the event.

## Navigation

Left: Bridge logo.  
Right: `Product`, `How it works`, `Security`, `GitHub`, and primary CTA `Run a migration`.

For NightHack, nonfunctional navigation can scroll to sections. Do not build a complex marketing CMS.

## Hero

**Eyebrow:** API migration control plane

**Headline:**

> Turn breaking API changes into tested pull requests.

**Supporting copy:**

> Bridge detects external API changes, maps them to the exact code that will break, generates a bounded migration, validates it in CI, and opens a draft PR your team can review together.

**Primary CTA:** `See the live migration`  
**Secondary CTA:** `View the GitHub PR`

## Hero visual

A wide product window showing the migration room:

- AtlasPay v1 -> v2 change.
- Three impacted files.
- timeline progressing from detected to CI passed.
- real draft PR card.
- two participant avatars.

Use a subtle background grid that brightens near the cursor only if it is fast to implement. The product UI should remain the focus.

## Proof strip

Four concise stages:

- Detect contract changes.
- Find impacted code.
- Generate bounded patches.
- Prove them in CI.

## Problem section

**Heading:** Changelogs announce problems. They do not finish migrations.

Copy:

> A provider change can touch dozens of repositories, owners, and release schedules. Today, teams manually interpret the change, search code, coordinate fixes, and hope tests catch the residue. Bridge turns that fragmented process into one auditable migration run.

## How it works

### 1. Detect
Bridge compares official specs and change sources, then normalizes breaking operations.

### 2. Map
Bridge scans installed repositories and shows the exact files and call sites affected.

### 3. Migrate
Bridge applies deterministic recipes first and uses AI only for bounded residue.

### 4. Validate
Bridge opens a draft PR, runs CI, and attaches proof before asking for review.

## Collaboration section

**Heading:** One room for the provider, platform team, and code owner.

Copy:

> Comments, approvals, evidence, and status live beside the migration itself. No more reconstructing a breaking change across changelogs, Slack threads, tickets, and pull requests.

## Safety section

**Heading:** Automation without blind trust.

Points:

- Draft PRs by default.
- Least-privilege GitHub access.
- Exact impacted-file evidence.
- CI tied to the migration commit.
- Human approval before merge.

## Final CTA

**Headline:** Your APIs will change. Your code should keep up.

**CTA:** `Open the AtlasPay migration room`

## Visual specification

- Near-black navy background.
- White and cool-gray type.
- Electric-blue primary accent.
- Thin blue-gray borders.
- Large editorial headline, restrained copy width.
- Product screenshot dominates the hero.
- No stock illustrations.
- No floating AI orb.
- No purple.
- No fake customer logos or fake usage metrics.

## Metadata

Title: `Bridge - Turn API changes into tested pull requests`  
Description: `Bridge detects breaking API changes, finds impacted code, generates bounded migrations, validates them in CI, and opens draft pull requests.`
