# Kirana Shop AI

Team HackHorizon · Paytm Build for India AI Hackathon, Mumbai · Merchant Growth AI track

An AI business partner for neighbourhood merchants: **Counter** billing, a QR **Shop**, digital **Khata** and **Salaahkaar**, a Hindi/Hinglish voice adviser, all on one merchant profile and driven by Paytm payment events.

- Build plan and components: [PLAN.md](PLAN.md)
- Research notes (verified facts vs assumptions): [docs/research/notes.md](docs/research/notes.md)
- Round 1 pitch: [docs/pitch/](docs/pitch/)
- Concept screens: [docs/mockups/](docs/mockups/)

## Local development

Section 1 provides the Next.js App Router, React, strict TypeScript, Tailwind CSS,
ESLint and Vitest foundation. Business screens and external integrations come later.

Use Node.js 24 (`nvm use` if you use nvm), then:

```sh
npm ci
npm run dev
```

Open http://localhost:3000.

### Database (Section 2)

Development uses a local PostgreSQL 15+ database. Create it once, then load the demo data:

```sh
createdb kirana_dev && createdb kirana_test
cp .env.example .env.local   # DATABASE_URL=postgres:///kirana_dev
npm run db:reset             # applies migrations and loads the deterministic demo store
npm run test:db              # database integration tests against kirana_test
```

`npm run db:reset` replaces all data with the synthetic demo store. To allow
`POST /api/demo/reset` from the app, set `DEMO_RESET_ENABLED=true` and a random
`DEMO_RESET_SECRET` (16+ characters) in `.env.local`, and send it in the
`x-demo-reset-secret` header.
When connecting providers later, copy `.env.example` to `.env.local` and populate
the relevant values locally. Never paste secrets into source files or commit env files.
Only `NEXT_PUBLIC_` values may be exposed to the browser; all other credentials stay server-side.

```sh
npm run check       # ESLint, generated route types, TypeScript and Vitest
npm run build       # Production build
npm start           # Serve the production build
npm run test:watch  # Watch unit tests while developing
```

`GET /api/health` checks app liveness only, not database or provider connectivity.
The home page is a setup landing page, not the merchant app or a working PWA.

Development and production builds use Next.js's supported Webpack option because
Turbopack's CSS worker could not bind its internal port in this execution environment.

ESLint is pinned to 9.39.5 because Next.js's bundled React/accessibility/import
plugins do not yet declare ESLint 10 compatibility. npm flags ESLint 9 as deprecated;
upgrade it with those plugins when their peer dependencies support version 10.

## Structure and checkpoints

- `app/`: App Router pages and API routes
- `lib/`: upcoming application logic, AI and payment adapters
- `supabase/migrations/`: SQL schema (plain Postgres, Supabase-compatible)
- `lib/db/`, `lib/demo/`: database client, migrations runner, demo data generator and reset
- `scripts/db.ts`: `db:migrate` / `db:reset` CLI
- `n8n/workflows/`: reserved for approved-action workflows
- `tests/`: Vitest unit tests
- [Section checklist](docs/BUILD_SECTIONS.md): agreed implementation order

Foundation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
and [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
