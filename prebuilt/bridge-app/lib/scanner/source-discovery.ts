export interface RepositoryTreeEntry {
  path: string;
  type: string;
  mode?: string;
  oid?: string;
  size?: number;
  binary?: boolean;
  contentSample?: string | Uint8Array;
}

export interface RepositoryTreeSnapshot {
  entries: readonly RepositoryTreeEntry[];
  truncated?: boolean;
}

export interface SourceDiscoveryOptions {
  /**
   * Repository-relative globs. Supports `*`, `?`, and `**`; negation belongs
   * in `exclude`, so pattern evaluation stays explicit and order-independent.
   */
  include?: readonly string[];
  exclude?: readonly string[];
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

export interface DiscoveredSourceFile {
  path: string;
  oid: string;
  mode: "100644" | "100755";
  size: number;
}

export type SourceSkipReason =
  | "binary"
  | "directory"
  | "duplicate_path"
  | "excluded"
  | "file_too_large"
  | "invalid_path"
  | "invalid_size"
  | "missing_oid"
  | "not_included"
  | "selection_truncated"
  | "submodule"
  | "symlink"
  | "unsupported_mode"
  | "unsupported_type";

export interface SkippedRepositoryEntry {
  path: string;
  reason: SourceSkipReason;
  detail: string;
}

export type SourceDiscoveryErrorCode =
  | "duplicate_path"
  | "input_tree_truncated"
  | "invalid_limit"
  | "invalid_pattern";

export interface SourceDiscoveryError {
  code: SourceDiscoveryErrorCode;
  message: string;
  path?: string;
}

export interface SourceDiscoveryTruncation {
  code: "max_files" | "max_total_bytes";
  limit: number;
  firstOmittedPath: string;
  omittedCount: number;
}

export interface SourceDiscoveryResult {
  files: DiscoveredSourceFile[];
  skipped: SkippedRepositoryEntry[];
  errors: SourceDiscoveryError[];
  truncations: SourceDiscoveryTruncation[];
  truncated: boolean;
  complete: boolean;
  stats: {
    inputEntries: number;
    selectedFiles: number;
    selectedBytes: number;
    skippedEntries: number;
  };
}

const DEFAULT_INCLUDE = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
const DEFAULT_EXCLUDE = [
  "**/.git/**",
  "**/.next/**",
  "**/build/**",
  "**/coverage/**",
  "**/dist/**",
  "**/node_modules/**",
  "**/vendor/**",
];

const DEFAULT_MAX_FILES = 5_000;
const DEFAULT_MAX_FILE_BYTES = 1_048_576;
const DEFAULT_MAX_TOTAL_BYTES = 20_971_520;

const REGULAR_FILE_MODES = new Set(["100644", "100755"]);
const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".a",
  ".avi",
  ".bin",
  ".bmp",
  ".class",
  ".db",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tgz",
  ".tif",
  ".tiff",
  ".ttf",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xz",
  ".zip",
]);

type CompiledPattern = {
  source: string;
  matches: (path: string) => boolean;
};

type Candidate = DiscoveredSourceFile;

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

function entryFingerprint(entry: RepositoryTreeEntry): string {
  return [
    entry.path,
    entry.type,
    entry.mode ?? "",
    entry.oid ?? "",
    entry.size ?? "",
    entry.binary === true ? "1" : "0",
  ].join("\u0000");
}

function compareEntries(
  left: RepositoryTreeEntry,
  right: RepositoryTreeEntry,
): number {
  return (
    compareText(left.path, right.path) ||
    compareText(entryFingerprint(left), entryFingerprint(right))
  );
}

function patternProblem(pattern: string): string | null {
  if (pattern.length === 0) return "Pattern cannot be empty.";
  if (pattern.startsWith("!")) {
    return "Negated patterns are not supported; use the exclude list.";
  }
  if (
    pattern.startsWith("/") ||
    /^[A-Za-z]:\//.test(pattern) ||
    pattern.includes("\\")
  ) {
    return "Pattern must be repository-relative and use forward slashes.";
  }
  if (pattern.includes("\u0000")) return "Pattern cannot contain a NUL byte.";
  if (pattern.endsWith("/") || pattern.includes("//")) {
    return "Pattern cannot contain empty path segments.";
  }
  if (pattern.split("/").some((segment) => segment === "." || segment === "..")) {
    return "Pattern cannot contain '.' or '..' path segments.";
  }
  return null;
}

function escapeRegExp(character: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(character)
    ? `\\${character}`
    : character;
}

function compilePattern(pattern: string): CompiledPattern {
  let expression = "^";
  let index = 0;

  while (index < pattern.length) {
    const character = pattern[index];
    if (character === "*") {
      let starCount = 1;
      while (pattern[index + starCount] === "*") starCount += 1;
      index += starCount;

      if (starCount >= 2) {
        if (pattern[index] === "/") {
          expression += "(?:[^/]+/)*";
          index += 1;
        } else {
          expression += ".*";
        }
      } else {
        expression += "[^/]*";
      }
      continue;
    }

    if (character === "?") {
      expression += "[^/]";
      index += 1;
      continue;
    }

    expression += escapeRegExp(character);
    index += 1;
  }

  const matcher = new RegExp(`${expression}$`);
  return {
    source: pattern,
    matches: (path) => matcher.test(path),
  };
}

function validatePatterns(
  kind: "include" | "exclude",
  patterns: readonly string[],
  errors: SourceDiscoveryError[],
): CompiledPattern[] {
  if (kind === "include" && patterns.length === 0) {
    errors.push({
      code: "invalid_pattern",
      message: "At least one include pattern is required.",
    });
    return [];
  }

  const compiled: CompiledPattern[] = [];
  for (const pattern of patterns) {
    const problem = patternProblem(pattern);
    if (problem) {
      errors.push({
        code: "invalid_pattern",
        message: `Invalid ${kind} pattern '${pattern}': ${problem}`,
      });
      continue;
    }
    compiled.push(compilePattern(pattern));
  }
  return compiled;
}

function validateLimit(
  name: keyof Pick<
    SourceDiscoveryOptions,
    "maxFiles" | "maxFileBytes" | "maxTotalBytes"
  >,
  value: number,
  errors: SourceDiscoveryError[],
): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    errors.push({
      code: "invalid_limit",
      message: `${name} must be a positive safe integer.`,
    });
  }
}

function validRepositoryPath(path: string): boolean {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    /^[A-Za-z]:\//.test(path) ||
    path.includes("\\") ||
    path.includes("\u0000")
  ) {
    return false;
  }
  const segments = path.split("/");
  return !segments.some(
    (segment) => segment === "" || segment === "." || segment === "..",
  );
}

function extensionOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  return dot > slash ? path.slice(dot).toLowerCase() : "";
}

function sampleLooksBinary(sample: string | Uint8Array | undefined): boolean {
  if (sample === undefined || sample.length === 0) return false;

  let controls = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const value =
      typeof sample === "string" ? sample.charCodeAt(index) : sample[index];
    if (value === 0) return true;
    if ((value < 32 && value !== 9 && value !== 10 && value !== 13) || value === 127) {
      controls += 1;
    }
  }
  return controls / sample.length > 0.3;
}

function isBinaryEntry(entry: RepositoryTreeEntry): boolean {
  return (
    entry.binary === true ||
    BINARY_EXTENSIONS.has(extensionOf(entry.path)) ||
    sampleLooksBinary(entry.contentSample)
  );
}

function matchesAny(path: string, patterns: readonly CompiledPattern[]): boolean {
  return patterns.some((pattern) => pattern.matches(path));
}

function emptyResult(
  inputEntries: number,
  errors: SourceDiscoveryError[],
): SourceDiscoveryResult {
  return {
    files: [],
    skipped: [],
    errors,
    truncations: [],
    truncated: errors.some((error) => error.code === "input_tree_truncated"),
    complete: false,
    stats: {
      inputEntries,
      selectedFiles: 0,
      selectedBytes: 0,
      skippedEntries: 0,
    },
  };
}

export function discoverTypeScriptSources(
  tree: RepositoryTreeSnapshot,
  options: SourceDiscoveryOptions = {},
): SourceDiscoveryResult {
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const errors: SourceDiscoveryError[] = [];

  const includePatterns = validatePatterns("include", include, errors);
  const excludePatterns = validatePatterns("exclude", exclude, errors);
  validateLimit("maxFiles", maxFiles, errors);
  validateLimit("maxFileBytes", maxFileBytes, errors);
  validateLimit("maxTotalBytes", maxTotalBytes, errors);

  if (tree.truncated) {
    errors.push({
      code: "input_tree_truncated",
      message:
        "Repository tree is truncated; source discovery cannot make a complete claim.",
    });
  }
  if (errors.length > 0) return emptyResult(tree.entries.length, errors);

  const sorted = [...tree.entries].sort(compareEntries);
  const duplicatePaths = new Set<string>();
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].path === sorted[index].path) {
      duplicatePaths.add(sorted[index].path);
    }
  }
  for (const path of [...duplicatePaths].sort(compareText)) {
    errors.push({
      code: "duplicate_path",
      path,
      message: `Repository tree contains duplicate path '${path}'.`,
    });
  }

  const candidates: Candidate[] = [];
  const skipped: SkippedRepositoryEntry[] = [];
  const skip = (
    entry: RepositoryTreeEntry,
    reason: SourceSkipReason,
    detail: string,
  ) => {
    skipped.push({ path: entry.path, reason, detail });
  };

  for (const entry of sorted) {
    if (duplicatePaths.has(entry.path)) {
      skip(entry, "duplicate_path", "Ambiguous duplicate path was rejected.");
      continue;
    }
    if (!validRepositoryPath(entry.path)) {
      skip(entry, "invalid_path", "Path is not a safe repository-relative path.");
      continue;
    }
    if (entry.mode === "120000") {
      skip(entry, "symlink", "Symbolic links are not source discovery inputs.");
      continue;
    }
    if (entry.type === "commit" || entry.mode === "160000") {
      skip(entry, "submodule", "Git submodules require a separate repository traversal.");
      continue;
    }
    if (entry.type === "tree") {
      skip(entry, "directory", "Tree entries do not contain source bytes.");
      continue;
    }
    if (entry.type !== "blob") {
      skip(entry, "unsupported_type", `Unsupported tree entry type '${entry.type}'.`);
      continue;
    }
    if (!entry.mode || !REGULAR_FILE_MODES.has(entry.mode)) {
      skip(
        entry,
        "unsupported_mode",
        `Unsupported regular-file mode '${entry.mode ?? "missing"}'.`,
      );
      continue;
    }
    if (isBinaryEntry(entry)) {
      skip(entry, "binary", "Binary files are not admitted to the source scanner.");
      continue;
    }
    if (!matchesAny(entry.path, includePatterns)) {
      skip(entry, "not_included", "Path did not match an include pattern.");
      continue;
    }
    if (matchesAny(entry.path, excludePatterns)) {
      skip(entry, "excluded", "Path matched an exclude pattern.");
      continue;
    }
    if (!entry.oid) {
      skip(entry, "missing_oid", "Blob object identifier is required.");
      continue;
    }
    if (
      !Number.isSafeInteger(entry.size) ||
      (entry.size as number) < 0
    ) {
      skip(entry, "invalid_size", "Blob size must be a non-negative safe integer.");
      continue;
    }
    if ((entry.size as number) > maxFileBytes) {
      skip(
        entry,
        "file_too_large",
        `Blob exceeds the ${maxFileBytes}-byte per-file limit.`,
      );
      continue;
    }
    candidates.push({
      path: entry.path,
      oid: entry.oid,
      mode: entry.mode as "100644" | "100755",
      size: entry.size as number,
    });
  }

  const files: DiscoveredSourceFile[] = [];
  const truncations: SourceDiscoveryTruncation[] = [];
  let selectedBytes = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    let code: SourceDiscoveryTruncation["code"] | null = null;
    let limit = 0;

    if (files.length >= maxFiles) {
      code = "max_files";
      limit = maxFiles;
    } else if (selectedBytes + candidate.size > maxTotalBytes) {
      code = "max_total_bytes";
      limit = maxTotalBytes;
    }

    if (code) {
      truncations.push({
        code,
        limit,
        firstOmittedPath: candidate.path,
        omittedCount: candidates.length - index,
      });
      for (const omitted of candidates.slice(index)) {
        skipped.push({
          path: omitted.path,
          reason: "selection_truncated",
          detail: `Selection stopped at the ${code} limit (${limit}).`,
        });
      }
      break;
    }

    files.push(candidate);
    selectedBytes += candidate.size;
  }

  const incompleteSkipReasons = new Set<SourceSkipReason>([
    "duplicate_path",
    "file_too_large",
    "invalid_path",
    "invalid_size",
    "missing_oid",
    "selection_truncated",
    "unsupported_mode",
    "unsupported_type",
  ]);
  const complete =
    errors.length === 0 &&
    truncations.length === 0 &&
    !skipped.some((entry) => incompleteSkipReasons.has(entry.reason));

  return {
    files,
    skipped,
    errors,
    truncations,
    truncated: truncations.length > 0,
    complete,
    stats: {
      inputEntries: tree.entries.length,
      selectedFiles: files.length,
      selectedBytes,
      skippedEntries: skipped.length,
    },
  };
}
