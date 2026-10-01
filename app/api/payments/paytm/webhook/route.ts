import { handlePaytmNotification, readPaytmFields } from "@/lib/payments/paytm-notify";

/** Paytm Payment Status webhook (configure in the Paytm dashboard; HTTPS on port 443 only). */
export async function POST(request: Request) {
  try {
    const result = await handlePaytmNotification(await readPaytmFields(request), "webhook");
    return Response.json(result, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("paytm webhook failed", error);
    return Response.json({ error: "Verification failed; Paytm may retry." }, { status: 500 });
  }
}
