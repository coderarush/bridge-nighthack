import {
  GitHubAppError,
  githubAppErrorResponse,
} from "@/lib/github-app/errors";
import { createGitHubSetupGet } from "@/lib/github-app/onboarding";
import { createSupabaseGitHubOnboardingStore } from "@/lib/github-app/onboarding-store";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const get = createGitHubSetupGet({
      clientId: process.env.GITHUB_APP_CLIENT_ID?.trim() ?? "",
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET?.trim() ?? "",
      installationReferenceKey:
        process.env.GITHUB_INSTALLATION_REFERENCE_KEY?.trim() ?? "",
      store: createSupabaseGitHubOnboardingStore(),
    });
    return get(request);
  } catch {
    return githubAppErrorResponse(
      new GitHubAppError("ONBOARDING_UNAVAILABLE"),
    );
  }
}
