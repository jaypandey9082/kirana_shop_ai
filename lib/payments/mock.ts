/**
 * Mock gateway for demos without Paytm credentials. It behaves like an external
 * gateway: the customer's choice is stored on the "gateway side", and our server
 * still has to call verify() before anything is marked paid. Always labelled as mock.
 */
import type { Tx } from "@/lib/db/client";
import type { PaymentProvider } from "./types";

export class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly label = "Mock payment";
  constructor(private sql: Tx) {}

  async createOrder({ orderId, amountPaise }: { orderId: string; amountPaise: number }) {
    await this.sql`insert into mock_gateway_orders (order_id, amount_paise) values (${orderId}, ${amountPaise})
                   on conflict (order_id) do nothing`;
    return { provider: this.name, orderId, amountPaise };
  }

  async verify(orderId: string) {
    const [o] = await this.sql<{ order_id: string; amount_paise: number; status: string; txn_id: string | null }[]>`
      select order_id, amount_paise, status, txn_id from mock_gateway_orders where order_id = ${orderId}`;
    if (!o) return { status: "NOT_FOUND" as const, orderId: null, amountPaise: null, txnId: null, raw: null };
    // An order the customer hasn't acted on has no transaction yet (like an unpaid gateway order).
    const status = o.status === "SUCCESS" ? "SUCCESS" as const : o.status === "FAILED" ? "FAILED" as const : "NOT_FOUND" as const;
    return { status, orderId: o.order_id, amountPaise: o.amount_paise, txnId: o.txn_id, raw: { mock: true, ...o } };
  }

  /** What the customer does on the mock pay page. */
  async customerOutcome(orderId: string, outcome: "success" | "failure") {
    const txnId = outcome === "success" ? `MOCKTXN${Date.now()}` : null;
    const rows = await this.sql`update mock_gateway_orders set status = ${outcome === "success" ? "SUCCESS" : "FAILED"},
                                txn_id = ${txnId}, updated_at = now()
                                where order_id = ${orderId} and status = 'CREATED' returning order_id`;
    return rows.length > 0;
  }
}
