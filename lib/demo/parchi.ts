/**
 * The demo parchi (shown at /demo-parchi) and a CACHED reading of it.
 * The cached reading is a labelled fallback for when the AI or venue network is down.
 * It still goes through the same catalogue matcher, so "biskut" is still flagged.
 */
import type { ExtractedItem } from "@/lib/ai/extract";

export const DEMO_PARCHI_LINES = ["दूध 2", "bread - 1", "biskut 3", "namak"] as const;

export const DEMO_PARCHI_CACHED: ExtractedItem[] = [
  { raw: "दूध 2", name: "doodh", qty: 2, legible: true },
  { raw: "bread - 1", name: "bread", qty: 1, legible: true },
  { raw: "biskut 3", name: "biskut", qty: 3, legible: true },
  { raw: "namak", name: "namak", qty: 1, legible: true },
];
