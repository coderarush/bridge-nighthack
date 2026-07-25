import {
  requireBearerToken,
  requireHumanUser,
} from "@/lib/auth/session";
import {
  createAuthenticatedServerClient,
  createServiceClient,
} from "@/lib/db/supabase";
import { createWorkspaceHandlers } from "@/lib/workspaces/handlers";

export const dynamic = "force-dynamic";

const handlers = createWorkspaceHandlers({
  async authenticate(request) {
    const accessToken = requireBearerToken(request);
    const user = await requireHumanUser(request);
    return {
      userId: user.id,
      isAnonymous: user.isAnonymous,
      accessToken,
    };
  },

  async listWorkspaces(query) {
    const db = createAuthenticatedServerClient(query.accessToken);
    let request = db.from("workspaces").select(query.select);
    for (const order of query.order) {
      request = request.order(order.column, {
        ascending: order.ascending,
      });
    }

    const { data, error } = await request;
    if (error) throw error;
    return data ?? [];
  },

  async createWorkspaceWithAudit(input) {
    const db = createServiceClient();
    const { data, error } = await db.rpc(
      "service_create_workspace_with_audit",
      {
        p_name: input.name,
        p_slug: input.slug,
        p_owner_user_id: input.ownerUserId,
      },
    );
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },
});

export async function GET(request: Request): Promise<Response> {
  return handlers.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return handlers.POST(request);
}
