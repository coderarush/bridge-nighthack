# atlas-store-demo

Sample customer TypeScript store used in the **Bridge** NightHack demo. It integrates
with the fictional **AtlasPay** payments API.

AtlasPay v2 introduced a breaking change to `POST /payments`: the request field
`payment_method` was removed and replaced by the required `payment_method_id`.

Three call sites still use the old field:

- `src/checkout/create-payment.ts`
- `src/subscriptions/renew.ts`
- `src/refunds/retry-charge.ts`

`src/util/logging.ts` references the string `payment_method` in ways that must **not**
be changed — it is the false-positive guard.

## Scripts

    npm install
    npm run typecheck   # fails on the pre-migration branch, passes after Bridge's patch
    npm test            # AtlasPay v2 contract test

CI (`.github/workflows/ci.yml`) runs typecheck + test on every push and PR.
