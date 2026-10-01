# Kirana Shop AI: end-to-end workflow

The single reference for what we build. PLAN.md covers schedule and priorities; this covers how it works.

## 1. People and systems

| Who / what | Role |
|---|---|
| Shopkeeper (merchant) | Uses the merchant app: Counter, Khata, Salaahkaar, orders |
| Customer | Pays at the counter, or orders from the QR storefront |
| Supplier | Off-system. Receives a drafted reorder message once the shopkeeper approves |
| Paytm Payment Gateway (staging) | Checkout, payment confirmation (webhook), transaction-status check |
| Sarvam | Speech-to-text, text-to-speech (Hindi/Hinglish), parchi OCR |
| LLM | Extracts items from text; runs Salaahkaar's tool calls; phrases answers |
| n8n | Executes approved actions and notifications |
| Cognee (stretch) | Merchant memory: suppliers, accepted/rejected suggestions |

## 2. The one rule that ties it together

Every money-related change flows from **one verified event**: `bill.paid`.
Nothing marks a bill paid except (a) a Paytm webhook that passes signature check **and** a transaction-status call that confirms success and the exact amount, or (b) the shopkeeper marking cash received.

`bill.paid` then triggers: stock decrement → Khata update (if it settles udhaar) → "₹X prapt hue" voice → live merchant dashboard update → insight re-check → optional n8n notification.

## 3. Journey A: Counter billing (walk-in)

1. **Choose input.** Scan / Photo / Voice / Parchi.
2. **Turn input into items.**
   - *Parchi*: photo → OpenAI vision (Responses API, strict JSON schema) → items as written. (Sarvam Document Intelligence is an async job API with undocumented handwriting support, so it is not on the live path.) A cached reading of the demo parchi is the labelled fallback.
   - *Voice*: audio → Sarvam STT (Hindi, code-mixed) → text.
   - *Barcode*: camera → barcode → direct product lookup (no AI).
   - *Photo*: stretch goal; treat like parchi with a vision model.
3. **Extract.** LLM returns strict JSON: `[{raw, name, qty, legible}]`. No prices and no product mapping from the LLM; `legible: false` forces a shopkeeper check.
4. **Match to catalogue.** Fuzzy match + Hinglish aliases (`doodh → Toned milk 500ml`, `biskut → Glucose biscuit 250g`). Each line gets a confidence score.
   - ≥ 0.8: accepted, price from catalogue.
   - < 0.8: **flagged**, shows top-2 candidates for the shopkeeper to pick.
5. **Review and confirm.** Shopkeeper fixes flagged lines, taps Confirm. Bill goes `DRAFT → CONFIRMED`. Stock is not touched yet.
6. **Choose payment.**
   - **Paytm**: server creates a Paytm order (initiate transaction → txn token) → customer pays via checkout / QR on their phone (staging test instruments) → Paytm sends callback/webhook → server verifies signature + calls Transaction Status → `bill.paid`.
   - **Cash**: shopkeeper taps "Cash received" → `bill.paid`.
   - **Udhaar**: pick customer → Khata debit entry → bill `ON_CREDIT` (stock still decrements; money is owed).
7. **Downstream** (from section 2).

## 4. Journey B: QR storefront (online order)

1. Customer scans the shop's QR → `/s/{shop}` storefront.
2. Sees the **same catalogue** with live stock (out-of-stock items disabled).
3. Cart → name, phone, pickup or delivery → order `CREATED` (a bill with `channel = online`).
4. Paytm checkout → webhook → verification → `bill.paid`.
5. Merchant app gets a live "New order" alert. Shopkeeper moves it `Received → Preparing → Ready`; the customer's page updates.

## 5. Journey C: Khata (udhaar)

1. Debit entries come from udhaar bills (or manual entry). Payments create credit entries.
2. Each customer shows: balance, oldest unpaid date, ageing bucket (0–15, 16–30, 30+ days).
3. **Reminder**: LLM drafts a short polite Hindi message from a fixed template + a Paytm payment link. Status `PENDING`.
4. Shopkeeper taps **Approve & send** → n8n "sends" it. For the demo this lands in a visible outbox (or a WhatsApp click-to-chat link). We do not claim WhatsApp Business API sending.
5. Customer pays via the link → webhook → verification → credit entry → balance reconciles automatically.

## 6. Journey D: Salaahkaar (the AI core)

1. Shopkeeper taps the mic and speaks, e.g. *"Aaj kitna sale hua, aur kya khatam hone wala hai?"* (typed input is always available as fallback).
2. Sarvam STT → transcript shown on screen.
3. **Agent loop.** LLM with a system prompt (answer in Hinglish, short, spoken style) and tools. It may only state numbers returned by tools.

   | Tool | Returns |
   |---|---|
   | `get_sales_summary(period)` | total, bill count, vs same weekday last week |
   | `get_low_stock()` | items below reorder level |
   | `forecast_runout(sku?)` | hours until stock-out, based on recent sales rate |
   | `get_slow_movers(days)` | items with lowest sales vs stock held |
   | `get_overdue_dues(min_days)` | customers, amounts, days overdue |
   | `propose_reorder(sku, qty)` | creates a `PENDING` action + supplier message draft |
   | `propose_reminder(customer_id)` | creates a `PENDING` action + reminder draft |

   There is **no** tool that moves money, and no tool that sends anything without approval.
4. **Answer** = short Hinglish text + number cards with their source ("aaj ke 63 bills · stock register") + action cards.
5. Sarvam TTS speaks the answer in Hindi.
6. **Approval.** Tap Approve, or say *"haan, bhej do"* → a small intent check maps it to the pending action → action `APPROVED → EXECUTED` via n8n → logged. Reject = `REJECTED`, also logged.
7. (Stretch) Cognee stores the decision and supplier details, so the next suggestion can say "last time you ordered 2 crates from Ramesh Dairy".

**Proactive nudges**: after each `bill.paid`, the insight engine re-checks rules (run-out in < 12 h, dues > 30 days). New findings appear as cards in Salaahkaar's feed.

## 7. Insight engine (plain code, no LLM)

- **Sales today**: sum of paid bills today; compare with same weekday last week.
- **Run-out forecast**: units sold per hour for this item over the last 7 days (for the current time window) → `hours_left = stock / rate`. Flag if it runs out before the next usual restock (config, e.g. 9 AM).
- **Slow movers**: lowest units sold in 14 days relative to stock held.
- **Overdue dues**: Khata balances by age of the oldest unpaid entry.
- Every result carries a `source` string the UI displays.

## 8. Data model (first cut)

- `merchants` (one demo store)
- `products` (sku, name, aliases[], price, unit, stock, reorder_level, barcode)
- `customers` (name, phone)
- `bills` (channel: counter/online, status: DRAFT/CONFIRMED/PAID/ON_CREDIT, total, customer_id)
- `bill_items` (product_id, qty, price, source: parchi/voice/scan/manual, confidence)
- `payments` (provider, order_id, txn_id, amount, status, verified_at, raw payload)
- `stock_movements` (product_id, delta, reason, bill_id)
- `khata_entries` (customer_id, type: debit/credit, amount, bill_id / payment_id)
- `actions` (type: reorder/reminder, payload, draft_text, status: PENDING/APPROVED/REJECTED/EXECUTED)
- `events` (append-only log: bill.paid, action.executed, …) shown as the live "system log" in the demo

## 9. Screens

Merchant app: **Counter** (input tabs, line review, payment choice) · **Orders** (live online orders) · **Khata** (ledger, reminders) · **Salaahkaar** (voice chat, number cards, action cards) · **Live log** (events, for judges).
Customer: **Storefront** · **Cart/checkout** · **Order status**.

## 10. Demo script (≈3 minutes)

1. (20 s) Problem in one line; show the demo store.
2. (40 s) Photograph a handwritten parchi → bill appears; one line flagged; shopkeeper picks the right biscuit.
3. (40 s) Customer phone pays via Paytm staging → merchant screen: "₹202 prapt hue", stock drops, event log shows verified webhook.
4. (50 s) Ask Salaahkaar in Hindi → spoken answer with numbers and source → reorder card → "haan, bhej do" → action executed in n8n.
5. (30 s) Storefront order arrives live; Khata reminder approved. Close on business model and pilot metrics.

## 11. Out of scope (say so if asked)

Soundbox hardware integration, production Paytm (needs normal merchant onboarding), real WhatsApp Business sending, lending/credit scoring, multi-store, inventory purchasing from suppliers.
