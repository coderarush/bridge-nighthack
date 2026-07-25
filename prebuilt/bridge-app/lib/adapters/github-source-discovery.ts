import {
  discoverTypeScriptSources,
  type DiscoveredSourceFile,
  type RepositoryTreeSnapshot,
} from "../scanner/source-discovery";
import type { ScanTarget } from "./interfaces";

type GitHubTreeEntry = {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
  size?: number;
};

type GitHubTreeResponse = {
  tree: readonly GitHubTreeEntry[];
  truncated?: boolean;
};

export function githubTreeSnapshot(
  response: GitHubTreeResponse,
): RepositoryTreeSnapshot {
  return {
    truncated: response.truncated === true,
    entries: response.tree.map((entry) => {
      if (!entry.path) {
        throw new Error("GitHub repository tree entry is missing a path.");
      }
      return {
        path: entry.path,
        type: entry.type ?? "",
        mode: entry.mode,
        oid: entry.sha,
        size: entry.size,
      };
    }),
  };
}

export function discoverGitHubSources(
  snapshot: RepositoryTreeSnapshot,
): DiscoveredSourceFile[] {
  const result = discoverTypeScriptSources(snapshot);
  if (!result.complete) {
    const detail = [
      ...result.errors.map((error) => error.message),
      ...result.truncations.map(
        (truncation) =>
          `${truncation.code} omitted ${truncation.omittedCount} files starting at ${truncation.firstOmittedPath}.`,
      ),
    ].join(" ");
    throw new Error(
      `Repository source discovery was incomplete.${detail ? ` ${detail}` : ""}`,
    );
  }
  return result.files;
}

export function discoverGitHubSourcePaths(
  snapshot: RepositoryTreeSnapshot,
): string[] {
  return discoverGitHubSources(snapshot).map((file) => file.path);
}

export function assertDiscoveredSourcesAreText(
  files: readonly ScanTarget[],
): void {
  const result = discoverTypeScriptSources({
    entries: files.map((file) => ({
      path: file.path,
      type: "blob",
      mode: "100644",
      oid: file.path,
      size: Buffer.byteLength(file.contents, "utf8"),
      contentSample: file.contents,
    })),
  });

  if (!result.complete || result.files.length !== files.length) {
    const rejected = result.skipped
      .filter((entry) => entry.reason !== "not_included")
      .map((entry) => `${entry.path}: ${entry.reason}`)
      .join(", ");
    throw new Error(
      `Fetched repository source failed text validation${rejected ? ` (${rejected})` : ""}.`,
    );
  }
}
