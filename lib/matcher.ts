/**
 * Catalogue matcher: turns free text ("2 doodh, 1 bread, 3 biskut") into catalogue
 * lines with a confidence score. Pure and deterministic, safe for client and server.
 * Prices never come from here; callers price lines from the catalogue.
 */
export interface MatchableProduct {
  id: string;
  name: string;
  aliases: readonly string[];
  barcode?: string | null;
}

export interface MatchResult<P extends MatchableProduct = MatchableProduct> {
  query: string;
  product: P | null;
  confidence: number;
  /** True when the merchant must pick: low score, or two products score about the same. */
  needsReview: boolean;
  /** Best two options, for the "which one?" chips. */
  candidates: P[];
}

export const CONFIDENT = 0.8;
const UNMATCHED = 0.45;
const AMBIGUITY_MARGIN = 0.05;

export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : 1 - levenshtein(a, b) / max;
}

/** Score one query against one catalogue term (name or alias), 0..1. */
function scoreTerm(query: string, term: string): number {
  if (query === term) return 1;
  const q = query.split(" ");
  const t = term.split(" ");
  // Every query word appears in the term ("milk" in "toned milk 500ml").
  if (q.every((w) => t.includes(w))) return 0.8 + 0.1 * (q.length / t.length);
  // Fuzzy word match for typos and spelling variants ("biscut" ~ "biscuit").
  const perWord = q.map((w) => Math.max(...t.map((tw) => (w.length < 3 ? (w === tw ? 1 : 0) : similarity(w, tw)))));
  const avg = perWord.reduce((s, x) => s + x, 0) / perWord.length;
  return 0.9 * avg;
}

export function scoreProduct(query: string, product: MatchableProduct): number {
  const q = normalize(query);
  if (!q) return 0;
  if (product.barcode && /^\d{8,14}$/.test(q)) return q === product.barcode ? 1 : 0;
  const terms = [product.name, ...product.aliases].map(normalize);
  return Math.max(...terms.map((t) => scoreTerm(q, t)));
}

export function matchProduct<P extends MatchableProduct>(query: string, products: readonly P[]): MatchResult<P> {
  const ranked = products
    .map((p) => ({ p, s: scoreProduct(query, p) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name));
  const [top, second] = ranked;
  if (!top || top.s < UNMATCHED) return { query, product: null, confidence: top?.s ?? 0, needsReview: true, candidates: ranked.slice(0, 2).map((r) => r.p) };
  const ambiguous = !!second && second.s >= top.s - AMBIGUITY_MARGIN;
  const confidence = Math.round(top.s * 1000) / 1000;
  return {
    query, product: top.p, confidence,
    needsReview: confidence < CONFIDENT || ambiguous,
    candidates: ranked.slice(0, 2).map((r) => r.p),
  };
}

const NUMBER_WORDS: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, five: 5, chhe: 6, cheh: 6, six: 6, saat: 7, seven: 7,
  aath: 8, eight: 8, nau: 9, nine: 9, das: 10, ten: 10,
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
};
const FILLER = new Set(["packet", "packets", "pkt", "pc", "pcs", "piece", "pieces", "nos", "x", "पैकेट"]);

export interface ParsedLine { text: string; qty: number }

/** "2 doodh, 1 bread aur teen biskut" -> [{doodh,2},{bread,1},{biskut,3}] */
export function parseItemList(input: string): ParsedLine[] {
  return input
    .split(/[,;\n]+|\s+(?:aur|and|&|और)\s+/i)
    .map((seg) => normalize(seg))
    .filter(Boolean)
    .map((seg) => {
      let words = seg.split(" ");
      let qty = 1;
      const asQty = (w: string) => {
        const digits = w.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
        return /^\d{1,3}$/.test(digits) ? Number(digits) : NUMBER_WORDS[w];
      };
      if (words.length > 1 && asQty(words[0])) { qty = asQty(words[0])!; words = words.slice(1); }
      else if (words.length > 1 && asQty(words[words.length - 1])) { qty = asQty(words[words.length - 1])!; words = words.slice(0, -1); }
      words = words.filter((w) => !FILLER.has(w));
      return { text: words.join(" "), qty: Math.max(1, Math.min(qty, 99)) };
    })
    .filter((l) => l.text.length > 0);
}
