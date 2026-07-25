import { test } from "node:test";
import assert from "node:assert/strict";
import { patchSource, findMatches, NEW_KEY } from "../atlaspay-rename";

test("renames the key inside a guarded AtlasPay request object", () => {
  const src = `create({ amount: 2500, currency: "usd", payment_method: pm });`;
  const r = patchSource(src);
  assert.equal(r.changed, true);
  assert.equal(r.matches.length, 1);
  assert.match(r.patched, /payment_method_id: pm/);
  assert.ok(!/[^_]payment_method:/.test(r.patched));
});

test("does NOT touch a documentation string value", () => {
  const src = `const doc = "AtlasPay previously called this payment_method";`;
  const r = patchSource(src);
  assert.equal(r.changed, false);
  assert.equal(r.patched, src);
});

test("does NOT touch an unrelated identifier payment_method_label", () => {
  const src = `const payment_method_label = "Card";`;
  const r = patchSource(src);
  assert.equal(r.changed, false);
});

test("does NOT touch a string value in a log event", () => {
  const src = `logger.info({ event: "payment_method_selected" });`;
  const r = patchSource(src);
  assert.equal(r.changed, false);
});

test("guard: ignores payment_method key when there is no sibling amount", () => {
  const src = `const x = { payment_method: "pm_1", note: "no amount here" };`;
  const r = patchSource(src);
  assert.equal(r.changed, false, "no amount sibling => not an AtlasPay request object");
});

test("handles a string-literal key and preserves quotes", () => {
  const src = `const b = { amount: 1, currency: "usd", "payment_method": pm };`;
  const r = patchSource(src);
  assert.equal(r.changed, true);
  assert.match(r.patched, /"payment_method_id": pm/);
});

test("expands shorthand safely", () => {
  const src = `const b = { amount, currency, payment_method };`;
  const r = patchSource(src);
  assert.equal(r.changed, true);
  assert.match(r.patched, /payment_method_id: payment_method/);
});

test("is idempotent (running twice changes nothing the second time)", () => {
  const src = `create({ amount: 1, currency: "usd", payment_method: pm });`;
  const first = patchSource(src).patched;
  const second = patchSource(first);
  assert.equal(second.changed, false);
});

test("reports exact 1-based line numbers", () => {
  const src = ["const b = {", "  amount: 1,", "  payment_method: pm,", "};"].join("\n");
  const m = findMatches(src);
  assert.equal(m.length, 1);
  assert.equal(m[0].line, 3);
});
