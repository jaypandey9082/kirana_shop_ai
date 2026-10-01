import { handlePaytmNotification, readPaytmFields } from "@/lib/payments/paytm-notify";

/** Paytm posts here after checkout, from the customer's browser. Then we send them to the result page. */
export async function POST(request: Request) {
  const fields = await readPaytmFields(request);
  try {
    const result = await handlePaytmNotification(fields, "callback");
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.redirect(new URL(`/pay/${encodeURIComponent(result.orderId)}`, process.env.APP_URL || request.url), 303);
  } catch (error) {
    console.error("paytm callback failed", error);
    return Response.json({ error: "Could not verify the payment yet." }, { status: 500 });
  }
}
