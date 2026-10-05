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
     ├── QuestLedgerClient          ← the only thing the UI knows about
     │
     └── Platform SDK (auth, api, db)   ← src/client.platform.ts, one file
             │
             └── user-scoped financial records
```

Authentication and every financial API route are user-scoped, so financial records
are read and written against the signed-in user.

> **Caveat — this is not yet a full isolation guarantee.** `claim()`
> (`backend/index.ts:22`) lists all six tables **unfiltered** and assigns every row
> lacking an `ownerUserId` to the calling user. It runs on every `GET /api/state`
> via `defaults()` (`:127`). For rows that already carry an owner this is a no-op,
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

The repository can be inspected and developed as a standard Vite/React project, but the authenticated application requires the platform's runtime for its backend, database, and authentication features — those SDK packages are supplied by the host and are not in `package.json`, so `npm run dev` will not work standalone.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Project structure

```text
QuestLedger/
├── src/
│   ├── App.tsx
│   ├── client.ts               the interface the UI depends on
│   ├── client.platform.ts      its one implementation — the seam
│   ├── index.css
│   └── main.tsx
├── shared/
│   └── types.ts                types shared by UI and backend
├── backend/
│   ├── index.ts
│   ├── realtime.ts             (dead code)
│   └── realtime-subscribers.ts (dead code)
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

The current AppDeploy build has six end-to-end scenarios in [`tests/tests.json`](./tests/tests.json): commitment creation with a valid schedule; sign-in and the funded recurring workspace; quest edit and target adjustment; quest archive with explicit reallocation; commitment edit and archive; and the archive guardrails. Automated endpoint coverage is not exhaustive; these six are the primary regression suite and should be run before any migration cutover.

Coverage is thinner than the file count suggests. Only the archive-guardrail scenario is a negative test, and **none of the six covers** float precision or rounding, partial/underfunded deduction, `commitment_deduction` idempotency, the list-cap behaviour, or the cron `processCommitments` path at all — which is the entire `GET /api/state` bootstrap (`:22`–`:211`). Note also that these scenarios are declarative and **are not executable from this repository**; they are run by the platform's agent against a deployed build.

## Roadmap

- More meaningful and transparent financial-character stat calculations
- Richer goal milestones and achievements
- Better analytics over time
- Scheduled/recurring saving quests
- Optional real-money wallet functionality in a later phase
- Portable backend/auth provider support

## Open source

QuestLedger is released under the MIT License. See [LICENSE](LICENSE).
