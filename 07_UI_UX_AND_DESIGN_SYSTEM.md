# UI/UX and Design System

## Product character

Bridge should feel like a precise developer control plane, not a generic AI dashboard. Use calm dark surfaces, crisp type, restrained electric-blue accents, and evidence-first hierarchy. Avoid purple gradients, glowing robot imagery, excessive terminal chrome, and fake metrics.

## Brand direction

- **Name:** Bridge.
- **Descriptor:** API migration control plane.
- **Primary accent:** electric blue.
- **Supporting success:** green used only for verified passing states.
- **Warning:** amber.
- **Failure:** red.
- **Background:** near-black navy rather than pure black.
- **Typography:** geometric sans for headings; highly readable sans for UI; monospaced type only for code and IDs.

## Logo concept

A nonliteral mark made from two offset code brackets or vertical rails connected by a single stepped path. The path represents a contract change moving safely from provider to customer. It should also resemble a compact diff or migration graph at favicon size. Do not use a literal suspension bridge.

## Main screen: migration room

### Header

- Bridge wordmark.
- Provider/version pill: `AtlasPay v1 -> v2`.
- Repository: `acme/atlas-store-demo`.
- Status pill.
- Participant avatar stack.

### Left rail: timeline

A vertical stage sequence:

1. Change detected.
2. Repository scanned.
3. Three impacts found.
4. Migration plan approved.
5. Patch committed.
6. CI passed.
7. Ready for review.

Each item includes timestamp, actor, state, and optional evidence link.

### Center: impact and patch

Tabs:

- `Impact` - files and code snippets.
- `Plan` - exact deterministic steps.
- `Diff` - compact before/after.
- `Discussion` - comments.

The default tab during the demo should be `Impact` until the PR exists, then transition to `Diff`.

### Right rail: evidence

- Draft PR card.
- Commit SHA.
- GitHub Actions/check card.
- Approval card.
- Provider source links.

This panel answers: “How do I know this actually happened?”

## Change intake screen

Above the fold:

- Heading: `AtlasPay v2 contains 1 breaking request change.`
- Before/after field visualization.
- Target repository selector fixed to the demo repo.
- Primary button: `Create migration`.

Do not build broad onboarding. The demo should start close to value.

## Status language

Use verbs and evidence:

- `Analyzing provider contract`
- `Scanning 18 TypeScript files`
- `Found 3 verified call sites`
- `Created draft pull request #12`
- `GitHub Actions passed for 3f91c2a`

Avoid vague AI phrases like `Thinking...` or `Working magic...`.

## Component states

Every critical component needs:

- loading skeleton,
- active state,
- completed state,
- failed state with retry,
- evidence link when complete.

## Motion

Use motion to explain state transitions, not decorate the interface:

- timeline item activates,
- impact count increments after scan,
- PR card slides into evidence rail after external creation,
- status changes to green only after validation is verified.

Animations should complete in under 350 ms and never delay interaction.

## Responsive behavior

Desktop-first for the demo. At widths below 1100 px:

- collapse right evidence rail into a drawer,
- keep timeline and central content visible,
- preserve participant presence.

## Accessibility

- Minimum 4.5:1 text contrast.
- Do not communicate state by color alone.
- Keyboard-focus styles on all actions.
- Code snippets scroll horizontally rather than clipping.
- Status changes should be announced with an accessible live region.
