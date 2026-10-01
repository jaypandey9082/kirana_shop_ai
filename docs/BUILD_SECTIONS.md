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
