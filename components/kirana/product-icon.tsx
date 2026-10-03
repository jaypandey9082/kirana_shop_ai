import {
  Apple, Bath, Battery, Bean, Box, Brush, Bug, Candy, Carrot, Cherry, Citrus, Coffee, Container, Cookie, Croissant,
  CupSoda, Droplet, Droplets, Egg, Flame, GlassWater, Leaf, Milk, Package, Popcorn, ShoppingBasket, ShowerHead, Soup,
  SprayCan, Sprout, Trash2, Utensils, WashingMachine, Wheat, Wind, type LucideIcon,
} from "lucide-react";

/** Category colour pairs (all text/background pairs ≥ 4.5:1). */
const TINT: Record<string, string> = {
  "Dairy & bakery": "bg-sky-100 text-blue-700",
  Fresh: "bg-green-100 text-green-700",
  Staples: "bg-warning-tint text-warning",
  "Biscuits & snacks": "bg-orange-100 text-orange-700",
  "Oil, spices & tea": "bg-warning-tint text-warning",
  Beverages: "bg-sky-100 text-blue-700",
  "Personal care & home": "bg-violet-100 text-violet-700",
};

/** First keyword that appears in the product name wins. Generic product names only (no brands). */
const BY_NAME: Array<[RegExp, LucideIcon]> = [
  [/milk/i, Milk], [/curd|dahi/i, Soup], [/paneer/i, Box], [/butter/i, Package], [/bread|pav|rusk/i, Croissant],
  [/egg/i, Egg], [/biscuit|cracker/i, Cookie], [/chips|bhujia|namkeen/i, Popcorn], [/noodle/i, Soup], [/chocolate/i, Candy],
  [/atta|rice|poha|rava|besan/i, Wheat], [/dal/i, Bean], [/sugar|salt/i, Container], [/hair oil/i, Droplets], [/oil/i, Droplet],
  [/chilli|garam/i, Flame], [/turmeric|jeera|tea/i, Leaf], [/coffee/i, Coffee], [/water/i, GlassWater], [/cola|drink|soda/i, CupSoda],
  [/soap/i, Bath], [/shampoo/i, ShowerHead], [/tooth/i, Brush], [/detergent/i, WashingMachine], [/dishwash/i, Utensils],
  [/floor/i, SprayCan], [/mosquito/i, Bug], [/match|candle/i, Flame], [/agarbatti/i, Wind], [/batter/i, Battery],
  [/garbage/i, Trash2], [/tomato/i, Cherry], [/lemon/i, Citrus], [/ginger/i, Sprout], [/onion/i, Apple], [/potato/i, Carrot],
];

export function productVisual(name: string, category: string): { Icon: LucideIcon; tint: string } {
  const Icon = BY_NAME.find(([re]) => re.test(name))?.[1] ?? ShoppingBasket;
  return { Icon, tint: TINT[category] ?? "bg-canvas text-muted" };
}

export function ProductIcon({ name, category, className = "h-10 w-10", iconClass = "" }: { name: string; category: string; className?: string; iconClass?: string }) {
  const { Icon, tint } = productVisual(name, category);
  return <span className={`grid shrink-0 place-items-center rounded-xl ${tint} ${className}`} aria-hidden="true"><Icon className={iconClass} /></span>;
}
