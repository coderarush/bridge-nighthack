import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverTypeScriptSources,
  type RepositoryTreeEntry,
} from "../source-discovery";

function blob(
  path: string,
  size: number,
  overrides: Partial<RepositoryTreeEntry> = {},
): RepositoryTreeEntry {
  return {
    path,
    type: "blob",
    mode: "100644",
    oid: `oid:${path}`,
    size,
    ...overrides,
  };
}

test("discovers included TypeScript sources in deterministic path order", () => {
  const result = discoverTypeScriptSources(
    {
      entries: [
        blob("z.ts", 9),
        blob("src/vendor/generated.ts", 8),
        blob("src/types.d.ts", 7),
        blob("src/b.tsx", 6),
        blob("node_modules/pkg/index.ts", 5),
        blob("README.md", 4),
        blob("src/a.js", 3),
        blob("src/a.ts", 2),
      ],
    },
    {
      include: ["**/*.ts", "**/*.tsx"],
      exclude: ["**/node_modules/**", "src/vendor/**"],
    },
  );

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["src/a.ts", "src/b.tsx", "src/types.d.ts", "z.ts"],
  );
  assert.equal(result.complete, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.truncations, []);
  assert.equal(
    result.skipped.find((entry) => entry.path === "src/vendor/generated.ts")
      ?.reason,
    "excluded",
  );
  assert.equal(
    result.skipped.find((entry) => entry.path === "README.md")?.reason,
    "not_included",
  );
});

test("rejects symlinks, submodules, directories, and binary content", () => {
  const result = discoverTypeScriptSources(
    {
      entries: [
        blob("safe.ts", 10),
        blob("linked.ts", 10, { mode: "120000" }),
        {
          path: "vendor/sdk",
          type: "commit",
          mode: "160000",
          oid: "submodule-oid",
        },
        {
          path: "src",
          type: "tree",
          mode: "040000",
          oid: "tree-oid",
        },
        blob("flagged.ts", 10, { binary: true }),
        blob("nul-byte.ts", 10, {
          contentSample: new Uint8Array([0x65, 0x78, 0x00, 0x70]),
        }),
        blob("asset.png", 10),
      ],
    },
    { include: ["**/*"] },
  );

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["safe.ts"],
  );
  assert.deepEqual(
    Object.fromEntries(result.skipped.map((entry) => [entry.path, entry.reason])),
    {
      "asset.png": "binary",
      "flagged.ts": "binary",
      "linked.ts": "symlink",
      "nul-byte.ts": "binary",
      src: "directory",
      "vendor/sdk": "submodule",
    },
  );
});

test("caps file count using the lexicographically sorted candidate prefix", () => {
  const result = discoverTypeScriptSources(
    {
      entries: [
        blob("c.ts", 1),
        blob("a.ts", 6),
        blob("b.ts", 6),
      ],
    },
    {
      maxFiles: 2,
      maxTotalBytes: 20,
      maxFileBytes: 20,
    },
  );

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["a.ts", "b.ts"],
  );
  assert.deepEqual(result.truncations, [
    {
      code: "max_files",
      limit: 2,
      firstOmittedPath: "c.ts",
      omittedCount: 1,
    },
  ]);
  assert.equal(result.complete, false);
  assert.equal(result.skipped.at(-1)?.reason, "selection_truncated");
});

test("rejects oversized files and reports total-byte truncation explicitly", () => {
  const result = discoverTypeScriptSources(
    {
      entries: [
        blob("c.ts", 6),
        blob("a-too-large.ts", 50),
        blob("b.ts", 6),
      ],
    },
    {
      maxFiles: 10,
      maxFileBytes: 20,
      maxTotalBytes: 10,
    },
  );

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["b.ts"],
  );
  assert.equal(
    result.skipped.find((entry) => entry.path === "a-too-large.ts")?.reason,
    "file_too_large",
  );
  assert.deepEqual(result.truncations, [
    {
      code: "max_total_bytes",
      limit: 10,
      firstOmittedPath: "c.ts",
      omittedCount: 1,
    },
  ]);
});

test("fails closed when the upstream repository tree is truncated", () => {
  const result = discoverTypeScriptSources({
    entries: [blob("src/index.ts", 10)],
    truncated: true,
  });

  assert.deepEqual(result.files, []);
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.errors.map((error) => error.code),
    ["input_tree_truncated"],
  );
});

test("returns configuration errors instead of throwing", () => {
  const result = discoverTypeScriptSources(
    { entries: [blob("src/index.ts", 10)] },
    {
      include: ["../**/*.ts"],
      exclude: ["!src/generated/**"],
      maxFiles: 0,
      maxFileBytes: Number.NaN,
    },
  );

  assert.deepEqual(result.files, []);
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.errors.map((error) => error.code),
    ["invalid_pattern", "invalid_pattern", "invalid_limit", "invalid_limit"],
  );
});

test("reports duplicate and unsafe paths without admitting ambiguous entries", () => {
  const result = discoverTypeScriptSources({
    entries: [
      blob("src/a.ts", 4, { oid: "first" }),
      blob("../escape.ts", 4),
      blob("src/b.ts", 4),
      blob("src/a.ts", 4, { oid: "second" }),
      blob("src//c.ts", 4),
    ],
  });

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["src/b.ts"],
  );
  assert.deepEqual(
    result.errors.map((error) => error.code),
    ["duplicate_path"],
  );
  assert.equal(
    result.skipped.filter((entry) => entry.reason === "duplicate_path").length,
    2,
  );
  assert.equal(
    result.skipped.filter((entry) => entry.reason === "invalid_path").length,
    2,
  );
  assert.equal(result.complete, false);
});

test("rejects blobs with incomplete or invalid metadata", () => {
  const result = discoverTypeScriptSources({
    entries: [
      blob("src/good.ts", 1),
      blob("src/no-oid.ts", 1, { oid: "" }),
      blob("src/no-size.ts", 1, { size: undefined }),
      blob("src/negative.ts", -1),
      blob("src/unsupported.ts", 1, { mode: "100000" }),
    ],
  });

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["src/good.ts"],
  );
  assert.deepEqual(
    Object.fromEntries(result.skipped.map((entry) => [entry.path, entry.reason])),
    {
      "src/negative.ts": "invalid_size",
      "src/no-oid.ts": "missing_oid",
      "src/no-size.ts": "invalid_size",
      "src/unsupported.ts": "unsupported_mode",
    },
  );
});
