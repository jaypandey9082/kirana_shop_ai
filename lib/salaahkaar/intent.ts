/** Voice/typed approval intent. Pure, safe for client and server. */
import { normalize } from "@/lib/matcher";

const YES = ["haan", "han", "ha", "haa", "yes", "ok", "okay", "theek hai", "thik hai", "bhej do", "bhejo", "kar do", "karo", "approve", "हाँ", "हां", "भेज दो", "कर दो", "ठीक है"];
const NO = ["nahi", "nahin", "na", "no", "mat", "baad mein", "rehne do", "cancel", "नहीं", "मत", "बाद में", "रहने दो"];

/** "Haan, bhej do" → approve; "nahi, baad mein" → reject; anything else → null. */
export function classifyApproval(text: string): "approve" | "reject" | null {
  const t = ` ${normalize(text)} `;
  const has = (words: string[]) => words.some((w) => t.includes(` ${normalize(w)} `));
  if (has(NO)) return "reject";
  if (has(YES) && t.trim().split(" ").length <= 6) return "approve";
  return null;
}
