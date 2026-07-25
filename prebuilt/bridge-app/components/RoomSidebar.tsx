"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomAggregate } from "@/lib/types";
import { createBrowserClient } from "@/lib/db/supabase";
import {
  connectRoomChannel,
  type RoomPresence,
  type RoomRealtimeStatus,
} from "@/lib/realtime/room-channel";
import { useBridgeAuth } from "./AuthBootstrap";

type MutationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const RECOVERY_POLL_MS = 20_000;

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const payload = await response.json().catch(() => ({}));
  return new Error(
    typeof payload.error === "string" ? payload.error : fallback,
  );
}

export function RoomSidebar({
  room,
  onRefresh,
  readOnly = false,
}: {
  room: RoomAggregate;
  onRefresh?: () => void | Promise<void>;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const auth = useBridgeAuth();
  const supabase = useMemo(() => createBrowserClient(), []);
  const [draft, setDraft] = useState("");
  const [presence, setPresence] = useState<RoomPresence[]>([]);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RoomRealtimeStatus>("connecting");
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [commentState, setCommentState] =
    useState<MutationState>({ status: "idle" });
  const [approvalState, setApprovalState] =
    useState<MutationState>({ status: "idle" });

  useEffect(() => {
    if (readOnly || auth.status !== "ready" || !auth.participant) {
      setPresence([]);
      setRealtimeStatus(readOnly ? "disconnected" : "connecting");
      setRealtimeError(null);
      return;
    }

    let disposed = false;
    let disconnect: (() => Promise<void>) | undefined;
    const participant = auth.participant;

    setPresence([]);
    setRealtimeStatus("connecting");
    setRealtimeError(null);

    void connectRoomChannel({
      supabase,
      getAccessToken: async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session?.access_token ?? null;
      },
      runId: room.runId,
      participant,
      onStatus: (status, error) => {
        if (disposed) return;
        setRealtimeStatus(status);
        setRealtimeError(error ?? null);
      },
      onPresence: (participants) => {
        if (!disposed) setPresence(participants);
      },
      onAuthoritativeChange: () => {
        if (!disposed) {
          if (onRefresh) void onRefresh();
          else router.refresh();
        }
      },
    }).then((cleanup) => {
      if (disposed) {
        void cleanup().catch(() => {});
      } else {
        disconnect = cleanup;
      }
    }).catch((error) => {
      if (disposed) return;
      setRealtimeStatus("disconnected");
      setRealtimeError(
        error instanceof Error
          ? error.message
          : "Realtime connection failed.",
      );
    });

    return () => {
      disposed = true;
      if (disconnect) void disconnect().catch(() => {});
    };
  }, [auth.participant, auth.status, onRefresh, readOnly, room.runId, router, supabase]);

  useEffect(() => {
    if (readOnly || realtimeStatus !== "disconnected") return;
    const timer = window.setInterval(() => {
      if (onRefresh) void onRefresh();
      else router.refresh();
    }, RECOVERY_POLL_MS);
    return () => window.clearInterval(timer);
  }, [onRefresh, readOnly, realtimeStatus, router]);

  async function send() {
    const body = draft.trim();
    if (!body || auth.status !== "ready" || !auth.participant) return;

    setCommentState({ status: "loading" });
    try {
      const response = await auth.authorizedFetch(
        `/api/runs/${room.runId}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!response.ok) {
        throw await responseError(response, "Could not send comment.");
      }
      setDraft("");
      setCommentState({ status: "success", message: "Comment sent." });
      if (onRefresh) await onRefresh();
      else router.refresh();
    } catch (error) {
      setCommentState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not send comment.",
      });
    }
  }

  async function approve() {
    if (auth.participant?.role !== "provider") return;

    setApprovalState({ status: "loading" });
    try {
      const response = await auth.authorizedFetch(
        `/api/runs/${room.runId}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            planVersion: room.plan.version,
            decision: "approved",
            note: "Patch is limited to AtlasPay request fields.",
          }),
        },
      );
      if (!response.ok) {
        throw await responseError(response, "Could not approve migration.");
      }
      setApprovalState({
        status: "success",
        message: "Migration approved.",
      });
      if (onRefresh) await onRefresh();
      else router.refresh();
    } catch (error) {
      setApprovalState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not approve migration.",
      });
    }
  }

  const commentBusy = commentState.status === "loading";
  const approvalBusy = approvalState.status === "loading";
  const canComment =
    !readOnly && auth.status === "ready" && Boolean(auth.participant);
  const connectionLabel =
    readOnly
      ? "read-only demo"
      : auth.status === "loading"
      ? "loading participant…"
      : auth.status === "invite_required"
        ? "invite required"
        : auth.status === "error"
          ? "authentication error"
          : realtimeStatus === "connected"
            ? "● live"
            : realtimeStatus === "connecting"
              ? "connecting…"
              : "offline · recovering";

  return (
    <div className="panel">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <strong>Migration room</strong>
        <span
          className={`badge${realtimeStatus === "connected" ? " green" : ""}`}
          role="status"
          title={realtimeError ?? undefined}
        >
          {connectionLabel}
        </span>
      </div>

      {realtimeError ? (
        <p
          role="alert"
          style={{ color: "var(--amber)", fontSize: 12, margin: "8px 0 0" }}
        >
          {realtimeError}
        </p>
      ) : null}

      <div
        style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}
      >
        {presence.length ? (
          presence.map((presentParticipant) => (
            <span
              key={presentParticipant.userId}
              className="badge"
              title={`${presentParticipant.name} (${presentParticipant.role})`}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: "var(--brand)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                }}
              >
                {presentParticipant.name.slice(0, 1).toUpperCase()}
              </span>
              {presentParticipant.name} · {presentParticipant.role}
            </span>
          ))
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            {readOnly
              ? "Public viewer"
              : auth.status === "ready"
              ? "Waiting for room presence…"
              : "Loading participant…"}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {room.comments.map((comment, index) => (
          <div
            key={`${comment.createdAt}-${index}`}
            style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}
          >
            <div style={{ fontSize: 12 }}>
              <strong>{comment.participantName}</strong>{" "}
              <span className="muted">· {comment.role}</span>
            </div>
            <div style={{ fontSize: 14 }}>{comment.body}</div>
          </div>
        ))}
      </div>

      <div className="room-comment-composer">
        <div className="room-comment-field">
          <label className="field-label" htmlFor="room-comment">
            Comment
          </label>
          <textarea
            id="room-comment"
            className="room-comment-textarea"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (commentState.status !== "idle") {
                setCommentState({ status: "idle" });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={
              canComment
                ? "Comment…"
                : readOnly
                  ? "Read-only demo"
                  : "Participant access required"
            }
            disabled={!canComment || commentBusy}
            maxLength={2000}
            rows={2}
          />
        </div>
        <button
          type="button"
          className="btn secondary"
          onClick={() => void send()}
          disabled={!canComment || commentBusy || !draft.trim()}
          aria-busy={commentBusy}
        >
          {commentBusy ? "Sending…" : "Send"}
        </button>
      </div>

      {commentState.status === "error" ||
      commentState.status === "success" ? (
        <p
          role={commentState.status === "error" ? "alert" : "status"}
          style={{
            color:
              commentState.status === "error"
                ? "var(--amber)"
                : "var(--green)",
            fontSize: 12,
            margin: "8px 0 0",
          }}
        >
          {commentState.message}
        </p>
      ) : null}

      {room.approvals.length ? (
        room.approvals.map((approval, index) => (
          <div
            key={`${approval.createdAt}-${index}`}
            className="muted"
            style={{ fontSize: 12, marginTop: 10 }}
          >
            ✓ {approval.decision} by {approval.participantName}
            {approval.note ? ` — “${approval.note}”` : ""}
          </div>
        ))
      ) : auth.participant?.role === "provider" ? (
        <>
          <button
            type="button"
            className="btn"
            style={{
              width: "100%",
              marginTop: 12,
              justifyContent: "center",
            }}
            onClick={() => void approve()}
            disabled={
              approvalBusy || room.status !== "ready_for_review"
            }
            aria-busy={approvalBusy}
          >
            {approvalBusy
              ? "Approving…"
              : room.status === "ready_for_review"
                ? "Approve migration"
                : "Awaiting validated plan"}
          </button>
          {approvalState.status === "error" ||
          approvalState.status === "success" ? (
            <p
              role={approvalState.status === "error" ? "alert" : "status"}
              style={{
                color:
                  approvalState.status === "error"
                    ? "var(--amber)"
                    : "var(--green)",
                fontSize: 12,
                margin: "8px 0 0",
              }}
            >
              {approvalState.message}
            </p>
          ) : null}
        </>
      ) : auth.status === "ready" ? (
        <p className="muted" style={{ fontSize: 12, margin: "12px 0 0" }}>
          Provider approval required.
        </p>
      ) : null}
    </div>
  );
}
