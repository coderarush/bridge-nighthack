import type {
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";
import type {
  ParticipantRole,
  ParticipantSession,
} from "../auth/session";

export type RoomPresence = {
  userId: string;
  name: string;
  role: ParticipantRole;
};

export type RoomRealtimeStatus = "connecting" | "connected" | "disconnected";

export type RoomRealtimeTable =
  | "migration_runs"
  | "comments"
  | "approvals"
  | "run_events";

type ConnectRoomChannelOptions = {
  supabase: SupabaseClient;
  getAccessToken: () => Promise<string | null>;
  runId: string;
  participant: ParticipantSession;
  onStatus: (status: RoomRealtimeStatus, error?: string) => void;
  onPresence: (presence: RoomPresence[]) => void;
  onAuthoritativeChange: (table: RoomRealtimeTable) => void;
};

const authoritativeTables: ReadonlyArray<{
  table: RoomRealtimeTable;
  column: "id" | "run_id";
}> = [
  { table: "migration_runs", column: "id" },
  { table: "comments", column: "run_id" },
  { table: "approvals", column: "run_id" },
  { table: "run_events", column: "run_id" },
];

const migrationRunIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function synchronizedPresence(channel: RealtimeChannel): RoomPresence[] {
  const byParticipant = new Map<string, RoomPresence>();
  const state = channel.presenceState<RoomPresence>();

  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (
        presence.userId &&
        presence.name &&
        ["provider", "customer", "operator"].includes(presence.role)
      ) {
        byParticipant.set(presence.userId, {
          userId: presence.userId,
          name: presence.name,
          role: presence.role,
        });
      }
    }
  }

  return [...byParticipant.values()];
}

export async function connectRoomChannel({
  supabase,
  getAccessToken,
  runId,
  participant,
  onStatus,
  onPresence,
  onAuthoritativeChange,
}: ConnectRoomChannelOptions): Promise<() => Promise<void>> {
  if (!migrationRunIdPattern.test(runId)) {
    throw new Error("A valid migration run id is required.");
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("An authenticated Supabase session is required.");
  }

  await supabase.realtime.setAuth(accessToken);

  let active = true;
  let disconnected = false;
  const channel = supabase.channel(`migration-run:${runId}`, {
    config: {
      private: true,
      presence: { key: participant.userId },
    },
  });

  channel.on("presence", { event: "sync" }, () => {
    if (active) onPresence(synchronizedPresence(channel));
  });

  for (const { table, column } of authoritativeTables) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `${column}=eq.${runId}`,
      },
      () => {
        if (active) onAuthoritativeChange(table);
      },
    );
  }

  onStatus("connecting");
  channel.subscribe((status, error) => {
    if (!active) return;

    if (status === "SUBSCRIBED") {
      void channel.track({
        userId: participant.userId,
        name: participant.name,
        role: participant.role,
      }).then((result) => {
        if (!active) return;
        if (result === "ok") {
          onStatus("connected");
          return;
        }
        onStatus("disconnected", "Could not publish room presence.");
      }).catch((error) => {
        if (!active) return;
        onStatus(
          "disconnected",
          error instanceof Error
            ? error.message
            : "Could not publish room presence.",
        );
      });
      return;
    }

    if (
      status === "CHANNEL_ERROR" ||
      status === "TIMED_OUT" ||
      status === "CLOSED"
    ) {
      onStatus(
        "disconnected",
        error?.message ?? "Realtime connection interrupted.",
      );
    }
  });

  return async () => {
    if (disconnected) return;
    disconnected = true;
    active = false;
    try {
      await channel.untrack();
    } finally {
      await supabase.removeChannel(channel);
    }
  };
}
