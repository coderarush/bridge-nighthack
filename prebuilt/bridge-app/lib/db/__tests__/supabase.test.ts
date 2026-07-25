import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createServiceClient } from "../supabase";

const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  secretKey: process.env.SUPABASE_SECRET_KEY,
};

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalEnv.publishableKey;
  process.env.SUPABASE_SECRET_KEY = originalEnv.secretKey;
});

test("service client fails closed when the server secret is absent", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://bridge.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-key";
  delete process.env.SUPABASE_SECRET_KEY;

  assert.throws(() => createServiceClient(), /SUPABASE_SECRET_KEY/);
});
