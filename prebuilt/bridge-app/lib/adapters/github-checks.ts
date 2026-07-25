import type { ValidationStatus } from "./interfaces";

export type GitHubCheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
};

const ALLOWED_CONCLUSIONS = new Set([
  "success",
  "failure",
  "neutral",
  "cancelled",
  "timed_out",
]);

export function evaluateRequiredCheckRuns(
  runs: GitHubCheckRun[],
  requiredCheck: string,
  fallbackUrl: string,
): ValidationStatus {
  const requiredRuns = runs.filter((run) => run.name === requiredCheck);
  const url = requiredRuns[0]?.html_url ?? fallbackUrl;

  if (requiredRuns.length === 0) {
    return { status: "queued", url };
  }
  if (requiredRuns.some((run) => run.status !== "completed")) {
    return { status: "in_progress", url };
  }
  if (requiredRuns.every((run) => run.conclusion === "success")) {
    return { status: "completed", conclusion: "success", url };
  }

  const failedConclusion = requiredRuns.find(
    (run) => run.conclusion !== "success",
  )?.conclusion;
  const conclusion = ALLOWED_CONCLUSIONS.has(failedConclusion ?? "")
    ? (failedConclusion as ValidationStatus["conclusion"])
    : "failure";
  return { status: "completed", conclusion, url };
}
