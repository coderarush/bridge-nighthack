/**
 * GitHub adapters (server-only). Uses a fine-grained PAT from GITHUB_TOKEN.
 * Never import this from a client component.
 *
 * PRE-BUILT and DISCLOSED (see ../../DISCLOSURE.md). The live NightHack work is
 * wiring these into the orchestrator, deploying with real credentials, running the
 * real migration, and building the realtime room.
 */
import { Octokit } from "@octokit/rest";
import type {
  RepositoryClient,
  RepositoryRef,
  ScanTarget,
  PatchedFile,
  PullRequestResult,
  ValidationClient,
} from "./interfaces";
import { requireDemoRepositoryConfig } from "../orchestrator/run-guards";
import { evaluateRequiredCheckRuns } from "./github-checks";

function octokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set (server env).");
  return new Octokit({ auth: token });
}

export function demoRepoRef(): RepositoryRef {
  return requireDemoRepositoryConfig();
}

export const githubRepositoryClient: RepositoryClient = {
  async getFiles(ref, paths) {
    const gh = octokit();
    const out: ScanTarget[] = [];
    for (const path of paths) {
      try {
        const res = await gh.repos.getContent({
          owner: ref.owner,
          repo: ref.repo,
          path,
          ref: ref.baseBranch,
        });
        const data = res.data as { content?: string; encoding?: string };
        if (data.content) {
          out.push({
            path,
            contents: Buffer.from(data.content, (data.encoding as BufferEncoding) ?? "base64").toString("utf8"),
          });
        }
      } catch (e: any) {
        if (e?.status === 404) continue; // file absent — skip
        throw e;
      }
    }
    return out;
  },

  async createBranch(ref, branchName) {
    const gh = octokit();
    const base = await gh.git.getRef({
      owner: ref.owner,
      repo: ref.repo,
      ref: `heads/${ref.baseBranch}`,
    });
    const sha = base.data.object.sha;
    // idempotent: if the branch already exists, reuse it
    try {
      await gh.git.createRef({
        owner: ref.owner,
        repo: ref.repo,
        ref: `refs/heads/${branchName}`,
        sha,
      });
    } catch (e: any) {
      if (e?.status !== 422) throw e; // 422 = ref exists
    }
    return { sha };
  },

  async commitFiles(ref, branchName, files, message) {
    const gh = octokit();
    const head = await gh.git.getRef({
      owner: ref.owner,
      repo: ref.repo,
      ref: `heads/${branchName}`,
    });
    const baseSha = head.data.object.sha;
    const baseCommit = await gh.git.getCommit({
      owner: ref.owner,
      repo: ref.repo,
      commit_sha: baseSha,
    });

    // Create blobs + a tree with only the patched files.
    const tree = await Promise.all(
      files.map(async (f) => {
        const blob = await gh.git.createBlob({
          owner: ref.owner,
          repo: ref.repo,
          content: f.patched,
          encoding: "utf-8",
        });
        return {
          path: f.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.data.sha,
        };
      }),
    );

    const newTree = await gh.git.createTree({
      owner: ref.owner,
      repo: ref.repo,
      base_tree: baseCommit.data.tree.sha,
      tree,
    });

    const commit = await gh.git.createCommit({
      owner: ref.owner,
      repo: ref.repo,
      message,
      tree: newTree.data.sha,
      parents: [baseSha],
    });

    await gh.git.updateRef({
      owner: ref.owner,
      repo: ref.repo,
      ref: `heads/${branchName}`,
      sha: commit.data.sha,
    });

    return { commitSha: commit.data.sha };
  },

  async openDraftPullRequest(ref, branchName, title, body) {
    const gh = octokit();
    // idempotent: reuse an open PR for this branch if present
    const existing = await gh.pulls.list({
      owner: ref.owner,
      repo: ref.repo,
      head: `${ref.owner}:${branchName}`,
      state: "open",
    });
    let pr = existing.data[0];
    if (!pr) {
      const created = await gh.pulls.create({
        owner: ref.owner,
        repo: ref.repo,
        head: branchName,
        base: ref.baseBranch,
        title,
        body,
        draft: true,
      });
      pr = created.data as typeof pr;
    }
    const headSha = pr.head?.sha ?? "";
    const result: PullRequestResult = {
      branchName,
      commitSha: headSha,
      pullRequestNumber: pr.number,
      pullRequestUrl: pr.html_url,
    };
    return result;
  },
};

export const githubValidationClient: ValidationClient = {
  async checkForSha(ref, commitSha) {
    const gh = octokit();
    const requiredCheck =
      process.env.GITHUB_REQUIRED_CHECK?.trim() || "build";
    const checks = await gh.checks.listForRef({
      owner: ref.owner,
      repo: ref.repo,
      ref: commitSha,
      check_name: requiredCheck,
    });
    const runs = checks.data.check_runs ?? [];
    const fallbackUrl =
      `https://github.com/${ref.owner}/${ref.repo}/commits/${commitSha}/checks`;
    return evaluateRequiredCheckRuns(runs, requiredCheck, fallbackUrl);
  },
};
