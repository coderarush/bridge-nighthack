import { NextRequest } from "next/server";
import {
  authErrorResponse,
  requireOperator,
} from "@/lib/auth/session";
import {
  DemoResetError,
  resetDemoRun,
} from "@/lib/demo/reset";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ runId: string }> };

const resetErrorStatus = {
  DEMO_MODE_DISABLED: 404,
  DEMO_RUN_NOT_CONFIGURED: 503,
  RUN_NOT_RESETTABLE: 404,
  RUN_NOT_FOUND: 404,
  RESET_FAILED: 503,
} as const;

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireOperator(request);
  } catch (error) {
    return (
      authErrorResponse(error) ??
      Response.json(
        { error: "Authorization failed.", code: "AUTH_FAILED", retryable: false },
        { status: 401 },
      )
    );
  }

  const { runId } = await context.params;
  try {
    return Response.json(await resetDemoRun(runId));
  } catch (error) {
    if (error instanceof DemoResetError) {
      return Response.json(
        {
          error: error.message,
          code: error.code,
          retryable: error.code === "RESET_FAILED",
        },
        { status: resetErrorStatus[error.code] },
      );
    }

    return Response.json(
      {
        error: "Demo reset failed.",
        code: "RESET_FAILED",
        retryable: true,
      },
      { status: 503 },
    );
  }
}
