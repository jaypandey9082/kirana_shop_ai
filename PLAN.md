# Kirana Shop AI: build plan for the 3 Oct finale

Goal: in 8 hours, one demo journey that works live, end to end, with no hand-waving:

**parchi photo → confirmed bill → Paytm payment (staging) → verified webhook → stock + Khata update → Salaahkaar speaks an insight in Hindi → merchant says "haan" → action happens**

Everything else is seeded demo data that the golden path reads from.

## Components

| # | Component | What it does | Demo priority |
|---|-----------|--------------|---------------|
| 1 | Merchant app (mobile-first PWA) | Counter, Khata, Salaahkaar screens | Must |
| 2 | Customer storefront (opened from QR) | Catalogue, cart, Paytm checkout, order status | Should |
| 3 | Backend API | Products, bills, orders, stock movements, Khata, payment webhook | Must |
| 4 | Database + seed data | One demo store: ~60 SKUs, ~30 days of synthetic sales, a few customers with udhaar | Must |
| 5 | Payments adapter | Paytm PG staging: create order, JS Checkout, webhook + transaction-status verification. Same interface has a mock mode as a fallback | Must |
| 6 | Parchi and voice billing | Sarvam Document AI / STT → LLM extracts items → fuzzy match to catalogue → low-confidence lines flagged | Must (parchi), Should (voice) |
| 7 | Insight engine | Plain SQL/TypeScript, no LLM: today's sales, run-out forecast, slow movers, overdue dues | Must |
| 8 | Salaahkaar agent | STT → LLM with tools (the insight engine + action drafts) → grounded answer → Sarvam TTS in Hindi. Action cards need approval | Must |
| 9 | Automations (n8n) | Post-payment event, reminder / supplier message, optional morning summary | Should |
| 10 | Merchant memory (Cognee) | Remembers suppliers and which suggestions were accepted/rejected | Stretch |
| 11 | "Payment received" voice | After the webhook verifies, TTS says "₹202 prapt hue". Software only, not Soundbox hardware | Nice touch |

## Why each piece matters to judges
- **Real Paytm integration** (5, 11): the payment event drives everything downstream. Show the webhook log on screen.
- **AI that is grounded** (7, 8): numbers come from the insight engine; the LLM only chooses tools and phrases the answer. Salaahkaar shows its source.
- **Human in the loop** (6, 8): flagged parchi line, approval buttons. This is the trust story from the deck.
- **Partner stack** (Sarvam, n8n, Cognee): used where they genuinely fit, not bolted on.

## 8-hour schedule (10:00 to 18:00)
| Time | Build |
|------|-------|
| 10:00 to 10:30 | Env check, keys, seed DB, deploy skeleton so webhook URL is public |
| 10:30 to 12:30 | Counter: parchi → bill with confidence flags, confirm screen |
| 12:30 to 14:00 | Paytm staging checkout + webhook verification → stock and Khata update |
| 14:00 to 16:00 | Salaahkaar: tools, STT, TTS, approval cards |
| 16:00 to 17:00 | Storefront order + n8n action on approval |
| 17:00 to 18:00 | Freeze code, rehearse the 3-minute demo, record a backup video |

## Demo safety nets
- Typed input fallback if the mic or venue Wi-Fi misbehaves.
- Cached OCR result for the demo parchi.
- Payment adapter mock mode if Paytm staging is unreachable (say so if used).
- Two screens side by side: customer phone paying, merchant screen updating.
- Backup screen recording of a full run.

## Before 3 Oct (confirm with organisers what may be prepared in advance)
- Accounts and keys: Paytm Business staging credentials (MID + merchant key), Sarvam API key, LLM API key, n8n instance, Cognee, Supabase, Vercel.
- Hello-world each API once so there are no surprises on the day.
- Seed dataset design, demo parchi (handwritten, photographed), prompts, demo script.
- Ask in the finalist WhatsApp group whether starter code/boilerplate is allowed before the 8-hour window.
