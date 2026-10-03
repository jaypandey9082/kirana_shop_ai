/** Demo distributors (synthetic). Each has a public demo page at /d/<slug>. */
export interface DemoSupplier { slug: string; name: string; area: string; categories: string[] }

export const DEMO_SUPPLIER_LIST: DemoSupplier[] = [
  { slug: "ganesh-dairy", name: "Ganesh Dairy (demo supplier)", area: "Andheri East", categories: ["Dairy & bakery"] },
  { slug: "mahalaxmi", name: "Mahalaxmi Distributors (demo supplier)", area: "Masjid Bunder", categories: ["Biscuits & snacks", "Beverages"] },
  { slug: "shree-grains", name: "Shree Grains (demo supplier)", area: "Vashi APMC", categories: ["Staples", "Oil, spices & tea"] },
  { slug: "city-fmcg", name: "City FMCG Traders (demo supplier)", area: "Dadar", categories: ["Personal care & home"] },
  { slug: "vashi-mandi", name: "Vashi Sabzi Mandi (demo supplier)", area: "Vashi", categories: ["Fresh"] },
];
const LOCAL: DemoSupplier = { slug: "local", name: "Local supplier (demo)", area: "Mumbai", categories: [] };

/** Distributor for a product category (used by reorder drafts). */
export const supplierForCategory = (category: string): DemoSupplier =>
  DEMO_SUPPLIER_LIST.find((s) => s.categories.includes(category)) ?? LOCAL;
export const supplierFor = (category: string) => supplierForCategory(category).name;
export const supplierBySlug = (slug: string) => (slug === LOCAL.slug ? LOCAL : DEMO_SUPPLIER_LIST.find((s) => s.slug === slug) ?? null);
export const supplierByName = (name: string) => DEMO_SUPPLIER_LIST.find((s) => s.name === name) ?? LOCAL;

/**
 * Demo distributor rate: catalogue price less a 15% retail margin (an assumption for the demo,
 * labelled as such in the UI). Real rates would come from the distributor's price list.
 */
export const DEMO_MARGIN = 0.15;
export const demoCostPaise = (pricePaise: number) => Math.round((pricePaise * (1 - DEMO_MARGIN)) / 100) * 100; // whole rupees
