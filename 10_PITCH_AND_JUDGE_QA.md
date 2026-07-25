# Pitch and Judge Q&A

> Current judge-facing answers must stay within the evidence in `SUBMISSION.md`,
> `DISCLOSURE.md`, and `18_PRODUCTION_ARCHITECTURE_AND_JUDGE_QA.md`.

## 20-second pitch

> Bridge turns breaking external API changes into tested draft pull requests. It detects the provider change, finds the exact customer code that will break, generates a bounded migration, validates the commit in CI, and gives the provider and customer one shared room to review it.

## 60-second pitch

> APIs are now core infrastructure, but migrations are still coordinated through changelogs, search, tickets, Slack threads, and manual pull requests. Bridge is the missing migration control plane. When an API provider changes a contract, Bridge maps that change into each installed customer repository, shows the exact impacted call sites, applies deterministic migration recipes first, validates the exact commit, and opens a draft PR with a collaborative migration room. We start with GitHub and TypeScript integrations where the change can be bounded and proven. Over time, Bridge becomes the system providers use to safely move their entire customer ecosystem forward.

## Why now

- API surface area and external integration dependence continue to expand.
- Providers increasingly publish machine-readable contracts.
- GitHub provides a standard distribution and pull-request workflow.
- Modern code models make long-tail migration assistance possible, but trust requires deterministic rules, CI, and human review.

## Differentiation

### Versus Dependabot/Renovate
They update package versions. Bridge understands provider contract changes and maps them to integration-specific code migrations.

### Versus API diff tools
They identify contract differences. Bridge carries the difference through customer impact, patching, CI, PR creation, and coordination.

### Versus AI coding agents
They can modify code after a person gives them a task. Bridge detects the task from the provider change, scopes it, proves affected sites, and manages the migration lifecycle.

### Versus SDK generators
They regenerate clients. Bridge handles application code and workflows around a provider integration.

## Defensibility

The long-term moat is not the first codemod. It is the migration graph:

- provider changes,
- customer code patterns,
- verified impacts,
- successful recipes,
- validation outcomes,
- time-to-migrate,
- failure and rollback evidence.

This dataset can improve confidence, provider-specific recipes, prioritization, and enterprise policy. Distribution through provider ecosystems and GitHub installations creates additional defensibility.

## Business model

- Starter: org/repo subscription.
- Growth: higher repo limits, policy controls, private runners, and audit features.
- Enterprise/provider: annual contract for ecosystem migration visibility and customer coordination.
- Usage add-ons: isolated validation compute or high migration volume.

Avoid token-based pricing as the primary model; buyers pay for protected integrations and avoided migration work.

## Judge questions

### “What is AtlasPay?”

AtlasPay is a fictional provider fixture created for a controlled proof. Its v2
OpenAPI contract removes `payment_method` and requires `payment_method_id` for
`POST /payments`. AtlasStore is the public customer fixture with three intended
call sites and three deliberate look-alikes. Neither is an outside customer or
provider.

### “Is this just a code agent with a trigger?”

No. A code agent starts after a human frames a task. Bridge owns the upstream and downstream system: provider change detection, repo-specific impact mapping, migration policy, deterministic recipes, validation tied to the exact commit, PR evidence, and cross-company coordination.

### “Why would API providers pay?”

Faster customer migrations reduce support load, version fragmentation, and delayed deprecation. The initial wedge can sell to customer engineering teams, then use migration evidence to pull providers into an ecosystem console.

### “How do you prevent broken AI patches?”

AI is not trusted by default. Bridge uses deterministic transformations where possible, limits changes to verified impacts, opens draft PRs, validates the exact commit, and requires human review before merge.

### “Why the multiplayer room?”

API migrations cross organizational boundaries. The provider understands the contract; the customer understands the application. Today evidence and decisions fragment across channels. The room makes the migration itself the shared source of truth.

### “Can this support arbitrary APIs?”

Not initially. The credible wedge is one provider ecosystem, GitHub, and one language family. Generalization comes after enough successful, verified migrations.

### “What stops GitHub or an AI coding company from building it?”

They can build pieces. Bridge’s advantage must come from provider distribution, deep migration workflows, provider-specific recipe data, cross-repository impact visibility, and a reputation for safe execution. A generic agent platform has less incentive to own provider/customer coordination.

### “What is the biggest risk?”

Low-confidence patches. The company fails if it broadens faster than it can prove correctness. The product must earn trust in narrow ecosystems before expanding.

### “What would you build next?”

Complete and verify the registered GitHub App's external consent/callback,
repository registration, lifecycle reconciliation, and installation-token
execution; wire the fenced durable-job coordinator to a deployed worker; retrofit
the demo run graph into workspace ownership; then validate one recipe with a real
provider design partner. The pre-install handshake and workspace creation path are
live, but those remaining operations are not claimed complete.
