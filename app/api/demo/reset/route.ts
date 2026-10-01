import { timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db/client";
import { resetDemo } from "@/lib/demo/reset";

const noStore = { "Cache-Control": "no-store" };

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST /api/demo/reset — restores the deterministic demo data. Disabled unless explicitly enabled. */
export async function POST(request: Request) {
  const secret = process.env.DEMO_RESET_SECRET ?? "";
  if (process.env.DEMO_RESET_ENABLED !== "true" || secret.length < 16) {
    return Response.json({ error: "Demo reset is disabled." }, { status: 404, headers: noStore });
  }
  if (!secretMatches(request.headers.get("x-demo-reset-secret"), secret)) {
    return Response.json({ error: "Not authorised." }, { status: 401, headers: noStore });
  }
  try {
    const summary = await resetDemo(getSql());
    return Response.json({ ok: true, ...summary }, { headers: noStore });
  } catch (error) {
    console.error("demo reset failed", error);
    return Response.json({ error: "Reset failed. Check the server log." }, { status: 500, headers: noStore });
  }
}
