# AtlasPay v1 -> v2 migration

## POST /payments

**Breaking:** the request field `payment_method` has been **removed** and replaced
by the required field `payment_method_id`. The value semantics are unchanged (a
payment-method token string); only the key name changed.

| v1                       | v2                          |
| ------------------------ | --------------------------- |
| `payment_method: string` | `payment_method_id: string` |

### Before
```json
{ "amount": 2500, "currency": "usd", "payment_method": "pm_demo_123" }
```

### After
```json
{ "amount": 2500, "currency": "usd", "payment_method_id": "pm_demo_123" }
```

### Recommended migration
Rename the request object key `payment_method` to `payment_method_id` at every
call site that builds a `POST /payments` body. Do not change string values,
comments, documentation, or unrelated identifiers.
