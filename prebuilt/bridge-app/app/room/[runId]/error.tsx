"use client";

export default function RoomError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container">
      <p className="muted mono">migration room / unavailable</p>
      <h1>Bridge could not load this run.</h1>
      <p className="muted">
        The database did not return authoritative migration state. No fallback
        evidence has been shown.
      </p>
      <button className="btn" type="button" onClick={reset}>
        Retry
      </button>
    </main>
  );
}
