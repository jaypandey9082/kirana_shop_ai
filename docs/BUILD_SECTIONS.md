# Build sections

Finish and verify each section before proceeding to the next. API keys are deferred
at the user's request. The foundation must run without external service access.

1. **Project setup:** Next.js, TypeScript, Tailwind, folder structure, env template, ESLint, Vitest. Check: local app, checks and production build pass.
2. **Database and demo data:** schema, access policies, deterministic seed and protected reset. Check: known totals and repeatable reset.
3. **Merchant app shell:** mobile navigation and clear service/mode indicators. Check: all merchant screens open on mobile.
4. **Counter and bill review:** manual catalogue billing, matcher, confidence flags and confirmation. Check: catalogue prices and no stock changes before payment/credit.
5. **Payments and events:** mock and Paytm adapters, server verification, transactional stock/Khata updates. Check: mismatch rejection and idempotency.
6. **Parchi and voice:** OpenAI extraction, Sarvam speech, typed fallback and labelled cached demo. Check: uncertain lines require correction.
7. **Insight engine:** deterministic sales, stock, run-out, slow movers and dues. Check: tested results with sources.
8. **Salaahkaar:** seven tools, grounded Hinglish answers, voice and pending drafts. Check: source-backed numbers and approval before execution.
9. **Approvals and automation:** approve/reject, voice intent, n8n, authenticated callback and Outbox. Check: approved action executes once.
10. **Storefront and Khata:** QR catalogue, checkout, order status, ledger and reminders. Check: order and debt-settlement flows.
11. **Deployment and rehearsal:** Vercel, credentials, webhook, phone tests and backup recording. Check: three successful full rehearsals.

Cognee, product-photo recognition and morning summaries remain stretch work.
The user's latest plan selects OpenAI vision as primary parchi extraction and Sarvam
for speech; older workflow references to Sarvam OCR will be reconciled in Section 6.

## Section 1 scope

Completed: dependencies installed and locked; lint, strict type checking, one
Vitest liveness test and production build pass. The local starter page was checked
in the browser and `/api/health` returned HTTP 200. External integrations and
phone/PWA behavior have not been tested. Webpack and ESLint compatibility choices
are documented in the README.

No database migration, payment processing, AI request, deployment or business workflow
is implemented here. Integration folders are placeholders, not completed adapters.

## Section 3 scope

Completed (built by Codex, verified afterwards): design tokens, Geist + Noto Sans
Devanagari, merchant shell with mode badges, bottom navigation, Log access, and a
dev-only `/styleguide` with every component state. Screens show honest "not connected"
states; no business numbers are invented. Checks and production build pass; Counter
and Salaahkaar were viewed at 390 px.

## Section 2 scope

Completed: schema in `supabase/migrations/0001_init.sql` (money in integer paise,
append-only `events`, RLS enabled with no policies so Supabase's public roles get no
access), deterministic generator (`lib/demo/generate.ts`), transactional reset
(`lib/demo/reset.ts`), CLI (`npm run db:migrate`, `npm run db:reset`) and a protected
`POST /api/demo/reset` (disabled unless `DEMO_RESET_ENABLED=true` and a 16+ character
secret is sent in `x-demo-reset-secret`).

Demo data (synthetic): 60 generic products with Hinglish aliases, 45 days of sales
(~2,770 bills), 14 Khata customers with ₹11,640 outstanding (₹2,150 older than 30 days),
toned milk staged at 8 units. Verified by unit tests (`tests/demo-generate.test.ts`) and
database tests (`npm run test:db`): known totals, identical state after reset, stock
equals the movement ledger, bill totals equal items, event log rejects edits, RLS on.

Decision: development uses the local Postgres (`postgres:///kirana_dev`) through a
direct server connection (`lib/db/client.ts`). Moving to Supabase only needs its
connection string in `DATABASE_URL`; not yet tested against Supabase.

## Section 4 scope

Completed: catalogue matcher (`lib/matcher.ts`: Hinglish/Devanagari aliases, typo
tolerance, barcode match, ambiguity flag, typed-list parser), bill domain logic
(`lib/bills.ts`), routes (`/api/catalogue`, `/api/bills`, `/api/bills/:id`,
`/api/bills/:id/lines`, `/api/bills/:id/lines/:lineId`, `/api/bills/:id/confirm`), and
the Counter screen (Manual search + typed list, Scan via typed/USB barcode, flagged
lines with candidate chips, quantity stepper, remove, sticky summary, confirmed state).
Migration `0002_bill_review.sql` adds `needs_review` and `candidate_ids` to bill lines.

Checkpoint verified: prices always come from the catalogue on the server; flagged lines
block confirmation; confirmed bills are locked; confirming changes no stock (DB test and
a browser run: bill #3775, ₹174, stock and movement count unchanged, `bill.confirmed`
event logged). Viewed at 390 px and 360 px with no horizontal overflow.

Not yet: Photo, Voice and Parchi tabs show an honest "later section" state; camera
barcode scanning is not built; payment choice arrives in Section 5.

## Section 5 scope

Completed: payment adapters (`lib/payments/`: mock gateway, Paytm staging with
`paytmchecksum` signatures, Initiate Transaction, JS Checkout, Transaction Status v3),
the payment service (`confirmPayment`, `recordCash`, `putOnCredit`), routes
(`/api/bills/:id/pay`, `/api/payments/:orderId` status + gateway poll,
`/api/payments/mock/:orderId`, `/api/payments/paytm/callback`, `/api/payments/paytm/webhook`,
`/api/customers`, `/api/events`), the merchant payment panel (QR, live status, cash
and udhaar sheets, paid toast with device voice, stock changes), the customer pay page
`/pay/:orderId`, and the live Log screen. Migration `0003_payments.sql` adds the mock
gateway table and a one-success-per-bill unique index.

Rules enforced and tested (`tests/db/payments.test.ts`, `tests/payments-unit.test.ts`):
paid only after server-side gateway verification of order ID + amount; amount or order
mismatch rejected and logged with no stock change; 6 concurrent notifications apply
stock exactly once; replays are no-ops; failed payments leave the bill unpaid and allow
a fresh order; an open order is reused instead of creating a second charge; cash is
recorded as merchant-entered (not "verified"); udhaar decrements stock and adds a Khata
debit but never emits `bill.paid`; short shelf stock is corrected and logged; the
callback/webhook checksum is verified before the status API is called.

Browser run (mock): bill #3777 ₹129 → QR → customer page paid → merchant screen updated
by itself, milk 6 → 4 flagged low, log shows payment.created → stock.low → bill.paid;
replayed customer payment returned 409.

Mocked / not tested: Paytm staging has NOT been run (no MID/merchant key yet). The
voice confirmation uses the device's speech engine until Sarvam TTS (Section 6).

## Section 6 scope

Completed: `lib/ai/extract.ts` (OpenAI Responses API, image or text input, strict JSON
schema, output validated with zod; the model only reads the list, it never prices or
picks products), `lib/ai/sarvam.ts` (STT `saaras:v4`, TTS `bulbul:v3`), routes
`POST /api/bills/:id/parchi` (photo, or `{demo:true}` for the cached demo reading),
`POST /api/voice/stt`, `POST /api/tts`, voice orders via `/api/bills/:id/lines` with
`source: "voice"` (AI reader when configured, otherwise the deterministic parser),
the demo parchi page `/demo-parchi`, and the Counter's Parchi and Voice tabs (photo
upload with on-device resize, recording up to 20 s, editable transcript, typed fallback).
The paid-amount voice now uses Sarvam TTS with the device voice as fallback.
Parser fallback now reads Hindi number words, Devanagari digits and "और".

Verified: unit tests with fake OpenAI/Sarvam clients (request shape, strict schema,
headers, error handling); DB tests: cached demo parchi → 4 lines, "biskut 3" flagged,
confirm blocked until resolved, total ₹202 from catalogue prices; `legible: false`
forces a check; unknown items are returned, not guessed. Browser: Parchi tab shows the
no-key state honestly, cached demo adds the labelled lines; Voice tab shows typing works.

Not yet tested live: no OpenAI or Sarvam key is configured, so real photo reading,
speech-to-text and Sarvam TTS have only been tested with fakes.

## Section 7 scope

Completed: `lib/insights.ts` — `salesSummary` (today / yesterday / last 7 days, compared
with the same window a week earlier, top items), `lowStock`, `forecastRunout` (7-day
hour-of-day sales profile walked forward to the next morning restock), `slowMovers`
(14-day stock cover > 21 days), `khataDues` / `overdueDues` (FIFO ageing in IST calendar
days). Every result carries a `source`. Route: `GET /api/insights`.

Verified (`tests/db/insights.test.ts`, fixed 3 Oct 15:00 IST): sales equal an
independent SQL sum and the week-on-week comparison; staged milk (8/20) is low and is
forecast to run out before close (~7 pm on the seed); slow movers all have > 21 days of
cover; overdue = Ramesh ₹980 (42 d), Sunita ₹720 (35 d), Anil ₹450 (31 d) = ₹2,150, total
outstanding ₹11,640; a payment settles the oldest udhaar first.

## Section 8 scope

Completed: `lib/salaahkaar/tools.ts` (7 strict tools: get_sales_summary, get_low_stock,
forecast_runout, get_slow_movers, get_overdue_dues, propose_reorder, propose_reminder —
drafts only, de-duplicated), `lib/salaahkaar/agent.ts` (OpenAI function-calling loop with
a JSON reply `{display, speak}`; labelled offline mode with Hinglish/Devanagari keyword
intents when no key or the AI fails; a number guard on every mode: any number not in tool
results or the question hides the model's wording and shows the tool cards), approval
intent (`lib/salaahkaar/intent.ts`), proactive nudges, routes `POST /api/salaahkaar` and
`GET /api/salaahkaar/nudges`, and the Salaahkaar screen (chat, source-backed cards,
action cards, voice in, Hindi voice out, "haan, bhej do" approval). Each answer is logged
with the tools used.

Verified: DB tests (offline answers from tools; every number grounded across five
question types; no duplicate drafts; reminder draft; help for unknown questions; AI mode
with a scripted fake: tool result fed back, grounded answer kept, invented ₹99,999
caught, model failure → offline), unit tests (guard, intent, tool contracts). Browser:
offline mode badge, proactive milk card, answer + card + source + reorder draft.
Not yet tested live: the OpenAI agent (no key).

## Section 9 scope

Completed: `lib/actions.ts` (PENDING → APPROVED → EXECUTED / REJECTED / FAILED with row
locks; one outbox row per action enforced by a unique index), routes
`/api/actions/:id` + `approve` / `reject` / `retry`, the authenticated n8n callback
`/api/actions/:id/executed` (`x-n8n-callback-secret`), `GET /api/outbox`, migration
`0004_outbox.sql`, a signed (HMAC-SHA256) n8n webhook when `N8N_WEBHOOK_URL` is set and a
built-in outbox otherwise, `n8n/workflows/approved-action.json` + `n8n/README.md`, the
Outbox tab in the Log, and action cards that show the real execution route.

Verified: DB tests (nothing runs before approval; approve executes once despite double
taps, repeat approvals and concurrent callbacks; rejected drafts can't run; n8n webhook
signature + callback auth 401/200 + duplicate callback no-op; n8n down → FAILED → retry).
Browser: "Haan, bhej do" approved the milk reorder, card shows Approved → Done · built-in
outbox, Outbox lists the supplier message (not auto-sent).
Not yet tested live: a real n8n instance (workflow JSON is untested).

Note: the DB tests use long timeouts because this Mac's disk is ~98% full and swap is
nearly exhausted, which stalls Postgres for up to ~100 s at random.

## Section 10 scope

Completed: QR storefront `/s/[shop]` (categories, search, stock-aware Add/stepper, cart,
pickup/delivery checkout → `POST /api/shop/:slug/orders` → payment page), customer
tracking `/s/[shop]/order/[id]`, merchant Orders screen (live list every 3 s, new-order
highlight, Received → Preparing → Ready → Completed, Shop QR sheet), and the Khata screen
(total, ageing buckets, collect-first list, customer ledger sheet, "Cash mila" settlement,
reminder draft with approval). Libraries: `lib/orders.ts`, `lib/khata.ts`. Migration
`0005_storefront.sql` adds order name/phone/mode/note. Online orders enter the queue only
after verified payment (`bill.paid` sets fulfilment RECEIVED).

Verified: DB tests (catalogue prices; queue only after verified payment; stock −2; steps
can't be skipped; over-stock, unknown product and address-less delivery refused; Khata
₹11,640 / ₹2,150; part payment settles oldest first; overpay refused; settlement logged as
merchant-recorded). Browser: storefront → order → mock pay → "Order track karein";
merchant Orders shows the paid order; Khata overview and Ramesh's ledger.

Not built: online (gateway) settlement of udhaar via a payment link; settlements are
recorded by the merchant (cash/UPI collected outside the app).

## Section 11 scope (done)

Installable web app, `GET /api/ready`, presenter page `/demo`, golden-path smoke test
`npm run smoke [-- url]`, `docs/DEPLOY.md`, `docs/DEMO_RUNBOOK.md`.

## Finale-day log (3 Oct 2026)

- **UI refresh** (all screens): compact header with mode pill, segmented Parchi / Bolkar / Items
  input, quick-commerce steppers, sticky bill bar, three big payment options, verified-payment
  moment, Counter day summary tiles, per-product icons, Orders badge, text-light copy.
- **Deployed**: GitHub `jaypandey9082/kirana_shop_ai` → Vercel (functions in `bom1`) + Supabase
  (`ap-south-1`, RLS on all 13 tables incl. `schema_migrations`). Golden path passes on Vercel.
- **OpenAI live**: `gpt-4.1-mini` for parchi and Salaahkaar after a benchmark
  (`scripts/bench-models.mts`); Salaahkaar run-out times say aaj/kal explicitly; spoken text is
  required in Devanagari.
- **Voice**: adapter `lib/ai/voice.ts` (OpenAI now, Sarvam when keyed); streamed `GET /api/tts` with
  CDN/memory cache and prefetch; single tap-unlocked audio player; speaker button toggles.
- **Paytm staging**: real staging MID/key verified (checksum, `WEBSTAGING`, v3 status on
  `securestage.paytmpayments.com`); fixed the status host and stopped "Invalid Order Id"/"System
  Error" from failing unpaid orders. Initiate Transaction still returns resultCode 239 until
  Paytm activates the staging account; the demo uses the labelled mock gateway.

- **Distributor loop** (afternoon): migration `0006_purchase_orders.sql`; an executed reorder creates
  one purchase order; demo distributor page `/d/<slug>` (and `/d/all`) accepts with delivery time and
  short quantities or rejects; Orders → Suppliers shows status, "Maal aa gaya" (stock +qty once,
  `stock_movements.reason = restock` linked by `po_id`) and "Payment diya" (recorded, no money moves);
  Salaahkaar tool `get_supplier_dues`; `/demo` shows four phones; smoke test covers the loop.

Still open: Paytm activation, Sarvam key, phone tests on the venue network, rehearsals and the
backup recording; stock receiving and catalogue editing screens (not built).
