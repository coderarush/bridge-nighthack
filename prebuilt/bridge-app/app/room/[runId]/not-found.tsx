import Link from "next/link";

export default function RoomNotFound() {
  return (
    <main className="container">
      <p className="muted mono">404 / migration room</p>
      <h1>This migration run does not exist.</h1>
      <p className="muted">
        The run may have been reset, or the room link is incomplete.
      </p>
      <Link className="btn" href="/change/atlaspay-v2">
        Open the AtlasPay change
      </Link>
    </main>
  );
}
