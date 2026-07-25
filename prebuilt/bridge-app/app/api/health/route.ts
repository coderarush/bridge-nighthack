export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ ok: true, service: "bridge", ts: new Date().toISOString() });
}
