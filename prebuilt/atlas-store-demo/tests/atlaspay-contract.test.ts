import { test } from "node:test";
import assert from "node:assert/strict";
import { atlaspay } from "../src/atlaspay/client.js";

// Contract test: the customer integration must call POST /payments with the
// AtlasPay v2 field `payment_method_id`. Before Bridge's migration this file's
// call sites use the removed `payment_method` field and `npm run typecheck`
// fails; after the migration the whole project typechecks and this test passes.
test("create payment uses the v2 payment_method_id field", async () => {
  const payment = await atlaspay.payments.create({
    amount: 2500,
    currency: "usd",
    payment_method_id: "pm_demo_123",
  });
  assert.equal(payment.status, "succeeded");
  assert.equal(payment.amount, 2500);
});
