export function GET() {
  return Response.json(
    { status: "ok", service: "kirana-shop-ai", scope: "app-only" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
