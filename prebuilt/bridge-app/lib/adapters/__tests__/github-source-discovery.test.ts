import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDiscoveredSourcesAreText,
  githubTreeSnapshot,
} from "../github-source-discovery";

test("normalizes a GitHub recursive tree for deterministic source discovery", () => {
  assert.deepEqual(
    githubTreeSnapshot({
      truncated: false,
      tree: [
        {
          path: "src/index.ts",
          mode: "100644",
          type: "blob",
          sha: "blob-sha",
          size: 42,
        },
        {
          path: "src",
          mode: "040000",
          type: "tree",
          sha: "tree-sha",
        },
      ],
    }),
    {
      truncated: false,
      entries: [
        {
          path: "src/index.ts",
          mode: "100644",
          type: "blob",
          oid: "blob-sha",
          size: 42,
        },
        {
          path: "src",
          mode: "040000",
          type: "tree",
          oid: "tree-sha",
          size: undefined,
        },
      ],
    },
  );
});

test("fails closed when GitHub omits required tree metadata", () => {
  assert.throws(
    () =>
      githubTreeSnapshot({
        truncated: false,
        tree: [{ path: undefined, type: "blob", sha: "sha" }],
      }),
    /missing a path/i,
  );
});

test("rejects a TypeScript-named blob whose fetched bytes are binary", () => {
  assert.throws(
    () =>
      assertDiscoveredSourcesAreText([
        {
          path: "src/malicious.ts",
          contents: "const prefix = 1;\u0000\u0001\u0002",
        },
      ]),
    /binary/i,
  );
});
