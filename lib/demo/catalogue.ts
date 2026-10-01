/**
 * Demo catalogue for "Sharma General Store" (synthetic).
 * Prices are illustrative demo prices in whole rupees; they are stored as paise.
 * Generic product names only (no brands). `demand` is average units sold per day
 * and drives the synthetic sales history. `targetStock` pins the stock a product
 * must have right after a demo reset (used to stage the golden-path insight).
 */
export interface CatalogueItem {
  sku: string;
  name: string;
  category: string;
  unit: string;
  priceRupees: number;
  aliases: string[];
  demand: number;
  reorderLevel: number;
  /** Stock level a restock brings the shelf back up to. */
  par: number;
  restock: "daily" | "weekly";
  targetStock?: number;
}

const item = (
  sku: string, name: string, category: string, unit: string, priceRupees: number,
  aliases: string[], demand: number, reorderLevel: number, par: number,
  restock: "daily" | "weekly" = "weekly", targetStock?: number,
): CatalogueItem => ({ sku, name, category, unit, priceRupees, aliases, demand, reorderLevel, par, restock, targetStock });

export const CATALOGUE: CatalogueItem[] = [
  // Dairy & bakery (restocked every morning)
  item("DAI-001", "Toned milk 500ml", "Dairy & bakery", "packet", 27, ["doodh", "dudh", "milk", "toned doodh", "दूध"], 42, 20, 50, "daily", 8),
  item("DAI-002", "Full cream milk 500ml", "Dairy & bakery", "packet", 34, ["full cream", "malai doodh", "gold doodh"], 10, 8, 18, "daily"),
  item("DAI-003", "Curd 400g", "Dairy & bakery", "cup", 35, ["dahi", "curd", "दही"], 8, 6, 14, "daily"),
  item("DAI-004", "Paneer 200g", "Dairy & bakery", "pack", 90, ["paneer", "पनीर"], 3, 3, 8, "daily"),
  item("DAI-005", "Butter 100g", "Dairy & bakery", "pack", 58, ["butter", "makhan", "मक्खन"], 2, 4, 12),
  item("DAI-006", "Bread 400g", "Dairy & bakery", "loaf", 45, ["bread", "double roti", "ब्रेड"], 12, 6, 18, "daily"),
  item("DAI-007", "Pav 6 pcs", "Dairy & bakery", "pack", 30, ["pav", "pao", "laadi pav"], 10, 6, 18, "daily"),
  item("DAI-008", "Eggs 6 pcs", "Dairy & bakery", "tray", 48, ["egg", "eggs", "anda", "ande", "अंडे"], 6, 8, 24),

  // Biscuits & snacks
  item("SNK-001", "Glucose biscuit 250g", "Biscuits & snacks", "pack", 25, ["biscuit", "biskut", "glucose", "बिस्कुट"], 8, 12, 40),
  item("SNK-002", "Marie biscuit 150g", "Biscuits & snacks", "pack", 30, ["marie", "mari", "biskut"], 3, 8, 24),
  item("SNK-003", "Cream biscuit 120g", "Biscuits & snacks", "pack", 30, ["cream biscuit", "cream biskut"], 3, 8, 24),
  item("SNK-004", "Salted crackers 200g", "Biscuits & snacks", "pack", 35, ["crackers", "namkeen biscuit"], 2, 6, 18),
  item("SNK-005", "Potato chips 52g", "Biscuits & snacks", "pack", 20, ["chips", "wafers", "wafer"], 8, 15, 45),
  item("SNK-006", "Aloo bhujia 200g", "Biscuits & snacks", "pack", 55, ["bhujia", "namkeen", "sev"], 3, 6, 20),
  item("SNK-007", "Instant noodles 70g", "Biscuits & snacks", "pack", 14, ["noodles", "noodle", "masala noodles"], 10, 20, 60),
  item("SNK-008", "Rusk 300g", "Biscuits & snacks", "pack", 45, ["rusk", "toast"], 2, 5, 15),
  item("SNK-009", "Chocolate bar 40g", "Biscuits & snacks", "bar", 40, ["chocolate", "choco"], 2, 8, 30),

  // Staples
  item("STP-001", "Atta 5kg", "Staples", "bag", 265, ["atta", "aata", "gehu atta", "आटा"], 2, 4, 12),
  item("STP-002", "Basmati rice 1kg", "Staples", "pack", 120, ["basmati", "chawal", "rice", "चावल"], 1.5, 4, 14),
  item("STP-003", "Sona masoori rice 5kg", "Staples", "bag", 320, ["sona masoori", "chawal 5kg", "kolam"], 0.6, 3, 8),
  item("STP-004", "Toor dal 1kg", "Staples", "pack", 165, ["toor dal", "arhar dal", "tuvar dal", "dal", "दाल"], 1.5, 5, 15),
  item("STP-005", "Moong dal 500g", "Staples", "pack", 75, ["moong", "moong dal"], 0.8, 4, 10),
  item("STP-006", "Chana dal 1kg", "Staples", "pack", 110, ["chana dal"], 0.6, 3, 9),
  item("STP-007", "Sugar 1kg", "Staples", "pack", 48, ["sugar", "cheeni", "shakkar", "चीनी"], 5, 10, 30),
  item("STP-008", "Iodised salt 1kg", "Staples", "pack", 28, ["salt", "namak", "नमक"], 2, 8, 20),
  item("STP-009", "Poha 500g", "Staples", "pack", 40, ["poha", "pohe"], 1.5, 5, 14),
  item("STP-010", "Rava 500g", "Staples", "pack", 35, ["rava", "sooji", "suji"], 1.2, 4, 12),
  item("STP-011", "Besan 500g", "Staples", "pack", 60, ["besan", "gram flour"], 0.8, 4, 10),

  // Oils, spices & tea
  item("OIL-001", "Sunflower oil 1L", "Oil, spices & tea", "pouch", 155, ["sunflower oil", "refined tel", "refined oil", "tel"], 2, 5, 15),
  item("OIL-002", "Mustard oil 1L", "Oil, spices & tea", "bottle", 170, ["sarson tel", "mustard oil"], 0.6, 3, 8),
  item("OIL-003", "Groundnut oil 1L", "Oil, spices & tea", "pouch", 190, ["groundnut oil", "moongphali tel", "singdana tel"], 0.5, 3, 6),
  item("SPC-001", "Turmeric powder 100g", "Oil, spices & tea", "pack", 30, ["haldi", "turmeric"], 1.2, 6, 20),
  item("SPC-002", "Red chilli powder 100g", "Oil, spices & tea", "pack", 40, ["lal mirch", "mirchi powder", "chilli powder"], 1.2, 6, 18),
  item("SPC-003", "Garam masala 50g", "Oil, spices & tea", "pack", 45, ["garam masala", "masala"], 0.7, 4, 15),
  item("SPC-004", "Jeera 100g", "Oil, spices & tea", "pack", 55, ["jeera", "zeera", "cumin"], 0.7, 4, 12),
  item("TEA-001", "Tea 250g", "Oil, spices & tea", "pack", 140, ["chai patti", "chai", "tea", "चाय"], 2, 5, 16),
  item("TEA-002", "Instant coffee 50g", "Oil, spices & tea", "jar", 170, ["coffee", "kofi"], 0.4, 3, 8),

  // Beverages
  item("BEV-001", "Cola 750ml", "Beverages", "bottle", 40, ["cold drink", "cola", "thanda"], 4, 8, 24),
  item("BEV-002", "Drinking water 1L", "Beverages", "bottle", 20, ["paani", "pani", "water", "water bottle"], 10, 15, 48),
  item("BEV-003", "Mango drink 600ml", "Beverages", "bottle", 35, ["mango drink", "aam drink"], 2, 6, 20),
  item("BEV-004", "Lemon soda 250ml", "Beverages", "bottle", 20, ["soda", "nimbu soda"], 1.5, 6, 20),

  // Personal care & home
  item("HOM-001", "Bath soap 100g", "Personal care & home", "bar", 38, ["sabun", "soap", "साबुन"], 3, 10, 30),
  item("HOM-002", "Shampoo sachet", "Personal care & home", "sachet", 2, ["shampoo", "shampoo pouch"], 12, 40, 120),
  item("HOM-003", "Toothpaste 150g", "Personal care & home", "tube", 95, ["toothpaste", "paste", "manjan"], 1.2, 5, 14),
  item("HOM-004", "Toothbrush", "Personal care & home", "piece", 25, ["toothbrush", "brush"], 0.6, 5, 15),
  item("HOM-005", "Coconut hair oil 200ml", "Personal care & home", "bottle", 110, ["nariyal tel", "coconut oil", "hair oil"], 0.6, 3, 10),
  item("HOM-006", "Detergent powder 1kg", "Personal care & home", "pack", 120, ["washing powder", "detergent", "kapde ka powder"], 1.5, 5, 14),
  item("HOM-007", "Dishwash bar 200g", "Personal care & home", "bar", 22, ["dishwash", "bartan sabun", "bartan bar"], 2, 8, 24),
  item("HOM-008", "Floor cleaner 500ml", "Personal care & home", "bottle", 105, ["phenyl", "floor cleaner", "pocha liquid"], 0.6, 3, 8),
  item("HOM-009", "Mosquito coil 10 pcs", "Personal care & home", "box", 40, ["coil", "machhar coil", "mosquito coil"], 0.8, 4, 12),
  item("HOM-010", "Matchbox", "Personal care & home", "box", 2, ["maachis", "matchbox", "machis"], 3, 20, 60),
  item("HOM-011", "Agarbatti pack", "Personal care & home", "pack", 50, ["agarbatti", "incense"], 0.8, 5, 15),
  item("HOM-012", "Candles 6 pcs", "Personal care & home", "pack", 35, ["candle", "mombatti"], 0.4, 3, 10),
  item("HOM-013", "AA batteries 2 pcs", "Personal care & home", "pack", 40, ["battery", "cell", "AA cell"], 0.4, 4, 12),
  item("HOM-014", "Garbage bags 15 pcs", "Personal care & home", "roll", 60, ["garbage bag", "kachra bag", "dustbin bag"], 0.5, 4, 10),

  // Fresh produce (restocked every morning)
  item("FRS-001", "Onion 1kg", "Fresh", "kg", 40, ["pyaz", "kanda", "onion", "प्याज"], 5, 10, 30, "daily"),
  item("FRS-002", "Potato 1kg", "Fresh", "kg", 35, ["aloo", "batata", "potato", "आलू"], 5, 10, 30, "daily"),
  item("FRS-003", "Tomato 1kg", "Fresh", "kg", 45, ["tamatar", "tomato", "टमाटर"], 3, 6, 15, "daily"),
  item("FRS-004", "Ginger 100g", "Fresh", "pack", 15, ["adrak", "ginger"], 1.5, 4, 12, "daily"),
  item("FRS-005", "Lemon 4 pcs", "Fresh", "pack", 20, ["nimbu", "lemon"], 2, 6, 20, "daily"),
];
