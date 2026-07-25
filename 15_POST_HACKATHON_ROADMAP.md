# Post-Hackathon Roadmap

## First 72 hours: turn the demo into a verified artifact

1. Preserve source commit `3407bf9` as the provenance for the verified run evidence and application commit `d67ce94` as the later release boundary.
2. Never reset the preserved run. Exercise onboarding changes only with separate workspaces and disposable runs.
3. Record the unlisted 2-3 minute walkthrough from the deployed product. Keep the live evidence URLs in the description or submission packet, never credentials.
4. Audit the public deployment: no seed/fake-success fallback, no browser-visible server secret, explicit unauthorized/error states, and a clean two-browser participant setup.
5. Publish a short technical walkthrough that names the controlled fixture and the deterministic boundary. Do not market the demo as broad autonomous remediation.

## First 30 days: determine whether the wedge is real

Focus on one provider-language pair, beginning with TypeScript APIs where request-shape changes are frequent and mechanically verifiable.

- Complete the registered `bridge-api-control-plane` GitHub App rollout: finish external consent/callback and repository registration end to end, reconcile lifecycle webhooks, then retire the demo PAT for workspace execution. Do not remove the credential required by the preserved demo before its evidence is archived.
- Expand the completed production migration and live owner probe into the full owner/member/non-member/anonymous/service authorization matrix, then add rollback rehearsal and query-plan checks.
- Wire webhook and run entrypoints to the fenced durable-job coordinator, deploy a worker, and add lease, retry, terminal-failure, and queue-depth operations/metrics. Tested job code without runtime wiring is not production durability.
- Generalize the now-wired bounded GitHub tree discovery beyond the controlled recipe: workspace-owned include/exclude policies, concurrency limits, monorepo roots, and byte sampling before accepting custom patterns.
- Turn the AtlasPay recipe into a versioned deterministic migration recipe with fixture tests, diff assertions, and explicit unsupported-case exits.
- Add proper repository selection and least-privilege policy controls before monitoring more repositories.
- Validate with three design partners who have recently completed an API migration. Collect the raw before/after diff, manual edits, reviewer feedback, and time spent.
- Measure impact precision/recall, patch acceptance, CI pass rate, manual-edit rate, time from provider change to draft PR, and time from PR to merge.

The success bar is not signups. It is at least one real, human-reviewed migration PR that a customer is willing to merge, with the evidence showing Bridge reduced work without widening risk.

## Days 31-90: earn broader scope

- Add migration packs only after a recipe has evidence from real usage.
- Support multi-step changes and a review queue across repositories only after exact-SHA validation and policy controls are dependable.
- Add model-assisted residue behind a strict confidence threshold and a no-write fallback. The deterministic path remains the default for known transformations.
- Offer private or customer-controlled execution before asking teams to authorize access to more source code.
- Pilot a provider-facing console only after customer-side migration evidence is strong; otherwise it is premature surface area.

## Explicit non-roadmap

Do not spend the next month building billing, generic agent chat, arbitrary-language patching, autonomous merges, provider broadcast campaigns, or a broad collaboration suite. Those features hide the core question: can Bridge create a narrowly correct, reviewable migration from a real contract change?
