# UI prompt for Codex: Kirana Shop AI design system and screens

Paste this whole file into Codex (or point it here) when building any UI section. It is the visual source of truth; `docs/WORKFLOW.md` stays the source of truth for behaviour.

---

## Role and goal

You are building the UI for **Kirana Shop AI** (Team HackHorizon, Paytm Build for India AI Hackathon, Merchant Growth AI track). It is a mobile-first PWA for neighbourhood shopkeepers in India, plus a customer storefront opened from a QR code.

The UI must feel **premium, calm and trustworthy**, like a well-made fintech app, while staying **fast to use with one thumb at a busy shop counter**. Premium here means restraint: generous spacing, one confident accent colour, crisp type, precise alignment, honest status labels. It does not mean gradients, glass effects or decoration.

Judges will see it on a phone and on a projector. Every screen must look finished at 390 × 844.

## Read before writing code

1. `AGENTS.md` (trust rules, scope, out-of-scope claims)
2. `docs/WORKFLOW.md` (journeys, states, data model)
3. `docs/BUILD_SECTIONS.md` (build only the current section)
4. `docs/mockups/*.png` (concept screens: counter, shop, khata, salaahkaar). Match their structure and tone; improve polish.
5. `node_modules/next/dist/docs/` for Next.js 16 APIs (this is not the Next.js from your training data). Fonts: `01-app/01-getting-started/13-fonts.md`.

## Hard constraints

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4 (CSS-first `@theme` tokens in `app/globals.css`; there is no `tailwind.config.js`).
- Icons: `lucide-react` only, 20 px default, 1.75 stroke. No emoji in UI chrome.
- Fonts through `next/font/google` (self-hosted, no runtime request to Google): **Geist** for Latin UI text and numbers, **Noto Sans Devanagari** for Hindi. Expose both as CSS variables and put Devanagari second in the stack so mixed Hinglish renders correctly.
- Light theme only for the finale. Navy surfaces are used deliberately (Salaahkaar header, totals, summary cards), not as a dark mode.
- No Paytm logo or brand assets. "Paytm" appears only as plain text where it describes the payment method.
- Build reusable components in `components/ui/` (primitives) and `components/kirana/` (domain). No component library is required; if you use Radix or shadcn primitives, keep them restyled to these tokens.
- Do not invent data in components. Screens read from typed props/fixtures; every demo number must come from seed data or a tool result, per `AGENTS.md`.

## Design direction

**Mood:** calm navy, clean white, one bright blue. Inspired by Indian fintech clarity, not copied from it.

**Principles**
1. **Numbers are the hero.** Amounts, stock and dues are large, bold and tabular. Labels are small and quiet.
2. **One primary action per screen**, always in the thumb zone (bottom 30% of the screen).
3. **State is always visible.** Payment, verification, mode (mock/staging/demo data) and approval status are never hidden or implied.
4. **Trust through honesty.** Uncertain AI output looks visibly different (amber, dashed) and asks for a decision. Sources sit under every AI number.
5. **Quiet surfaces, sharp hierarchy.** Use hairline borders and soft elevation, not heavy shadows or colour blocks.

## Design tokens (put in `app/globals.css`)

```css
@import "tailwindcss";

@theme {
  /* Brand */
  --color-navy-950: #0B1F44;   /* headings, dark surfaces (16.2:1 on white) */
  --color-navy-800: #132D5E;   /* secondary dark surface */
  --color-navy-700: #1C3A6E;   /* chips on dark */
  --color-blue-600: #0072BC;   /* primary buttons, links (5.1:1 with white) */
  --color-blue-700: #005FA3;   /* pressed / hover */
  --color-sky-500:  #00A7E1;   /* accent fills only: mic, active tab dot, progress. Never white text on it (2.8:1) — use navy text */
  --color-sky-100:  #EAF3FB;   /* selected / info tint */

  /* Neutrals */
  --color-canvas:  #F4F7FB;    /* app background */
  --color-surface: #FFFFFF;    /* cards */
  --color-line:    #E3EAF2;    /* hairline borders, dividers */
  --color-ink:     #0F1B33;    /* body text */
  --color-muted:   #5A6A85;    /* secondary text (5.5:1 on white) */
  --color-on-dark-muted: #B8C8E2; /* secondary text on navy (9.6:1) */

  /* Semantic: text colour / tint background pairs, all ≥ 4.5:1 */
  --color-success: #0F6E4F;  --color-success-tint: #E7F5EE;  /* paid, verified */
  --color-warning: #9A5B0C;  --color-warning-tint: #FFF6E8;  --color-warning-line: #E8962E; /* needs check, mock mode */
  --color-danger:  #B42318;  --color-danger-tint:  #FDECEA;  /* overdue, failed */

  /* Type */
  --font-sans: var(--font-geist), var(--font-devanagari), system-ui, sans-serif;

  /* Radius */
  --radius-sm: 8px;   /* chips, inputs */
  --radius-md: 12px;  /* buttons, list rows */
  --radius-lg: 16px;  /* cards */
  --radius-xl: 24px;  /* sheets, hero panels */

  /* Elevation */
  --shadow-card: 0 1px 2px rgb(11 31 68 / 0.06), 0 1px 1px rgb(11 31 68 / 0.04);
  --shadow-raised: 0 8px 24px rgb(11 31 68 / 0.10);
}
```

Rules: no other hex values in components. If a new colour is needed, add a token and check contrast ≥ 4.5:1 for text.

## Typography

| Role | Size / line height | Weight | Notes |
|---|---|---|---|
| Display amount | 32 / 38 | 700 | Totals, "₹8,420" |
| Screen title | 22 / 28 | 700 | One per screen |
| Section label | 12 / 16 | 600 | Uppercase, +0.06em tracking, muted |
| Body | 16 / 24 | 400 | Minimum for inputs (prevents iOS zoom) |
| Secondary | 14 / 20 | 400 | Muted |
| Caption / source | 12 / 16 | 500 | Source lines, timestamps |

- All money, quantities and counts use `tabular-nums`.
- Format with `Intl.NumberFormat('en-IN')`: ₹1,40,000, not ₹140,000. No decimals unless non-zero paise.
- Devanagari needs room: line-height ≥ 1.5 on any block likely to contain Hindi.
- Maximum two weights per screen besides the display amount.

## Layout and spacing

- 4 px base grid; use 8 / 12 / 16 / 24 / 32 px steps. Screen gutter 16 px.
- Design at 360, 390 and 412 px widths (budget Android first). On desktop, centre the app in a 420 px column on the canvas colour.
- Touch targets ≥ 48 × 48 px; ≥ 8 px between adjacent targets.
- Respect `env(safe-area-inset-bottom)` under the bottom nav and sticky action bars.
- Cards: white, `--radius-lg`, 1 px `--color-line` border, `--shadow-card`, 16 px padding. Never nest cards more than one level.

## App shell (merchant)

- **Top bar:** shop name ("Sharma General Store") + date, and on the right a **ModeBadge** cluster: `DEMO DATA` (neutral), `PAYTM STAGING` (blue outline) or `MOCK PAYMENTS` (amber, solid). Always visible on every merchant screen. Tapping it opens a sheet explaining the mode in one sentence.
- **Bottom nav (4 tabs):** Counter · Orders · Khata · Salaahkaar. Lucide icons: `ScanLine`, `ShoppingBag`, `NotebookPen`, `Mic`. The active tab has a navy label and a 4 px sky dot above the icon. Salaahkaar's icon sits in a filled sky circle to mark it as the AI core.
- **Live log:** a small "Log" icon button in the top bar opens `/log` (for judges).
- **Toasts:** top-anchored, navy surface, white text, 4 s. The payment toast is special (see below).

## Domain components to build

1. **ModeBadge**: variants demo / staging / mock / live-off. Text always visible, never colour alone.
2. **MoneyText**: formats INR, sizes sm/md/display, optional strike or tone.
3. **InputModeTabs**: Parchi · Bolkar · Items (Items also takes scanner barcodes; product-photo recognition stays a stretch goal, so there is no Photo tab). Segmented control on a soft track, 44 px tall, selected = white pill.
4. **BillLine**: name, qty × price, line total. Variants:
   - `confirmed`: plain row.
   - `needs-check`: warning tint background, 1.5 px dashed warning border, a short reason ("Parchi says 'biskut 3'"), two candidate chips; the bill cannot be confirmed until it is resolved. Quantity stepper on every line.
5. **BillSummary bar** (sticky bottom): item count, total (display size), primary button. Disabled state explains why ("1 item needs your check").
6. **PaymentStatus**: a state stepper `Created → Waiting for customer → Verifying with Paytm → Paid` (or `Failed`, `Mock`). Uses a spinner only in "Verifying". Shows the order ID in caption text.
7. **PaidToast**: navy pill with a success check, "₹202 prapt hue", and caption "Verified by server · 10:42". Paired with the software TTS. Shown once per verified payment.
8. **StockDelta chip**: "Toned milk 500ml · 8 → 6", danger tint if it falls below the reorder level.
9. **InsightCard** (Salaahkaar answer): one headline number or sentence, up to 3 supporting facts, and a **SourceLine** at the bottom ("Source: aaj ke 63 bills · stock register"). A number never appears in an InsightCard without a SourceLine.
10. **ActionCard**: title ("Reorder: Toned milk × 2 crates"), the draft message preview in a quoted block, the status (`Pending approval`), and two buttons: **Approve** (primary) and **Not now** (secondary). After approval it shows `Approved → Sent to n8n → Done` with timestamps. Rejected cards collapse to one line.
11. **VoiceButton**: 64 px sky circle with a mic icon. States: idle; listening (pulsing ring + live waveform bars); processing (spinner ring); speaking (equaliser bars, tap to stop); error ("Mic nahi chala. Type karke poochiye." + focus moves to the text field). The text input is always visible next to it.
12. **ChatBubble**: merchant bubble right-aligned, blue fill, Hindi transcript with a smaller Hinglish romanisation underneath. Salaahkaar responses render as InsightCards, not plain bubbles.
13. **KhataRow**: avatar initials, name, ageing chip (0–15 neutral, 16–30 warning, 30+ danger), balance right-aligned.
14. **EventLogItem**: monospace-free timeline row with event name (`bill.paid`), a short human summary, a timestamp and a verified badge where relevant.
15. **EmptyState / Skeleton / ErrorBanner**: every list has all three.

## Screen specs

**Counter** (`/counter`)
- InputModeTabs at top. The Parchi tab shows a camera/upload card with a thumbnail of the last photo and "4 items mile · 1 check karna hai".
- List of BillLines; flagged lines first.
- Sticky BillSummary: "Confirm bill" → payment choice sheet with three large options: **Paytm** (primary), **Cash**, **Udhaar** (pick a customer).
- After choosing Paytm: show a full-width QR / "Customer phone par bheja" state with PaymentStatus. Never show "Paid" until the server says so.

**Orders** (`/orders`)
- New online orders slide in at the top with a subtle highlight for 3 s. Status chips: Received / Preparing / Ready, changed by a segmented control on each card.

**Khata** (`/khata`)
- Navy summary card: "Total to collect" (display amount) with ageing chips.
- "Collect first" list (30+ days) then everyone else.
- Reminder drafts appear as ActionCards; nothing sends without Approve.

**Salaahkaar** (`/salaahkaar`)
- Navy header (about 180 px) with the title, the subtitle "Aapka dukaan adviser · Hindi / Hinglish" and 3 suggestion chips ("Aaj kitna sale hua?", "Kya khatam hone wala hai?", "Kiska paisa baaki hai?").
- The conversation on the canvas below: merchant ChatBubble → InsightCard(s) → ActionCard(s).
- Bottom composer: text field ("Poochiye… ya mic dabaiye") + VoiceButton, above the bottom nav.
- Proactive nudges appear as compact InsightCards with a small "Naya" label.

**Log** (`/log`)
- Chronological EventLogItems with filter chips: Payments · Stock · Khata · Actions. Designed to be readable on a projector (min 14 px).

**Customer storefront** (`/s/[shop]`, separate light layout, no merchant chrome)
- Navy store header card (name, "Open till 10 pm · Pickup or delivery within 1 km", "Opened from shop QR").
- Search, category chips, 2-column product grid (image tile on tinted background, name, price, Add/stepper). Out-of-stock items greyed, with "Khatam".
- Sticky cart bar: item count + total + "Pay online" → checkout → order status page with a 3-step tracker.

**Demo presenter view** (`/demo`, desktop only, optional but valuable)
- Two phone frames side by side (customer storefront and merchant app) with the live log on the right, for the projector. Plus a discreet "Reset demo" button.

## Motion

- 150–200 ms ease-out for presses and toggles; 250 ms for sheets. No bounces or parallax.
- Purposeful only: the paid toast check draws in; new order highlight fades; mic ring pulses while listening.
- Respect `prefers-reduced-motion`: replace movement with opacity changes.

## Accessibility

- WCAG 2.1 AA contrast (the tokens above are pre-checked; keep text on approved pairs).
- `aria-live="polite"` on PaymentStatus, PaidToast and new Salaahkaar answers.
- Visible focus ring: 2 px blue-600 outline with a 2 px offset.
- Voice is never the only way: every voice action has a tap or text equivalent.
- `lang="hi"` on Hindi text spans so screen readers pronounce them correctly.

## Copy and tone

- Short, warm, spoken Hinglish for merchant-facing prompts and status ("Paytm se verify ho raha hai…", "1 item check karna hai"). Plain English for system labels and the log.
- No hype words ("revolutionary", "magic", "AI-powered" badges). No robot or sparkle icons. Salaahkaar is introduced by name, not as "AI".
- Mode honesty in copy: mock payments say "Mock payment · not a real Paytm transaction".

## Do not

- Use gradients, glassmorphism, neon, heavy drop shadows or more than one accent colour.
- Put white text on sky-500.
- Show numbers without units or sources in Salaahkaar.
- Hide the mode badge, or show "Paid" before server verification.
- Add new screens or features outside the current build section.

## Deliverables per UI section

1. Tokens and fonts wired in `app/globals.css` and `app/layout.tsx` (first UI section only).
2. Components in `components/ui/` and `components/kirana/`, each with all listed states.
3. A dev-only `/styleguide` route that renders every component in every state with fixture data, for quick visual review.
4. Screens for the current section only, using typed fixtures until real data exists.

## Acceptance checks before calling UI work done

- Screenshots at 360 × 800 and 390 × 844 for each touched screen: no horizontal scroll, no clipped text, nothing under the bottom nav or the home indicator.
- Hindi strings render in Noto Sans Devanagari with no tofu boxes.
- Keyboard and focus order work on the styleguide page.
- `npm run check` and `npm run build` pass.
- Compare against `docs/mockups/*.png`: same structure, equal or better polish.
- Report what is implemented, what uses fixtures, and what is still planned.
