# Demo runbook (3 minutes)

Two people: **Presenter** (talks, holds the shopkeeper phone) and **Driver** (customer
phone + projector laptop with `/demo`).

## 30 minutes before

1. `https://<app>/api/ready`: database ✓, payments as expected, AI/voice as expected.
2. `/demo` → **Reset demo** (milk back to 8, Khata ₹11,640, log cleared).
3. Shopkeeper phone: merchant app from the home screen, on **Counter → Parchi**.
4. Customer phone: open the shop QR (Orders → Shop QR) once so it's cached.
5. Have the printed/handwritten demo parchi (`/demo-parchi`) in hand.
6. Hotspot on. Volume up (voice confirmation and Salaahkaar speak).
7. Backup recording ready on the laptop (see below).

## The script

| Time | Who | Do | Say |
|---|---|---|---|
| 0:00 | Presenter | Show the Counter | "The QR says money came in. It can't say what sold, what to reorder, or who owes the shop." |
| 0:20 | Presenter | Parchi → take photo (or **Demo parchi (cached)** if AI is down; it's labelled) | "AI reads the parchi; our matcher picks products; anything unclear, the shopkeeper decides." |
| 0:40 | Presenter | Tap **Glucose biscuit** on the flagged "biskut" line → **Confirm** | "Prices come from the catalogue, not the AI. Stock hasn't moved yet." |
| 1:00 | Presenter | **Online** → QR | |
| 1:05 | Driver | Scan, pay on customer phone | "Paytm staging" or "mock gateway, clearly labelled" |
| 1:20 | Presenter | Phone shows "₹202 prapt hue", stock 8 → 6; point at the projector log | "Paid only after our server verified it with the gateway. One event, stock and log updated once." |
| 1:40 | Presenter | Salaahkaar → mic: "Aaj kitna sale hua, aur kya khatam hone wala hai?" (or tap the chip) | Let it speak. "Every number has a source under it." |
| 2:15 | Presenter | Say "Haan, bhej do" | "Nothing goes out without the shopkeeper's yes." Show Outbox in the log. |
| 2:35 | Driver | Optional: storefront order from customer phone → appears in Orders | |
| 2:45 | Presenter | Close | Business model + pilot metrics (deck slides 9–10). |

## If something breaks

| Problem | Do this |
|---|---|
| Parchi photo fails / slow | **Demo parchi (cached)**, say it's a cached reading |
| Mic or voice fails | Tap the suggestion chip or type; typed input is always there |
| Paytm staging down | Set `PAYMENT_PROVIDER=mock` beforehand, or use **Cash**, and say so |
| Network gone | Hotspot; if all else fails, play the backup recording |
| Data in a weird state | `/demo` → Reset demo (≈1 s) |

## Backup recording

Record the full script once the deploy is final (macOS: Shift-Cmd-5 → Record Selected
Portion over `/demo`). Keep it on the laptop desktop, not only in the cloud.

## Honesty checklist (say it if asked)

- Demo store and history are synthetic. Pricing, pilot size and economics in the deck are assumptions.
- Mock payments are not real Paytm transactions. Staging is Paytm's test environment.
- The voice confirmation is software, not Soundbox hardware.
- Approved messages go to the Outbox (or n8n); we don't claim automatic WhatsApp sending.
