// Product configuration that used to be copied as literals through the UI,
// the backend, and cron.json. Currency and timezone are still single-valued;
// they live here so a later per-user setting does not start as a search
// through route handlers.

/** Display currency. Balances are not multi-currency. */
export const currency = {
  symbol: 'KSh',
  /** Passed to `toLocaleString`. Undefined keeps the browser default. */
  locale: undefined as string | undefined,
} as const;

export const timezone = {
  cron: 'Africa/Nairobi',
} as const;

export const xpConfig = {
  perLevel: 500,
} as const;

export const defaultBuckets = ['Necessities', 'Investment', 'Fun', 'Luxuries'] as const;

export const defaultAccounts = ['M-Pesa', 'M-Shwari', 'KCB Bank', 'Cash'] as const;

/** Must stay in lockstep with `Frequency` in `shared/types.ts`. */
export const frequencies = ['daily', 'weekly', 'monthly', 'yearly'] as const;

/**
 * Caps of the current document store. `list` truncates silently, and several
 * money guards (period idempotency, deduction idempotency) only see rows
 * inside the cap. A SQL adapter should ignore these and read the full set.
 */
export const listLimits = {
  goals: 100,
  events: 200,
  commitments: 100,
  profile: 1,
  buckets: 50,
  accounts: 50,
  /** Cron walks profiles until this cap, then stops. */
  cronProfiles: 500,
} as const;
