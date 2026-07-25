import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createServer, type Server } from "node:http";
import { getRoom } from "../queries";

const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  secretKey: process.env.SUPABASE_SECRET_KEY,
};

let server: Server | undefined;

afterEach(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalEnv.publishableKey;
  process.env.SUPABASE_SECRET_KEY = originalEnv.secretKey;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
    server = undefined;
  }
});

async function useFakeSupabase(handler: Parameters<typeof createServer>[0]) {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  delete process.env.SUPABASE_SECRET_KEY;
}

test("returns null when a configured room does not exist", async () => {
  await useFakeSupabase((_request, response) => {
    response.writeHead(406, { "content-type": "application/json" });
    response.end(JSON.stringify({
      code: "PGRST116",
      details: "The result contains 0 rows",
      hint: null,
      message: "Cannot coerce the result to a single JSON object",
    }));
  });

  const room = await getRoom("11111111-1111-4111-8111-111111111111");

  assert.equal(room, null);
});

test("surfaces configured database failures instead of returning seeded success", async () => {
  await useFakeSupabase((_request, response) => {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "database unavailable" }));
  });

  await assert.rejects(
    () => getRoom("22222222-2222-4222-8222-222222222222"),
    /database unavailable/i,
  );
});

test("unconfigured local seed never fabricates external success", async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;

  const room = await getRoom("local-demo");

  assert(room);
  assert.equal(room.status, "planning");
  assert.equal(room.evidence.commitSha, undefined);
  assert.equal(room.evidence.pullRequestUrl, undefined);
  assert.equal(room.evidence.validationConclusion, undefined);
  assert.equal(room.approvals.length, 0);
});
