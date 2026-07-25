import { requireHumanUser } from "@/lib/auth/session";
import {
  GitHubAppError,
  githubAppErrorResponse,
} from "@/lib/github-app/errors";
import { createGitHubInstallPost } from "@/lib/github-app/onboarding";
import { createSupabaseGitHubOnboardingStore } from "@/lib/github-app/onboarding-store";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const post = createGitHubInstallPost({
      authenticateHuman: requireHumanUser,
      appSlug: process.env.GITHUB_APP_SLUG?.trim() ?? "",
      store: createSupabaseGitHubOnboardingStore(),
    });
    return post(request);
  } catch {
    return githubAppErrorResponse(
      new GitHubAppError("ONBOARDING_UNAVAILABLE"),
    );
  }
}
