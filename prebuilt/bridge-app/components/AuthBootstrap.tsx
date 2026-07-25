"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ParticipantSession } from "@/lib/auth/session";
import { createBrowserClient } from "@/lib/db/supabase";

type AuthStatus = "loading" | "ready" | "invite_required" | "error";

type BridgeAuthValue = {
  status: AuthStatus;
  participant: ParticipantSession | null;
  error: string | null;
  authorizedFetch: typeof fetch;
  retry: () => void;
};

const BridgeAuthContext = createContext<BridgeAuthValue | null>(null);

export function useBridgeAuth(): BridgeAuthValue {
  const value = useContext(BridgeAuthContext);
  if (!value) throw new Error("useBridgeAuth must be used inside AuthBootstrap.");
  return value;
}

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [participant, setParticipant] =
    useState<ParticipantSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setStatus("loading");
      setError(null);

      const sessionResult = await supabase.auth.getSession();
      let session = sessionResult.data.session;
      if (!session) {
        const anonymous = await supabase.auth.signInAnonymously();
        if (anonymous.error || !anonymous.data.session) {
          throw new Error(
            anonymous.error?.message ?? "Could not create a Bridge demo session.",
          );
        }
        session = anonymous.data.session;
      }

      const url = new URL(window.location.href);
      const capability = url.searchParams.get("invite");
      const response = await fetch(
        capability ? "/api/auth/bootstrap" : "/api/auth/me",
        {
          method: capability ? "POST" : "GET",
          headers: {
            authorization: `Bearer ${session.access_token}`,
            ...(capability ? { "content-type": "application/json" } : {}),
          },
          body: capability ? JSON.stringify({ capability }) : undefined,
        },
      );

      if (capability) {
        url.searchParams.delete("invite");
        window.history.replaceState(
          {},
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (
          response.status === 403 &&
          payload.code === "participant_not_bootstrapped"
        ) {
          if (active) setStatus("invite_required");
          return;
        }
        throw new Error(payload.error ?? "Bridge authentication failed.");
      }

      if (active) {
        setParticipant(payload.participant);
        setStatus("ready");
      }
    }

    bootstrap().catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Authentication failed.");
      setStatus("error");
    });

    return () => {
      active = false;
    };
  }, [attempt, supabase]);

  const authorizedFetch = useCallback<typeof fetch>(
    async (input, init = {}) => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        throw new Error("Bridge session is unavailable.");
      }
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${data.session.access_token}`);
      return fetch(input, { ...init, headers });
    },
    [supabase],
  );

  const value = useMemo<BridgeAuthValue>(
    () => ({
      status,
      participant,
      error,
      authorizedFetch,
      retry: () => setAttempt((current) => current + 1),
    }),
    [authorizedFetch, error, participant, status],
  );

  return (
    <BridgeAuthContext.Provider value={value}>
      {status === "error" ? (
        <div className="auth-status" role="alert">
          <span>{error}</span>
          <button type="button" onClick={value.retry}>
            Retry
          </button>
        </div>
      ) : null}
      {children}
    </BridgeAuthContext.Provider>
  );
}
