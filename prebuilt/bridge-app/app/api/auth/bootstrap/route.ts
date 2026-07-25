import { NextRequest } from "next/server";
import { capabilityDigest, requireCapability } from "@/lib/auth/capability";
import {
  authErrorResponse,
  requireSupabaseUser,
} from "@/lib/auth/session";
import { createServiceClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireSupabaseUser(request);
  } catch (error) {
    return (
      authErrorResponse(error) ??
      Response.json(
        { error: "Authentication failed.", code: "AUTH_FAILED", retryable: false },
        { status: 401 },
      )
    );
  }
  if (!user.isAnonymous) {
    return Response.json(
      {
        error: "Bridge capabilities require an anonymous demo session.",
        code: "ANONYMOUS_SESSION_REQUIRED",
        retryable: false,
      },
      { status: 403 },
    );
  }

  let capability;
  try {
    const body = await request.json();
    capability = requireCapability(body.capability);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Capability is invalid.",
        code: "INVALID_CAPABILITY",
        retryable: false,
      },
      { status: 400 },
    );
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("claim_participant_invite", {
    p_user_id: user.id,
    p_token_digest: capabilityDigest(capability),
  });
  if (error) {
    return Response.json(
      {
        error: "Participant capability is invalid, expired, or already claimed.",
        code: "CAPABILITY_REJECTED",
        retryable: false,
      },
      { status: 403 },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return Response.json(
      {
        error: "Participant profile was not created.",
        code: "PARTICIPANT_CREATE_FAILED",
        retryable: true,
      },
      { status: 503 },
    );
  }

  return Response.json({
    participant: {
      userId: row.user_id,
      name: row.display_name,
      role: row.role,
    },
  });
}
