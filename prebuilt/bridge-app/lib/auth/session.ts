import type { NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "../db/supabase";

export type ParticipantRole = "provider" | "customer" | "operator";

export interface ParticipantSession {
  userId: string;
  name: string;
  role: ParticipantRole;
}

export interface VerifiedSupabaseUser {
  id: string;
  isAnonymous: boolean;
}

export interface AuthDependencies {
  getUser(token: string): Promise<VerifiedSupabaseUser | null>;
  getParticipant(
    userId: string,
    token: string,
  ): Promise<ParticipantSession | null>;
}

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code:
      | "missing_authorization"
      | "invalid_token"
      | "participant_not_bootstrapped"
      | "role_forbidden",
  ) {
    super(code);
    this.name = "AuthError";
  }
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) {
    throw new AuthError(401, "missing_authorization");
  }
  return match[1];
}

const liveDependencies: AuthDependencies = {
  async getUser(token) {
    const client = createAuthenticatedServerClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      id: data.user.id,
      isAnonymous: Boolean(data.user.is_anonymous),
    };
  },

  async getParticipant(userId, token) {
    const client = createAuthenticatedServerClient(token);
    const { data, error } = await client
      .from("participants")
      .select("user_id, display_name, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      userId: data.user_id,
      name: data.display_name,
      role: data.role as ParticipantRole,
    };
  },
};

export async function requireSupabaseUser(
  request: Request | NextRequest,
  dependencies: AuthDependencies = liveDependencies,
): Promise<VerifiedSupabaseUser> {
  const token = bearerToken(request);
  const user = await dependencies.getUser(token);
  if (!user) throw new AuthError(401, "invalid_token");
  return user;
}

export async function requireParticipant(
  request: Request | NextRequest,
  allowedRoles: readonly ParticipantRole[] = [
    "provider",
    "customer",
    "operator",
  ],
  dependencies: AuthDependencies = liveDependencies,
): Promise<ParticipantSession> {
  const token = bearerToken(request);
  const user = await dependencies.getUser(token);
  if (!user) throw new AuthError(401, "invalid_token");
  const participant = await dependencies.getParticipant(user.id, token);
  if (!participant) {
    throw new AuthError(403, "participant_not_bootstrapped");
  }
  if (!allowedRoles.includes(participant.role)) {
    throw new AuthError(403, "role_forbidden");
  }
  return participant;
}

export function requireOperator(request: Request | NextRequest) {
  return requireParticipant(request, ["operator"]);
}

export function requireProvider(request: Request | NextRequest) {
  return requireParticipant(request, ["provider"]);
}

export function authErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AuthError)) return null;
  return Response.json(
    { error: error.message, code: error.code, retryable: false },
    { status: error.status },
  );
}
