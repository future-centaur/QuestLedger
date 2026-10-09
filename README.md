# QuestLedger

QuestLedger is a financial RPG that turns savings goals into quests and financial behavior into character development.

## Product model

- Create a savings goal/quest.
- Tag it with a bucket such as Necessities, Investment, Fun, or Luxuries.
- Choose the account where the money is being kept (for example M-Pesa, M-Shwari, a bank, or cash).
- Contribute arbitrary amounts over time.
- Earn XP when goals are completed.
- Open any goal to see its contribution and adjustment timeline.
- Rebalance between goals or record an expense/withdrawal without erasing history.
- Track Integrity, Discipline, Consistency, Balance, Saving Power, and Adaptability.

## Financial integrity

QuestLedger intentionally tracks assigned/expected balances rather than verified external account balances. The app therefore depends on user accountability. If money that was assigned to a goal is actually spent elsewhere, the user records the change and rebalances rather than rewriting history.

> Integrity over perfection: unexpected expenses are not failure; hiding the new reality is.

## Current architecture

The app runs as a Vite UI and a Node API, backed by Neon Postgres. The same API process serves local development and Vercel. Sign-in is email and password, or Google, Apple, and X.

```text
React + Vite
     │
     ├── views
     ├── useSession
     └── HTTP client
             │
             └── QuestLedger API
                     │
                     ├── domain (money rules)
                     └── Neon
```

Authentication and every financial API route are user-scoped, so financial records
are read and written against the signed-in user.

Money commands run inside a database transaction. Two requests at the same time can still overwrite a balance until the update itself checks the current amount.

## Local development

Fill [`.env`](./.env) from [`.env.example`](./.env.example), then:

```bash
npm install
npm run dev
```

That applies any pending database migrations, starts the API, and starts the UI at `http://localhost:5173`. On Vercel the API applies those same migrations on startup. `vercel.json` schedules deductions every five minutes in UTC (a Hobby plan may only allow a daily cron). `npm run cron` runs them once against Neon.

Production build:

```bash
npm run build
```

## Project structure

```text
QuestLedger/
├── src/
│   ├── main.tsx                starts the UI against the HTTP API
│   ├── App.tsx                 shell: tabs, modals, which view is showing
│   ├── session/useSession.ts   auth and the refetch-after-write cycle
│   ├── api/ledger.ts           named calls; the only HTTP paths in the UI
│   ├── components/             views, one concern per file
│   ├── format/display.ts
│   ├── client.ts               the interface the UI depends on
│   └── client.http.ts          browser client for the API
├── shared/
│   ├── types.ts                types shared by UI and backend
│   ├── accounting.ts           conservation totals and character stats
│   ├── money.ts                the only parser for amounts from outside
│   └── config.ts               currency, defaults, list caps
├── api/                        Vercel function for /api/*
├── backend/
│   ├── dev.ts                  npm run dev: migrate, API, and Vite
│   ├── store.neon.ts           Neon LedgerStore
│   ├── http/                   API handler
│   ├── db/migrations/          ordered SQL, applied once each
│   ├── domain/                 ledger commands
│   └── store.ts                persistence port
├── tests/
│   └── tests.json
├── docs/                       decoupling brief, audit, handoff
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
├── check-types.sh              local typecheck
├── sdk-shim.d.ts               ambient SDK decls, not shipped
├── .gitignore
├── LICENSE
└── README.md
```

## QA

The current build has six end-to-end scenarios in [`tests/tests.json`](./tests/tests.json): commitment creation with a valid schedule; sign-in and the funded recurring workspace; quest edit and target adjustment; quest archive with explicit reallocation; commitment edit and archive; and the archive guardrails. Automated endpoint coverage is not exhaustive; these six are the primary regression suite and should be run before any migration cutover.

Coverage is thinner than the file count suggests. Only the archive-guardrail scenario is a negative test, and **none of the six covers** float precision or rounding, partial/underfunded deduction, `commitment_deduction` idempotency, the list-cap behaviour, or the cron `processCommitments` path at all — which is the `GET /api/state` bootstrap in `backend/domain/ledger.ts`. Note also that these scenarios are declarative and **are not executable from this repository**; they are run by the platform's agent against a deployed build.

## Roadmap

- More meaningful and transparent financial-character stat calculations
- Richer goal milestones and achievements
- Better analytics over time
- Scheduled/recurring saving quests
- Optional real-money wallet functionality in a later phase
- Portable backend/auth provider support

## Open source

QuestLedger is released under the MIT License. See [LICENSE](LICENSE).
