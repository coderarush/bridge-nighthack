# Demo Fixture Specification

## Why a controlled fixture

A sub-five-hour hackathon should not depend on an unpredictable real provider release. Use a realistic fictional provider contract so the migration engine, customer code, and CI behavior are completely controlled while still representing the real problem.

## Provider: AtlasPay

### v1 request

```json
{
  "amount": 2500,
  "currency": "usd",
  "payment_method": "pm_demo_123"
}
```

### v2 request

```json
{
  "amount": 2500,
  "currency": "usd",
  "payment_method_id": "pm_demo_123"
}
```

### Breaking change

For `POST /payments`:

- Remove request property `payment_method`.
- Add required request property `payment_method_id`.
- Keep data type as string.
- Migration recipe: rename the object key.

## Hosted provider assets

- `fixtures/atlaspay-v1.openapi.yaml`
- `fixtures/atlaspay-v2.openapi.yaml`
- `fixtures/atlaspay-v2-migration.md`

Host these on a public production URL or in the demo GitHub repository. The UI should show both source links.

## Customer repository

Repository name: `atlas-store-demo`

Suggested structure:

```text
src/
  atlaspay/client.ts
  checkout/create-payment.ts
  subscriptions/renew.ts
  refunds/retry-charge.ts
tests/
  atlaspay-contract.test.ts
.github/workflows/ci.yml
package.json
README.md
```

Expected impacted files:

1. `src/checkout/create-payment.ts`
2. `src/subscriptions/renew.ts`
3. `src/refunds/retry-charge.ts`

Do not place the deprecated field elsewhere unless it is intentionally used to test false-positive protection.

## False-positive guard fixtures

Add these non-target strings:

```ts
const documentation = "AtlasPay previously called this payment_method";
const payment_method_label = "Card";
logger.info({ event: "payment_method_selected" });
```

The patch must not alter them.

## Validation design

Create a tiny TypeScript contract package or local type definition representing AtlasPay v2. The customer repository compiles against v2 types. Before patching, TypeScript reports that `payment_method` is invalid and `payment_method_id` is required. After patching, `npm test` or `npm run check` succeeds.

Recommended CI steps:

```yaml
- npm ci
- npm run typecheck
- npm test
```

Keep the suite under 20 seconds when a runner starts.

## PR body template

```markdown
## Bridge migration: AtlasPay v1 -> v2

AtlasPay changed the `POST /payments` request contract:

- removed `payment_method`
- added required `payment_method_id`

### Impacted files
- src/checkout/create-payment.ts
- src/subscriptions/renew.ts
- src/refunds/retry-charge.ts

### Patch
Renamed the AtlasPay request property in three verified call sites. No unrelated strings or identifiers were changed.

### Validation
- Typecheck: passed
- Tests: passed
- Commit: `<sha>`

### Review
Migration room: `<bridge-room-url>`

This is a draft PR and requires human review before merge.
```

## Reset strategy

Maintain a pristine `demo-base` branch. The reset script or manual run should:

1. close or ignore the previous demo PR,
2. delete the previous `bridge/...` branch when safe,
3. create a new run ID,
4. point the next migration at `demo-base`,
5. clear prior comments/approvals for the new room.

Never discover reset behavior for the first time in front of judges.
