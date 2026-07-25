export type GitHubAppErrorCode =
  | "WEBHOOK_CONFIGURATION_INVALID"
  | "WEBHOOK_HEADERS_INVALID"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "WEBHOOK_BODY_INVALID"
  | "WEBHOOK_PAYLOAD_INVALID"
  | "WEBHOOK_EVENT_UNSUPPORTED"
  | "WEBHOOK_DELIVERY_UNAVAILABLE"
  | "INSTALLATION_PERMISSIONS_INSUFFICIENT"
  | "INSTALLATION_PERMISSIONS_EXCESSIVE"
  | "INSTALLATION_REPOSITORY_SCOPE_FORBIDDEN"
  | "INSTALLATION_REPOSITORIES_INVALID"
  | "INSTALLATION_AUTHORIZATION_INVALID"
  | "INSTALLATION_AUTHORIZATION_UNAVAILABLE"
  | "INSTALLATION_ACCESS_FORBIDDEN"
  | "WORKSPACE_ROLE_FORBIDDEN"
  | "APP_JWT_INVALID"
  | "INSTALLATION_TOKEN_SCOPE_INVALID"
  | "INSTALLATION_TOKEN_INVALID"
  | "INSTALLATION_TOKEN_EXCHANGE_FAILED"
  | "ONBOARDING_REQUEST_INVALID"
  | "ONBOARDING_BODY_TOO_LARGE"
  | "ONBOARDING_STATE_INVALID"
  | "ONBOARDING_PAGINATION_LIMIT"
  | "ONBOARDING_UNAVAILABLE"
  | "INSTALLATION_CLAIM_MISMATCH";

interface ErrorDefinition {
  message: string;
  status: number;
  retryable: boolean;
}

const definitions: Record<GitHubAppErrorCode, ErrorDefinition> = {
  WEBHOOK_CONFIGURATION_INVALID: {
    message: "GitHub webhook configuration is unavailable.",
    status: 503,
    retryable: true,
  },
  WEBHOOK_HEADERS_INVALID: {
    message: "GitHub webhook headers are invalid.",
    status: 400,
    retryable: false,
  },
  WEBHOOK_SIGNATURE_INVALID: {
    message: "GitHub webhook signature is invalid.",
    status: 401,
    retryable: false,
  },
  WEBHOOK_BODY_INVALID: {
    message: "GitHub webhook body is invalid.",
    status: 400,
    retryable: false,
  },
  WEBHOOK_PAYLOAD_INVALID: {
    message: "GitHub webhook payload is invalid.",
    status: 422,
    retryable: false,
  },
  WEBHOOK_EVENT_UNSUPPORTED: {
    message: "GitHub webhook event is not supported.",
    status: 422,
    retryable: false,
  },
  WEBHOOK_DELIVERY_UNAVAILABLE: {
    message: "GitHub webhook delivery could not be persisted.",
    status: 503,
    retryable: true,
  },
  INSTALLATION_PERMISSIONS_INSUFFICIENT: {
    message: "GitHub App installation is missing required permissions.",
    status: 422,
    retryable: false,
  },
  INSTALLATION_PERMISSIONS_EXCESSIVE: {
    message: "GitHub App installation has permissions Bridge does not allow.",
    status: 422,
    retryable: false,
  },
  INSTALLATION_REPOSITORY_SCOPE_FORBIDDEN: {
    message: "GitHub App repository scope is not allowed.",
    status: 422,
    retryable: false,
  },
  INSTALLATION_REPOSITORIES_INVALID: {
    message: "GitHub App repository selection is invalid.",
    status: 422,
    retryable: false,
  },
  INSTALLATION_AUTHORIZATION_INVALID: {
    message: "GitHub App authorization request is invalid.",
    status: 400,
    retryable: false,
  },
  INSTALLATION_AUTHORIZATION_UNAVAILABLE: {
    message: "GitHub App authorization is temporarily unavailable.",
    status: 503,
    retryable: true,
  },
  INSTALLATION_ACCESS_FORBIDDEN: {
    message: "GitHub App installation access is forbidden.",
    status: 403,
    retryable: false,
  },
  WORKSPACE_ROLE_FORBIDDEN: {
    message: "Workspace role cannot perform this GitHub App action.",
    status: 403,
    retryable: false,
  },
  APP_JWT_INVALID: {
    message: "GitHub App JWT is invalid.",
    status: 503,
    retryable: false,
  },
  INSTALLATION_TOKEN_SCOPE_INVALID: {
    message: "GitHub installation token scope is invalid.",
    status: 400,
    retryable: false,
  },
  INSTALLATION_TOKEN_INVALID: {
    message: "GitHub installation token is invalid.",
    status: 502,
    retryable: false,
  },
  INSTALLATION_TOKEN_EXCHANGE_FAILED: {
    message: "GitHub installation token could not be acquired.",
    status: 503,
    retryable: true,
  },
  ONBOARDING_REQUEST_INVALID: {
    message: "GitHub App onboarding request is invalid.",
    status: 400,
    retryable: false,
  },
  ONBOARDING_BODY_TOO_LARGE: {
    message: "GitHub App onboarding request is too large.",
    status: 413,
    retryable: false,
  },
  ONBOARDING_STATE_INVALID: {
    message: "GitHub App onboarding state is invalid or expired.",
    status: 410,
    retryable: false,
  },
  ONBOARDING_PAGINATION_LIMIT: {
    message: "GitHub App onboarding exceeds the supported resource limit.",
    status: 422,
    retryable: false,
  },
  ONBOARDING_UNAVAILABLE: {
    message: "GitHub App onboarding is temporarily unavailable.",
    status: 503,
    retryable: true,
  },
  INSTALLATION_CLAIM_MISMATCH: {
    message: "GitHub App installation could not be verified for this user.",
    status: 403,
    retryable: false,
  },
};

export class GitHubAppError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(readonly code: GitHubAppErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "GitHubAppError";
    this.status = definition.status;
    this.retryable = definition.retryable;
  }
}

export function githubAppErrorResponse(error: unknown): Response {
  const safeError =
    error instanceof GitHubAppError
      ? error
      : new GitHubAppError("WEBHOOK_DELIVERY_UNAVAILABLE");
  return Response.json(
    {
      code: safeError.code,
      error: safeError.message,
      retryable: safeError.retryable,
    },
    { status: safeError.status },
  );
}
