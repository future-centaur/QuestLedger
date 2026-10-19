# QuestLedger

QuestLedger is a financial RPG that turns savings goals into quests and financial behavior into character development.

## Product model

Money sits in three stocks: unallocated, a quest's saved balance, and a commitment's reserve. At hand is those three added together.

- Add money into unallocated. Record where it came from and, optionally, where it arrived. A location total is what was recorded there, not how much is still there.
- Assign unallocated money to a quest or a commitment.
- Tag a quest with a bucket such as Necessities, Investment, Fun, or Luxuries, and a place such as M-Pesa, M-Shwari, a bank, or cash.
- Completing a quest does not spend its money. Spending is recorded on its own and drains one stock.
- A commitment keeps a budget for the next cycle and a reserve, which is the stock. Recording the real cost can close the cycle. A true-up later replaces an estimated day with the actual.
- Rebalance between stocks without erasing history.
- Earn XP for those actions. The character tracks Integrity, Discipline, Consistency, Balance, Saving Power, and Adaptability.

## Financial integrity

QuestLedger tracks the money you assign, not a verified bank or M-Pesa balance. If assigned money is spent another way, you record it. The app does not discover that spend.

Amounts are exact cents. A stock update adds to the amount stored in the database and refuses to go below zero, so two requests at once cannot overwrite the same balance. A money command that fails is rolled back. What you hold, plus what has left, must equal what arrived. When it does not, the dashboard says so and the next money command is refused. The books are not rewritten to force a match.

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

Money commands run inside a database transaction. The stock update itself checks the current amount.

## Local development

Fill [`.env`](./.env) from [`.env.example`](./.env.example), then:

```bash
npm install
npm run dev
```

That applies any pending database migrations, starts the API, and starts the UI at `http://localhost:5173`. On Vercel the API applies those same migrations on startup. `vercel.json` runs commitment deductions once a day at 00:00 UTC. `npm run cron` runs them once against Neon.

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
│   ├── accounting.ts           the three stocks, the history check, and character stats
│   ├── money.ts                parses an amount into integer cents
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
├── .gitignore
├── LICENSE
└── README.md
```

## QA

[`tests/tests.json`](./tests/tests.json) is six scenario notes: creating a commitment, reaching the funded workspace, editing a quest and its target, archiving a quest and reallocating, editing and archiving a commitment, and the archive guardrails. They are not executable from this repository.

The checks that do run are:

```bash
node --import tsx --test shared/money.test.ts shared/books.test.ts backend/store.race.test.ts
```

They cover exact cents, the history check, and two stock updates at the same time. They do not walk the UI.

## Roadmap

- M-Pesa first, as a check against that account, before any bank. A location stays a record of what arrived there.
- More meaningful character stats
- Richer milestones and achievements
- Better analytics over time

## Open source

QuestLedger is released under the MIT License. See [LICENSE](LICENSE).
