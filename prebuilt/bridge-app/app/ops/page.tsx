import Link from "next/link";
import { DemoResetControl } from "@/components/DemoResetControl";

export const dynamic = "force-dynamic";

export default function OperationsPage() {
  const runId = process.env.NEXT_PUBLIC_DEMO_RUN_ID?.trim() ?? "";
  const demoMode = process.env.DEMO_MODE === "true";

  return (
    <main className="container">
      <Link href="/" className="muted">
        ← Bridge
      </Link>
      <h1>Demo operations</h1>
      <DemoResetControl demoMode={demoMode} runId={runId} />
    </main>
  );
}
