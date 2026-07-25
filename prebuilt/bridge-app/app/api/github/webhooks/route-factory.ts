import {
  GitHubAppError,
  githubAppErrorResponse,
} from "@/lib/github-app/errors";
import {
  parseAndVerifyGitHubWebhook,
  type VerifiedGitHubWebhook,
} from "@/lib/github-app/webhook";

export type GitHubWebhookAcceptance = "accepted" | "duplicate";

export interface GitHubWebhookRouteDependencies {
  readWebhookSecret(): Promise<string | null>;
  acceptDelivery(
    webhook: Readonly<VerifiedGitHubWebhook>,
  ): Promise<GitHubWebhookAcceptance>;
  maxBodyBytes?: number;
}

export function createGitHubWebhookPost(
  dependencies: GitHubWebhookRouteDependencies,
): (request: Request) => Promise<Response> {
  return async function post(request: Request): Promise<Response> {
    let secret: string | null;
    try {
      secret = await dependencies.readWebhookSecret();
    } catch {
      return githubAppErrorResponse(
        new GitHubAppError("WEBHOOK_CONFIGURATION_INVALID"),
      );
    }
    if (!secret) {
      return githubAppErrorResponse(
        new GitHubAppError("WEBHOOK_CONFIGURATION_INVALID"),
      );
    }

    const contentType = request.headers.get("content-type")?.split(";", 1)[0];
    if (contentType !== "application/json") {
      return githubAppErrorResponse(
        new GitHubAppError("WEBHOOK_BODY_INVALID"),
      );
    }

    let verified: VerifiedGitHubWebhook;
    try {
      const contentLength = request.headers.get("content-length");
      const maximum = dependencies.maxBodyBytes ?? 2_000_000;
      if (
        contentLength &&
        (!/^[0-9]+$/.test(contentLength) ||
          Number.parseInt(contentLength, 10) > maximum)
      ) {
        throw new GitHubAppError("WEBHOOK_BODY_INVALID");
      }
      verified = parseAndVerifyGitHubWebhook({
        rawBody: new Uint8Array(await request.arrayBuffer()),
        headers: {
          event: request.headers.get("x-github-event") ?? undefined,
          delivery: request.headers.get("x-github-delivery") ?? undefined,
          signature:
            request.headers.get("x-hub-signature-256") ?? undefined,
        },
        secret,
        maxBodyBytes: maximum,
      });
    } catch (error) {
      return githubAppErrorResponse(
        error instanceof GitHubAppError
          ? error
          : new GitHubAppError("WEBHOOK_BODY_INVALID"),
      );
    }

    let status: GitHubWebhookAcceptance;
    try {
      status = await dependencies.acceptDelivery(Object.freeze(verified));
    } catch {
      return githubAppErrorResponse(
        new GitHubAppError("WEBHOOK_DELIVERY_UNAVAILABLE"),
      );
    }
    if (status !== "accepted" && status !== "duplicate") {
      return githubAppErrorResponse(
        new GitHubAppError("WEBHOOK_DELIVERY_UNAVAILABLE"),
      );
    }
    return Response.json(
      {
        deliveryId: verified.deliveryId,
        status,
      },
      { status: status === "accepted" ? 202 : 200 },
    );
  };
}
