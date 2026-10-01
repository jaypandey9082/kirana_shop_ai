/** Presentation fixtures only. Copy comes from UI_PROMPT.md; null is unavailable, never zero. */
export interface ShellFixture { shopName: string; dataMode: "demo"; paymentMode: "staging" | "mock" | "live-off" }
export const shellFixture: ShellFixture = { shopName: "Sharma General Store", dataMode: "demo", paymentMode: "live-off" };
export interface PreviewFixture {
  amountPaise: number | null; quantity: number | null; source: string; product: string;
  candidates: readonly [string, string]; customer: string; transcript: string; romanisation: string;
}
export const previewFixture: PreviewFixture = {
  amountPaise: null, quantity: null, source: "UI fixture only · database and insight tools not connected",
  product: "Toned milk", candidates: ["Glucose biscuit", "Marie biscuit"], customer: "Demo customer",
  transcript: "आज कितना सेल हुआ?", romanisation: "Aaj kitna sale hua?",
};
export const suggestions = ["Aaj kitna sale hua?", "Kya khatam hone wala hai?", "Kiska paisa baaki hai?"] as const;
