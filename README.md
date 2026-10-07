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

The production app runs on a managed platform that supplies its auth, API, and
database. The vendor is deliberately not named here: the app reaches it through
a single interface, so the backend is swappable without touching the product code.

```text
React + Vite
     │
     ├── views                         ← components know nothing about transport
     ├── useSession                    ← auth, snapshot, write-then-refetch
     ├── Ledger API                    ← the only place HTTP paths are written
     └── QuestLedgerClient             ← src/client.platform.ts, one file
             │
             └── QuestLedger API
                     │
                     ├── HTTP routes
                     ├── domain (money rules)
                     └── LedgerStore   ← backend/platform.ts today; Postgres later
```

Authentication and every financial API route are user-scoped, so financial records
are read and written against the signed-in user.

> **Caveat — this is not yet a full isolation guarantee.** `claim()`
> in `backend/domain/ledger.ts` lists all six tables **unfiltered** and assigns every row
> lacking an `ownerUserId` to the calling user. It runs on every `GET /api/state`
> via `defaults()`. For rows that already carry an owner this is a no-op,
> which is why it has gone unnoticed — but in a multi-user deployment it is a
> cross-user data-assignment primitive. See
> [`DECOUPLING_AUDIT.md` §5](./docs/DECOUPLING_AUDIT.md) and decision note `claim()`
> in [`handoff.md`](./docs/handoff.md). It must not be carried into any new backend.

### Portability status

The provider boundary is in place: the UI depends on the `QuestLedgerClient`
interface, and exactly one file implements it over the current platform
(`src/client.platform.ts`). Swapping the backend means replacing that one file.

That work is **in progress, not complete**. The backend still reads and writes
through the platform SDK, and money-moving routes do read-modify-write without
database transactions — so the platform still constrains correctness, not just
deployment. The current gaps, blockers, and migration sequence are tracked in
[`docs/handoff.md`](./docs/handoff.md).

The repository remains a mirror of the deployed app, so the platform is
authoritative and GitHub is downstream.

## Local development

The AppDeploy build still needs that host's SDK. This repo can also talk to Neon with no Docker, and the same API deploys to Vercel.

1. Create a Neon project and copy the pooled connection string (the host contains `-pooler`).
2. Copy [`.env.example`](./.env.example) to `.env` and fill `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, and `APP_ORIGIN`.
3. For Google, Apple, or X, register the callback `http://localhost:5173/api/auth/callback/google` (and `apple`, `x`) and put the client secrets in `.env`. Email and password work without those.
4. Apply the schema and start both processes:

```bash
npm install
npm run db:schema
npm run dev:api
npm run dev
```

`VITE_AUTH=http` makes the UI call this API. Leave it unset for an AppDeploy build. On Vercel, set the same server variables plus `VITE_AUTH=http`. `vercel.json` schedules deductions every five minutes in UTC (a Hobby plan may only allow a daily cron). `npm run cron` runs them once against Neon.

Production build:

```bash
npm run build
```

## Project structure

```text
QuestLedger/
├── src/
│   ├── main.tsx                HTTP client when VITE_AUTH=http, otherwise the platform client
│   ├── App.tsx                 shell: tabs, modals, which view is showing
│   ├── session/useSession.ts   auth and the refetch-after-write cycle
│   ├── api/ledger.ts           named calls; the only HTTP paths in the UI
│   ├── components/             views, one concern per file
│   ├── format/display.ts
│   ├── client.ts               the interface the UI depends on
│   └── client.platform.ts      its one implementation — the seam
├── shared/
│   ├── types.ts                types shared by UI and backend
│   ├── accounting.ts           conservation totals and character stats
│   ├── money.ts                the only parser for amounts from outside
│   └── config.ts               currency, defaults, list caps
├── api/                        Vercel function for /api/*
├── backend/
│   ├── index.ts                AppDeploy entry: handler + processCommitments
│   ├── dev-server.ts           local API
│   ├── store.neon.ts           Neon LedgerStore
│   ├── http/routes.ts          auth and status codes, no money rules
│   ├── domain/                 ledger commands and the due-date calendar
│   ├── store.ts                persistence port
│   ├── platform.ts             the only live SDK import
│   ├── realtime.ts             dead code, not deleted — see handoff step 1
│   └── realtime-subscribers.ts dead code, same reason
├── tests/
│   └── tests.json
├── docs/                       decoupling brief, audit, handoff
├── <platform>.auth-login.json  auth config (filename set by the host)
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
