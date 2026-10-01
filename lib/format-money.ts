/** Integer paise only; null is unavailable, not a zero balance. */
export function formatMoney(paise: number | null): string {
  if (paise === null) return "—";
  if (!Number.isSafeInteger(paise)) throw new TypeError("Money must be integer paise");
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: paise % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(paise / 100);
}
