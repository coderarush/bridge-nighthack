# Product and Demo Brief

## Product definition

Bridge is **migration orchestration infrastructure for external API changes**. It converts a provider-side breaking change into repo-specific, tested migration work for the customer.

The core loop is:

**Detect -> Map impact -> Plan -> Patch -> Validate -> Coordinate -> Review**

## Problem

External APIs change faster than engineering teams can reliably monitor, interpret, map into their own code, patch, test, and coordinate. Existing tools solve fragments: changelogs announce changes, API diff tools compare schemas, coding agents modify repositories, and CI validates commits. Nobody owns the entire migration event.

## Target users

### Primary NightHack user
A platform or application engineer maintaining a production TypeScript integration in GitHub.

### Long-term buyers
- Engineering teams with several business-critical third-party APIs.
- Platform engineering and developer productivity teams.
- API providers that want customers to migrate faster and create fewer support tickets.
- Systems integrators managing many customer integrations.

## Sharp positioning

> Bridge turns external API changes into tested pull requests.

Alternative one-liners:

- **Dependabot for APIs, with migration execution.**
- **The control plane for API migrations.**
- **From breaking change to reviewed PR.**

## What Bridge is not

- Not a general AI coding agent.
- Not an API client or API testing suite.
- Not an SDK generator.
- Not a documentation portal.
- Not a dependency bot for package versions.
- Not a Slack replacement.
- Not autonomous code merging.

## NightHack proof

The demo must prove four claims:

1. **Detection:** Bridge understands a controlled machine-readable provider contract change.
2. **Relevance:** Bridge maps that change to exact customer code paths.
3. **Execution:** Bridge makes a safe patch and validates it with real CI.
4. **Coordination:** Bridge gives provider and customer a shared, auditable room for the migration.

## Controlled demo story

Use a fictional provider called **AtlasPay** so the team controls every artifact and failure mode. AtlasPay v2 removes `payment_method` and requires `payment_method_id` in `POST /payments`. A customer TypeScript repository still uses the old field in three places.

Bridge shows the OpenAPI diff, finds the three call sites, creates a migration plan, performs a deterministic key rename, triggers GitHub Actions, opens a draft PR, and updates the room to `ready_for_review` after CI passes.

## Winning visual moment

The strongest moment is not the spec diff. It is the transition from a red migration run to a green draft PR while a second browser participant is visibly present and approves the proposed migration. That compresses detection, execution, proof, and multiplayer collaboration into one screen.

## Success criteria

- The entire story works from a deployed URL.
- The pull request is real and links back to the migration room.
- CI evidence is real, not a fabricated green badge.
- The patch is small enough to inspect in seconds.
- A judge understands the category without a slide.
- The demo completes in under six minutes.
