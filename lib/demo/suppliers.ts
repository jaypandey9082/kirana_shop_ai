/** Demo suppliers by category (synthetic, for reorder message drafts only). */
export const DEMO_SUPPLIERS: Record<string, string> = {
  "Dairy & bakery": "Ganesh Dairy (demo supplier)",
  "Biscuits & snacks": "Mahalaxmi Distributors (demo supplier)",
  Staples: "Shree Grains (demo supplier)",
  "Oil, spices & tea": "Shree Grains (demo supplier)",
  Beverages: "Mahalaxmi Distributors (demo supplier)",
  "Personal care & home": "City FMCG Traders (demo supplier)",
  Fresh: "Vashi Sabzi Mandi (demo supplier)",
};
export const supplierFor = (category: string) => DEMO_SUPPLIERS[category] ?? "Local supplier (demo)";
