// Shared domain types for QuestLedger.
//
// Imported by BOTH `src/App.tsx` and `backend/index.ts`. Before this module the
// shapes were duplicated structurally across the trust boundary and had already
// drifted: `Account`, `Bucket`, `State` and `recurringHealth` existed only in the
// frontend, the backend had no `Profile` type and reached it through `as any`, and
// the backend's `Commitment` omitted `archived` despite writing it.
//
// Two deliberate choices:
//
// 1. Money fields stay `number` (float64) here. That is the current, wrong
//    behaviour — decision D2 in docs/handoff.md calls for NUMERIC(14,2) or integer
//    minor units at the Postgres move. Typing them as a branded `Money` now would
//    make the ~120 arithmetic sites fail to compile with no runtime benefit, and
//    this repo cannot typecheck `backend/` anyway (tsconfig `include: ["src"]`).
//    Deliberately not fixed here.
//
// 2. `Goal` is a discriminated union, not the current single loose type. This is
//    decision D1: the split into `goals` + `commitment_periods` is deferred to the
//    Postgres move, but naming the two cases now means the eventual split is a
//    schema migration rather than a ~20-site refactor. It also collapses the 11
//    backend + 9 frontend `if (g.commitmentId)` guards into one named predicate.

export type GoalKind = 'goal' | 'expense';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Money as float64 — see note (1) above. Not acceptable long-term (D2). */
export type Money = number;

export type Account = { id: string; name: string };
export type Bucket = { id: string; name: string };

/** 1:1 with user. Reached via `as any` in the backend at 11 sites today. */
export type Profile = {
  id: string;
  ownerUserId: string;
  xp?: number;
  unallocated?: Money;
};

export type Commitment = {
  id: string;
  name: string;
  amount: Money;
  frequency: Frequency | string;
  dueDay?: number;
  kind: GoalKind;
  bucket: string;
  account?: string;
  active: boolean;
  balance?: Money;
  nextDueAt?: string;
  /** Applied at the next deduction, then cleared. */
  pendingAmount?: Money;
  pendingFrequency?: Frequency | string;
  /** Guards `migrateCommitments()` from re-sweeping a commitment after import. */
  fundingMigrated?: boolean;
  /** Written at :404, read at :393. The audit's schema omitted it. */
  archived?: boolean;
  ownerUserId: string;
};

export type GoalBase = {
  id: string;
  name: string;
  target: Money;
  saved: Money;
  spent: Money;
  bucket: string;
  account?: string;
  deadline?: string;
  status: string;
  kind: GoalKind;
  ownerUserId: string;
  archived?: boolean;
};

/**
 * A standalone quest: owns money in `saved`.
 *
 * `?: undefined` rather than omitted so that a `CommitmentPeriod` is not
 * assignable to this branch — that is what makes the union discriminated on
 * `commitmentId` rather than merely documented.
 */
export type StandaloneQuest = GoalBase & {
  commitmentId?: undefined;
  periodKey?: undefined;
  periodStatus?: undefined;
};

/**
 * A period instance of a recurring commitment. **Holds no money** — the balance
 * lives on the commitment and this row is history only. Reading one as a funded
 * goal corrupts balances, which is why the distinction is now in the type system.
 */
export type CommitmentPeriod = GoalBase & {
  commitmentId: string;
  periodKey: string;
  periodStatus?: string;
};

export type Goal = StandaloneQuest | CommitmentPeriod;

/** The single replacement for the scattered `if (g.commitmentId)` guards. */
export const isPeriod = (g: Goal): g is CommitmentPeriod => Boolean(g.commitmentId);
export const isStandalone = (g: Goal): g is StandaloneQuest => !g.commitmentId;

// Rows on the way *in* have no `id` — the platform assigns it. The backend types
// rows both ways today via one `id?: string`, which is why its `Goal` is looser
// than the frontend's. Splitting read from write keeps both honest.
// `ownerUserId` is NOT optional here on purpose: `event()` stamps it centrally so
// callers cannot forget it, and these insert types keep that property.
export type NewStandaloneQuest = Omit<StandaloneQuest, 'id'>;
export type NewCommitmentPeriod = Omit<CommitmentPeriod, 'id'>;
export type NewCommitment = Omit<Commitment, 'id'>;

// Every `type:` passed to `event()` in backend/index.ts. `money_added` is the
// only source of money; the rest move it between pools or mark it spent.
// `cron` is the platform's own envelope discriminator, not one of these.
export type EventType =
  | 'money_added'
  | 'contribution'
  | 'transfer'
  | 'expense'
  | 'withdrawal'
  | 'spend'
  | 'completion'
  | 'goal_updated'
  | 'goal_target_change'
  | 'goal_archive'
  | 'commitment_created'
  | 'commitment_updated'
  | 'commitment_top_up'
  | 'commitment_spend'
  | 'commitment_deduction'
  | 'commitment_rebalance'
  | 'commitment_amount_change'
  | 'commitment_frequency_change'
  | 'commitment_pause'
  | 'commitment_resume'
  | 'commitment_archive'
  | 'commitment_migration';

export type Event = {
  id: string;
  type: EventType | string;
  amount: Money;
  from?: string;
  to?: string;
  goalId?: string;
  commitmentId?: string;
  createdAt: string;
  reason?: string;
  location?: string;
  /** Resolved at read time in `getState()` for timeline display. */
  fromName?: string;
  toName?: string;
  ownerUserId: string;
};

export type RecurringHealth = {
  totalReserved: Money;
  monthlyOutflow: Money;
  activeCount: number;
};

/** The shape `GET /api/state` returns — the single read endpoint. */
export type State = {
  goals: Goal[];
  accounts: Account[];
  buckets: Bucket[];
  commitments: Commitment[];
  events: Event[];
  xp: number;
  unallocated: Money;
  stats: Record<string, number>;
  recurringHealth?: RecurringHealth;
};

/**
 * What `auth.getUser()` / `auth.signIn()` return. Typed `any` in the frontend
 * today. `email` is what the data migration will key identity remapping on.
 */
export type User = {
  id?: string;
  name?: string;
  email?: string;
} | null;