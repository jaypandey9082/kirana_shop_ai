# Kirana Shop AI: research notes

Rebuilt from the Round 1 research doc (original .docx no longer on disk). Keep "verified" and "assumption" separate, as the pitch does.

## Event (from hackbriven.com event page, read 29 Sep 2026)
- Paytm Build for India AI Hackathon, Mumbai Edition. Organised by Paytm with HackBriven, MochaTrade, n8n, Sarvam, Cognee.
- 5,682 registered, 3 tracks. Our track: **Merchant Growth AI**, brief: "Build the AI business partner for every Paytm merchant."
- Finale: 3 Oct 2026, 10:00 AM to 6:00 PM (8 hours), in person at Paytm's Mumbai office (Andheri East). Report 9:30 AM.
- Teams of 1 to 2. Prizes: hiring opportunities + AI credits.
- Team HackHorizon is one of 30 teams shortlisted in our track.

## Verified public facts used in the pitch
- 1.4 crore+ kirana stores; ~75 to 80% of FMCG sales (DPIIT/ONDC release, 12 Jun 2026).
- 24,508.96 million UPI transactions in Aug 2026 (NPCI UPI product statistics).
- Paytm says 5 crore+ merchants/businesses accept digital payments with it (paytm.com/about-us).
- Paytm Payment Gateway documents JS Checkout, server SDKs, transaction status, callback/webhook, and test instruments for staging.
- Sarvam documents Indian-language STT/TTS (code-mixed input) and Document Intelligence (OCR).

## Assumptions (label them as such)
- ₹149/month Pro tier is a proposed pilot price, not researched pricing.
- ₹50/month variable cost → ₹99 contribution (66%). Sensitivity model only.
- Pilot: 20 to 50 local merchants, one region, one language, narrow SKU set.
- Workflow observations on slide 2 are initial observations to validate in the pilot. No interview count is claimed.

## Claims to avoid
- No Soundbox hardware integration claim. Say "software voice confirmation".
- No guaranteed revenue, retention or loan-eligibility uplift.
- No "no competitor has this". Khatabook, Vyapar, PhonePe/BharatPe speakers solve parts of it; our claim is the connected loop.

## Trust rules (product)
- AI proposes the bill; merchant confirms. Uncertain lines stay editable.
- An order is paid only after a verified server-side payment event.
- Reminders, reorders and anything touching money need explicit merchant approval.
