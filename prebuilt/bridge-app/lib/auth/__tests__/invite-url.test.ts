import assert from "node:assert/strict";
import test from "node:test";
import { readInviteUrl } from "../invite-url";

test("reads a fragment capability without placing it in the sanitized URL", () => {
  assert.deepEqual(
    readInviteUrl(
      "https://bridge.example/room/run-id?view=review#invite=fragment-secret",
    ),
    {
      capability: "fragment-secret",
      sanitizedPath: "/room/run-id?view=review",
    },
  );
});

test("keeps legacy query links compatible and strips them before bootstrap", () => {
  assert.deepEqual(
    readInviteUrl(
      "https://bridge.example/room/run-id?invite=legacy-secret&view=review",
    ),
    {
      capability: "legacy-secret",
      sanitizedPath: "/room/run-id?view=review",
    },
  );
});

test("preserves unrelated fragments when no invite is present", () => {
  assert.deepEqual(
    readInviteUrl("https://bridge.example/room/run-id?view=review#evidence"),
    {
      capability: null,
      sanitizedPath: "/room/run-id?view=review#evidence",
    },
  );
});
