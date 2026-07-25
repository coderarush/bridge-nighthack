# Landing page prompt (paste into Claude / Claude design / v0)

Design and build a single-page marketing landing page for a developer-infrastructure
product called **Bridge**. Output one self-contained, responsive HTML file with inline
CSS (no external libraries, no build step). Dark, technical, editorial — think Vercel /
Linear / Stripe docs, not a generic SaaS template.

## Product
Bridge is API migration infrastructure. When an external API ships a breaking change,
Bridge detects it, finds the exact customer code that will break, generates a
**deterministic** (non-AI) patch, opens a real **draft** pull request, and proves it
with a real CI check tied to the exact commit — while the provider and customer
collaborate in a shared live migration room. Positioning: "Dependabot for APIs, with
the migration actually done."

## Visual system (match the product UI)
- Background: near-black navy (#0a0c10), panels slightly lighter (#12151c), thin
  blue-gray borders (#232936).
- Type: white / cool-gray (#e7ecf3 primary, #93a0b4 muted). Large editorial headlines,
  restrained body width (~640px). Use a monospace font for code/field names.
- Accent: electric blue (#5b8cff) for primary buttons/links. Green (#3fb950) for
  "passed/ready" states, red (#f85149) for "breaking".
- Rounded corners (~12px), generous spacing, subtle borders instead of heavy shadows.
- Absolutely no purple, no stock illustrations, no floating "AI orb", no fake customer
  logos, no fabricated usage metrics.

## Sections (use this copy)
1. **Nav** — left: "Bridge" wordmark with a small square logo mark. Right: Product,
   How it works, Security, GitHub, and a primary button "Run a migration". Links scroll
   to sections.
2. **Hero**
   - Eyebrow: `API migration control plane`
   - Headline: **Turn breaking API changes into tested pull requests.**
   - Sub: *Bridge detects external API changes, maps them to the exact code that will
     break, generates a bounded migration, validates it in CI, and opens a draft PR your
     team can review together.*
   - Buttons: primary "See the live migration", secondary "View the GitHub PR".
3. **Hero product mockup** — render a stylized mock of the migration room in pure
   HTML/CSS (a browser-style window): a red "AtlasPay v1 → v2 · breaking" header, a list
   of 3 impacted files with monospace snippets (`payment_method: pm` → `payment_method_id: pm`),
   a small activity timeline going Detected → Scanned → Patched → PR opened → CI passed
   (last one green), a "Draft PR #1" card, and two small circular participant avatars.
4. **Proof strip** — four compact items: Detect contract changes · Find impacted code ·
   Generate bounded patches · Prove them in CI.
5. **Problem** — heading: *Changelogs announce problems. They don't finish migrations.*
   Body: *A provider change can touch dozens of repos, owners, and release schedules.
   Today teams manually interpret the change, search code, coordinate fixes, and hope
   tests catch the residue. Bridge turns that into one auditable migration run.*
6. **How it works** — four steps: **Detect** (compare specs, normalize breaking ops),
   **Map** (scan repos, show exact files + call sites), **Migrate** (deterministic
   recipes first; AI only for bounded residue), **Validate** (draft PR, run CI, attach
   proof before review).
7. **Collaboration** — heading: *One room for the provider, platform team, and code
   owner.* Body: comments, approvals, evidence, and status live beside the migration —
   no reconstructing a change across changelogs, Slack, tickets, and PRs.
8. **Safety** — heading: *Automation without blind trust.* Bullets: Draft PRs by
   default · Least-privilege GitHub access · Exact impacted-file evidence · CI tied to
   the migration commit · Human approval before merge.
9. **Final CTA** — headline: *Your APIs will change. Your code should keep up.* Button:
   "Open the AtlasPay migration room".
10. **Footer** — Bridge wordmark, © 2026, small nav links.

## Page metadata
- Title: `Bridge — Turn API changes into tested pull requests`
- Description: `Bridge detects breaking API changes, finds impacted code, generates
  bounded migrations, validates them in CI, and opens draft pull requests.`

## Requirements
Fully responsive (mobile-friendly), semantic HTML, subtle hover states, and a faint
background grid that's fine to keep static. Keep the product mockup as the visual
centerpiece. One file, ready to open in a browser.
