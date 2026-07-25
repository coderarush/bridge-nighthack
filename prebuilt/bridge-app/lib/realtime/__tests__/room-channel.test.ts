import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParticipantSession } from "../../auth/session";
import {
  connectRoomChannel,
  type RoomPresence,
} from "../room-channel";

const runId = "11111111-1111-4111-8111-111111111111";
const participant: ParticipantSession = {
  userId: "22222222-2222-4222-8222-222222222222",
  name: "AtlasPay",
  role: "provider",
};

type Binding = {
  type: string;
  filter: Record<string, string>;
  callback: (payload?: unknown) => void;
};

class FakeChannel {
  bindings: Binding[] = [];
  subscribeCallback?: (status: string, error?: Error) => void;
  tracked: unknown[] = [];
  untrackCount = 0;
  presence: Record<string, RoomPresence[]> = {};

  on(
    type: string,
    filter: Record<string, string>,
    callback: (payload?: unknown) => void,
  ) {
    this.bindings.push({ type, filter, callback });
    return this;
  }

  subscribe(callback: (status: string, error?: Error) => void) {
    this.subscribeCallback = callback;
    return this;
  }

  async track(payload: unknown) {
    this.tracked.push(payload);
    return "ok";
  }

  async untrack() {
    this.untrackCount += 1;
    return "ok";
  }

  presenceState() {
    return this.presence;
  }

  emit(type: string, tableOrEvent: string) {
    const binding = this.bindings.find((candidate) =>
      candidate.type === type &&
      (candidate.filter.table === tableOrEvent ||
        candidate.filter.event === tableOrEvent)
    );
    assert(binding, `Missing ${type} binding for ${tableOrEvent}`);
    binding.callback({});
  }
}

function fakeSupabase() {
  const calls: string[] = [];
  const channel = new FakeChannel();
  const client = {
    realtime: {
      setAuth: async (token: string) => {
        calls.push(`setAuth:${token}`);
      },
    },
    channel: (topic: string, options: unknown) => {
      calls.push(`channel:${topic}:${JSON.stringify(options)}`);
      return channel;
    },
    removeChannel: async (removed: FakeChannel) => {
      assert.equal(removed, channel);
      calls.push("removeChannel");
      return "ok";
    },
  };

  return {
    calls,
    channel,
    client: client as unknown as SupabaseClient,
  };
}

test("authenticates before joining the exact private room topic", async () => {
  const fake = fakeSupabase();
  const statuses: string[] = [];

  await connectRoomChannel({
    supabase: fake.client,
    getAccessToken: async () => "session-token",
    runId,
    participant,
    onStatus: (status) => statuses.push(status),
    onPresence: () => {},
    onAuthoritativeChange: () => {},
  });

  assert.deepEqual(fake.calls, [
    "setAuth:session-token",
    `channel:migration-run:${runId}:${JSON.stringify({
      config: {
        private: true,
        presence: { key: participant.userId },
      },
    })}`,
  ]);
  assert.deepEqual(statuses, ["connecting"]);

  fake.channel.subscribeCallback?.("SUBSCRIBED");
  await Promise.resolve();

  assert.deepEqual(fake.channel.tracked, [{
    userId: participant.userId,
    name: participant.name,
    role: participant.role,
  }]);
  assert.deepEqual(statuses, ["connecting", "connected"]);
});

test("subscribes to room-filtered authoritative changes", async () => {
  const fake = fakeSupabase();
  const changedTables: string[] = [];

  await connectRoomChannel({
    supabase: fake.client,
    getAccessToken: async () => "session-token",
    runId,
    participant,
    onStatus: () => {},
    onPresence: () => {},
    onAuthoritativeChange: (table) => changedTables.push(table),
  });

  const postgresBindings = fake.channel.bindings.filter(
    (binding) => binding.type === "postgres_changes",
  );
  assert.deepEqual(
    postgresBindings.map((binding) => binding.filter),
    [
      {
        event: "*",
        schema: "public",
        table: "migration_runs",
        filter: `id=eq.${runId}`,
      },
      {
        event: "*",
        schema: "public",
        table: "comments",
        filter: `run_id=eq.${runId}`,
      },
      {
        event: "*",
        schema: "public",
        table: "approvals",
        filter: `run_id=eq.${runId}`,
      },
      {
        event: "*",
        schema: "public",
        table: "run_events",
        filter: `run_id=eq.${runId}`,
      },
    ],
  );

  for (const table of [
    "migration_runs",
    "comments",
    "approvals",
    "run_events",
  ]) {
    fake.channel.emit("postgres_changes", table);
  }
  assert.deepEqual(changedTables, [
    "migration_runs",
    "comments",
    "approvals",
    "run_events",
  ]);
});

test("reports synchronized authenticated participant presence", async () => {
  const fake = fakeSupabase();
  const presenceSnapshots: RoomPresence[][] = [];
  fake.channel.presence = {
    [participant.userId]: [
      { ...participant },
      { ...participant },
    ],
    "33333333-3333-4333-8333-333333333333": [{
      userId: "33333333-3333-4333-8333-333333333333",
      name: "Atlas Store",
      role: "customer",
    }],
  };

  await connectRoomChannel({
    supabase: fake.client,
    getAccessToken: async () => "session-token",
    runId,
    participant,
    onStatus: () => {},
    onPresence: (presence) => presenceSnapshots.push(presence),
    onAuthoritativeChange: () => {},
  });

  fake.channel.emit("presence", "sync");

  assert.deepEqual(presenceSnapshots, [[
    participant,
    {
      userId: "33333333-3333-4333-8333-333333333333",
      name: "Atlas Store",
      role: "customer",
    },
  ]]);
});

test("fails closed without a session and removes the channel on cleanup", async () => {
  const missingSession = fakeSupabase();

  await assert.rejects(
    connectRoomChannel({
      supabase: missingSession.client,
      getAccessToken: async () => null,
      runId,
      participant,
      onStatus: () => {},
      onPresence: () => {},
      onAuthoritativeChange: () => {},
    }),
    /authenticated Supabase session/i,
  );
  assert.deepEqual(missingSession.calls, []);

  const connected = fakeSupabase();
  const disconnect = await connectRoomChannel({
    supabase: connected.client,
    getAccessToken: async () => "session-token",
    runId,
    participant,
    onStatus: () => {},
    onPresence: () => {},
    onAuthoritativeChange: () => {},
  });

  await disconnect();
  await disconnect();

  assert.equal(connected.channel.untrackCount, 1);
  assert.equal(
    connected.calls.filter((call) => call === "removeChannel").length,
    1,
  );
});

test("rejects a malformed run id before authenticating or joining", async () => {
  const fake = fakeSupabase();

  await assert.rejects(
    connectRoomChannel({
      supabase: fake.client,
      getAccessToken: async () => "session-token",
      runId: "not-a-room",
      participant,
      onStatus: () => {},
      onPresence: () => {},
      onAuthoritativeChange: () => {},
    }),
    /valid migration run id/i,
  );
  assert.deepEqual(fake.calls, []);
});
