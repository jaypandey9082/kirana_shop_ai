# Deploying Kirana Shop AI

Target: **Vercel** (public HTTPS on port 443, which Paytm webhooks require) + **Supabase
Postgres**. Everything runs on the server through one `DATABASE_URL`; the browser never
talks to the database.

## 1. Supabase (database)

1. Create a project (region: Mumbai `ap-south-1`).
2. Project Settings → Database → Connection string:
   - **Session pooler / direct (port 5432)** for running migrations from your laptop.
   - **Transaction pooler (port 6543)** for Vercel. The app sets `prepare: false`, which the
     transaction pooler needs.
3. From your laptop, load the schema and demo data into Supabase:
   ```sh
   DATABASE_URL="postgres://…:5432/postgres" npm run db:reset
   ```
   All tables have RLS on with no policies, so Supabase's public `anon`/`authenticated`
   roles can't read anything. Don't add the Supabase anon key to the app; it isn't used.

## 2. Vercel (app)

1. Push the repo to GitHub and import it in Vercel (framework: Next.js; build command is
   `npm run build`, which uses Webpack as documented in the README; Node 24).
2. Environment variables (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler URL (6543) |
| `APP_URL` | `https://<your-app>.vercel.app` (used for Paytm callback and n8n callback URLs) |
| `PAYMENT_PROVIDER` | `mock` until Paytm keys work, then `paytm` |
| `PAYTM_MID`, `PAYTM_MERCHANT_KEY` | Paytm Business **staging** credentials |
| `PAYTM_WEBSITE` | `WEBSTAGING` |
| `PAYTM_HOST`, `PAYTM_STATUS_HOST` | defaults in `.env.example`; confirm with a ₹1 test |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | key + a vision/tool-calling model the key can use |
| `SARVAM_API_KEY` | Sarvam key (STT `saaras:v4`, TTS `bulbul:v3` by default) |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET` | optional; without them the built-in outbox runs approved actions |
| `DEMO_RESET_ENABLED` | `true` for the finale only |
| `DEMO_RESET_SECRET` | random, 32+ characters (`openssl rand -hex 16`) |

3. Functions run in Mumbai (`bom1`, set in `vercel.json`) next to the Supabase database
   (`ap-south-1`). Without it Vercel runs them in Washington (`iad1`) and every query
   crosses the world: a payment took ~13 s instead of ~1 s.
4. Deploy, then open `https://<app>/api/ready`: every line should say what you expect.

## 3. Paytm staging

1. Paytm Business dashboard → Developer settings → **Test** API keys: copy MID + key into Vercel.
2. Webhook (Payment Status) URL: `https://<app>/api/payments/paytm/webhook`.
3. Test: set `PAYMENT_PROVIDER=paytm`, run `npm run smoke -- https://<app>`, pay on the
   customer page with the staging wallet (`7777777777`, OTP `489871`). The smoke test
   waits for server-side verification.
4. If the checkout script or status host 404s, set `PAYTM_CHECKOUT_JS_URL` /
   `PAYTM_STATUS_HOST` from Paytm's current docs and redeploy.

## 4. n8n (optional)

See `n8n/README.md`. Set the three `N8N_*` variables, approve a draft in Salaahkaar, and
check the Outbox shows "n8n".

## 5. Before the demo

- `npm run smoke -- https://<app>`: golden path must pass.
- Open the merchant app on the demo phone and **Add to Home Screen**.
- Open `/demo` on the projector laptop (customer, shopkeeper and live log side by side).
- Keep a mobile hotspot ready; Wi-Fi at venues is unreliable.

## Tested so far

Locally (Postgres 17, mock gateway): all unit and DB tests, and the smoke test.
OpenAI tested live on 3 Oct 2026 with `OPENAI_MODEL=gpt-4.1-mini`: parchi photo ≈2.5–4 s,
Salaahkaar ≈5–8 s, smoke test passed 3/3. Compared with gpt-5.4-mini (faster agent but did not
draft the reorder) and gpt-5-mini (agent ≈17 s): `scripts/bench-models.mts`. Add keys with
`scripts/set-keys.sh`. **Not yet tested:** Vercel, Supabase, Paytm staging, Sarvam, n8n.
