# AGENTS.md

## Project identity

- Product: **Kirana Shop AI**
- Team: **HackHorizon**
- Event: **Paytm Build for India AI Hackathon, Mumbai Edition**
- Track: **Merchant Growth AI**
- Finale: **3 October 2026, 10:00 AM to 6:00 PM**, Paytm Mumbai office
- Team size: 1 to 2 people

Kirana Shop AI is a mobile-first AI business partner for neighbourhood merchants. It connects four daily jobs around one merchant profile:

- **Counter**: billing from barcode, parchi, voice, photo or manual input
- **Shop**: a customer storefront using the same catalogue
- **Khata**: digital udhaar and payment reconciliation
- **Salaahkaar**: a Hindi/Hinglish voice adviser grounded in the merchant's own data

## The outcome that matters

The finale is an eight-hour build. Optimize for one reliable live journey, not a broad but incomplete product:

`parchi photo -> merchant confirms bill -> Paytm staging payment -> verified server-side event -> stock and Khata update -> Salaahkaar explains an insight in Hindi -> merchant approves -> action executes`

The demo must show that a payment becomes useful business context and a safe next action. Counter, Shop and Khata provide the data and actions; Salaahkaar is the AI core.

## Sources of truth

Read these before making implementation or product decisions:

1. `PLAN.md` - priorities, eight-hour schedule, components and fallbacks
2. `docs/WORKFLOW.md` - canonical journeys, data model, tool contracts and demo script
3. `docs/research/notes.md` - verified facts, assumptions and claims to avoid
4. `README.md` - short project orientation

If documentation conflicts, prefer `docs/WORKFLOW.md` for system behaviour and `PLAN.md` for scope and priority. Update the relevant document when an approved decision changes.

## Delivery priorities

### Must work

- Mobile-first merchant PWA with Counter, Khata and Salaahkaar
- One seeded demo merchant with products, stock, customers, sales and udhaar history
- Parchi to editable bill with confidence flags
- Paytm staging integration through a payment adapter
- Webhook/callback signature handling plus Transaction Status verification
- Stock and Khata updates driven by a verified domain event
- Deterministic insight tools for sales, stock and overdue dues
- Hindi/Hinglish Salaahkaar response with visible sources
- Explicit merchant approval before reminders, reorders or other external actions
- Typed-input and mock-payment fallbacks for the live demo

### Should work

- QR storefront with the same product catalogue
- Sarvam speech-to-text and text-to-speech
- n8n execution for approved actions
- Live event log visible to judges

### Stretch only

- Cognee merchant memory
- Product-photo recognition
- Multi-store support
- Advanced automation beyond the golden path

Do not sacrifice the must-work journey for a stretch feature.

## Stack (implemented)

- Next.js 16 App Router (Webpack build), React 19, strict TypeScript, Tailwind v4 (tokens in `app/globals.css`), lucide-react icons
- PostgreSQL via the `postgres` driver (`prepare: false`, Supabase-pooler compatible); migrations in `supabase/migrations/`, RLS on every table with no policies
- Payments: provider adapter (`lib/payments/`) with a labelled **mock** gateway and **Paytm PG staging** (initiate, JS Checkout, checksum, v3 status)
- Parchi reading + Salaahkaar agent: OpenAI Responses API with strict JSON schemas and function tools (`OPENAI_MODEL`, tested with `gpt-4.1-mini`)
- Voice: one adapter (`lib/ai/voice.ts`): Sarvam when `SARVAM_API_KEY` is set, otherwise OpenAI (`gpt-4o-mini-transcribe` / `gpt-4o-mini-tts`, voice `marin`); `VOICE_PROVIDER` forces one
- Approved actions: built-in outbox, or n8n via signed webhook when `N8N_*` is set
- Hosting: Vercel (functions pinned to Mumbai `bom1` in `vercel.json`) + Supabase Postgres (`ap-south-1`)
- Cognee memory and product-photo recognition: not built (stretch)

## Non-negotiable trust rules

### Payments

- Never mark an order paid from a browser success screen.
- For Paytm, verify the callback/webhook signature and confirm the final transaction status server-side.
- Match the provider order ID and amount against the stored bill before emitting `bill.paid`.
- Make payment event processing idempotent. Duplicate callbacks must not duplicate stock or ledger changes.
- Keep staging and mock modes visibly distinguishable. Never present a mock payment as a live Paytm transaction.
- Never commit MIDs, merchant keys, API keys, webhook secrets or real customer data.

### AI

- The LLM does not invent prices, stock, sales, balances or payment status.
- Prices come from the catalogue. Business numbers come from deterministic tools or SQL.
- Every numeric insight shown to the merchant carries a human-readable source.
- Low-confidence bill lines remain editable and require confirmation.
- There is no tool that moves money.
- Reminder, reorder and supplier-message tools create a `PENDING` action. Execution requires explicit merchant approval.
- Prefer short Hindi/Hinglish responses suitable for speech and a busy shop counter.

### Data and claims

- Use synthetic demo data unless the user supplies authorised real data.
- Do not invent merchant interviews, traction, pilot results or proven business impact.
- Clearly label assumptions, hypotheses, illustrative figures and proposed pricing.
- Do not claim Soundbox hardware integration. Software voice confirmation is allowed.
- Do not claim production Paytm access, automatic WhatsApp Business sending, lending decisions or credit scoring.

## Canonical event flow

`bill.paid` is the central verified event.

It may be emitted only after:

1. Paytm verifies successfully through the server-side payment path, or
2. the merchant explicitly records a cash payment.

An udhaar bill uses `ON_CREDIT`; it decrements stock and creates a Khata debit but does not become a paid bill.

After `bill.paid`, the system may:

- record a stock movement
- reconcile a Khata balance where applicable
- announce the verified amount through software TTS
- update the merchant UI
- append an immutable event-log entry
- re-run deterministic insight rules
- trigger an approved n8n workflow

## Implementation guidance

- Keep provider integrations behind small adapters so Paytm/Sarvam/n8n can be replaced with deterministic demo fallbacks.
- Model the golden path explicitly with states. Avoid hidden UI-only state for bills, payments and actions.
- Use strict schemas for LLM outputs and tool inputs. Validate every response before using it.
- Build the deterministic insight engine before agent phrasing. The agent explains results; it does not calculate them.
- Store an append-only event log for judge visibility and debugging.
- Design the demo for two views: customer payment/storefront and merchant dashboard.
- Keep venue failure modes in mind: unreliable Wi-Fi, microphone noise and unavailable staging services.
- Freeze the working demo before adding optional polish.

## Minimum verification before calling a feature complete

- The relevant happy path works from the UI, not only through isolated API calls.
- Failure and retry states are visible and understandable.
- Duplicate payment notifications do not duplicate downstream effects.
- Amount and order mismatches fail safely.
- Low-confidence OCR or item matching requires merchant correction.
- Salaahkaar cannot state a number without a tool result.
- An action cannot execute without explicit approval.
- Mock/staging behaviour is disclosed in the UI and demo narration.
- The seeded demo can be reset to a known state quickly.

## Demo acceptance criteria

The preferred three-minute demonstration should prove:

1. A handwritten parchi becomes an editable bill.
2. At least one uncertain item is corrected by the merchant.
3. A Paytm staging or clearly labelled fallback payment reaches server-side verification.
4. The merchant screen updates stock and the event log once.
5. Salaahkaar answers a Hindi/Hinglish question using displayed source data.
6. The merchant approves a reorder or reminder.
7. The approved action executes and is logged.

Maintain a backup recording of this complete journey.

## Out of scope for the finale

- Soundbox hardware integration
- Production Paytm merchant onboarding
- Real WhatsApp Business API sending
- Lending, underwriting or credit scoring
- Autonomous money movement
- Multi-store administration
- Full supplier procurement integration
- Production-scale security, compliance or analytics claims

## Repository working rules

- The app is implemented, tested and deployed (see "Current status" below). Inspect the tree and run the checks before reporting status; don't trust this file over the code.
- Preserve user-owned or unrelated changes. Do not discard or rewrite work without explicit approval.
- Never commit secrets or `.env` files. Provide `.env.example` with placeholder names when configuration is introduced.
- Prefer a small number of end-to-end modules over speculative abstractions.
- Keep copy natural and specific. Avoid exaggerated AI claims and generic hackathon language.
- When reporting progress, distinguish implemented, tested, mocked, planned and blocked work.
- Do not claim a deployment, integration or live payment succeeded without direct evidence.

## Current status (3 Oct 2026, finale day)

Live: **https://kirana-shop-ai.vercel.app** (deploys automatically on every push to `main` of
`github.com/jaypandey9082/kirana_shop_ai`). `/api/ready` shows which services are connected.

| Area | Status |
|---|---|
| Golden path (parchi → fix flag → confirm → online pay verified → stock/log once → Salaahkaar → "haan, bhej do" → executed) | Working locally and on Vercel; `npm run smoke [-- url]` passes |
| Database | Local Postgres 17 (`kirana_dev`, `kirana_test`) and Supabase (Mumbai), same migrations + demo data |
| Payments | **Mock gateway** live (labelled). **Paytm staging blocked on Paytm**: MID + key are valid (checksum accepted, `WEBSTAGING` accepted, v3 status works on `securestage.paytmpayments.com`), but Initiate Transaction returns resultCode 239 "System Error" until Paytm activates the staging account |
| OpenAI | Live: parchi photo (~2.5 s), Salaahkaar agent (~5 s), number guard |
| Voice | Live with OpenAI (streamed, ~1 s to first sound, cached); Sarvam adapter written but untested with a real key |
| Storefront, orders (nav badge), Khata, live log, `/demo` presenter | Working |
| n8n | Workflow file exists, untested; built-in outbox is used |

Not built (say so if asked): receiving stock ("maal aa gaya") and count corrections in the UI
(stock goes down on sales; `stock_movements` supports `restock`/`adjustment`), adding products or
editing prices, online udhaar settlement, product-photo recognition, Cognee memory.

## Working in this repo

```sh
npm run dev:lan        # dev server on :3000, also reachable from phones on the same Wi-Fi
npm run check          # ESLint + types + unit tests (must pass before committing)
npm run test:db        # DB integration tests against kirana_test
npm run build          # production build (stop the dev server first: both write .next)
npm run db:reset       # migrations + deterministic demo store into DATABASE_URL
npm run smoke [-- URL] # golden-path rehearsal; needs DEMO_RESET_SECRET (local) or the Vercel one
```

- Secrets live only in `.env.local` (gitignored) and in Vercel's environment variables. Use
  `scripts/set-keys.sh [ai|paytm|sarvam]` to add keys without pasting them anywhere;
  `scripts/vercel-env.sh` copies Vercel values to the clipboard. `.env.local` also holds
  `SUPABASE_MIGRATE_URL` (session pooler, 5432) and `VERCEL_DEMO_RESET_SECRET`.
- Load schema/demo data into Supabase: `DATABASE_URL="$SUPABASE_MIGRATE_URL" npx tsx scripts/db.ts reset`.
- Vercel uses the Supabase **transaction pooler (6543)** as `DATABASE_URL`, plus `APP_URL`,
  `PAYMENT_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DEMO_RESET_ENABLED`, `DEMO_RESET_SECRET`.
  After changing env vars, redeploy (push, or Redeploy in Vercel).
- Pushing: this Mac's active `gh` account may differ from the repo owner. Push as the owner with
  `git -c credential.helper= -c 'credential.helper=!f(){ echo username=jaypandey9082; echo "password=$(gh auth token --user jaypandey9082)"; }; f' push origin main`.
- Model choices were benchmarked (`scripts/bench-models.mts`): `gpt-4.1-mini` is fast and drafts the
  reorder reliably; `gpt-5.4-mini` skipped the reorder; `gpt-5-mini` took ~17 s per answer.
- If local Postgres won't start after a reboot, check `/opt/homebrew/var/log/postgresql@17.log` for a
  stale `postmaster.pid` (only remove it after confirming no postgres process is running).

### Code map

- `app/(merchant)/{counter,orders,khata,salaahkaar,log}`: merchant screens; `app/s/[shop]`, `app/pay/[orderId]`: customer pages; `app/demo`: projector view
- `components/kirana/*`, `components/shop/*`, `components/ui/primitives.tsx`: UI (no component library)
- `lib/bills.ts`, `lib/matcher.ts`: billing and Hinglish/Devanagari item matching
- `lib/payments/{service,mock,paytm}.ts`: the only path that emits `bill.paid`
- `lib/insights.ts`: deterministic numbers; `lib/salaahkaar/{tools,agent,intent}.ts`: agent, tools, number guard, approval intent
- `lib/ai/{extract,voice,sarvam}.ts`: OpenAI parchi reading and the voice adapter
- `lib/actions.ts`, `lib/orders.ts`, `lib/khata.ts`, `lib/events.ts`: approvals/outbox, storefront orders, udhaar, append-only log

### UI rules (from team feedback)

- Keep screens text-light: no subtitles or explanatory footnotes; the presenter explains out loud.
  Keep only honesty labels: mock payment, `Source:` on numbers, "Approval chahiye", cash "gateway verified nahi".
- Colours come from tokens in `app/globals.css`; product icons from `components/kirana/product-icon.tsx`.
- Salaahkaar's spoken text (`speak`) must be Devanagari with digits (the number guard reads digits);
  `prepareSpeech` tidies ₹ and % only at speech time.
- One audio player for the whole app (`components/kirana/voice.ts`), unlocked on first tap (iPhone).
- Check every UI change at 390 px and 360 px with no horizontal scroll.

## Product and pitch status

- Team HackHorizon was shortlisted in the Merchant Growth AI track.
- The Round 1 deck was validated as a 10-slide, 16:9 PDF under 10 MB.
- It covers the required title, problem, solution, technology, USP, impact and business-model sections.
- The deck and research intentionally qualify workflow observations, proposed pricing, pilot size and projected economics as assumptions or hypotheses.

Re-verify event rules, provider documentation and credentials before implementation because external requirements can change.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
