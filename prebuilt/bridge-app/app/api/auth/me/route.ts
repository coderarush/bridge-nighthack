import { NextRequest } from "next/server";
import {
  authErrorResponse,
  requireParticipant,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const participant = await requireParticipant(request);
    return Response.json({ participant });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      Response.json(
        { error: "Authentication failed.", code: "AUTH_FAILED", retryable: false },
        { status: 401 },
      )
    );
  }
}
