import {
  GitHubAppError,
  githubAppErrorResponse,
} from "@/lib/github-app/errors";
import { createGitHubCallbackGet } from "@/lib/github-app/onboarding";
import { createGitHubOnboardingGateway } from "@/lib/github-app/onboarding-client";
import { createSupabaseGitHubOnboardingStore } from "@/lib/github-app/onboarding-store";

export const runtime = "nodejs";

function environment(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export async function GET(request: Request): Promise<Response> {
  try {
    const clientId = environment("GITHUB_APP_CLIENT_ID");
    const clientSecret = environment("GITHUB_APP_CLIENT_SECRET");
    const get = createGitHubCallbackGet({
      clientSecret,
      installationReferenceKey: environment(
        "GITHUB_INSTALLATION_REFERENCE_KEY",
      ),
      store: createSupabaseGitHubOnboardingStore(),
      gateway: createGitHubOnboardingGateway({
        clientId,
        clientSecret,
        appId: environment("GITHUB_APP_ID"),
        privateKey: environment("GITHUB_APP_PRIVATE_KEY"),
      }),
    });
    return get(request);
  } catch {
    return githubAppErrorResponse(
      new GitHubAppError("ONBOARDING_UNAVAILABLE"),
    );
  }
}
