import { xpConfig } from './config.js';
import { isStandalone } from './types.js';
import type { Commitment, Goal } from './types';

/**
 * Standalone-quest `saved`, including archived rows.
 * Archive sets `saved` to 0. Counting archived rows keeps the conservation
 * total honest if a row still holds money. The dashboard uses
 * `allocatedToActiveQuests` instead, which hides archived quests.
 */
export function allocatedToQuests(goals: Goal[]): number {
  return goals.filter(isStandalone).reduce((s, g) => s + Number(g.saved || 0), 0);
}

/** Dashboard "quest allocations": standalone quests that are not archived. */
export function allocatedToActiveQuests(goals: Goal[]): number {
  return goals
    .filter((g) => isStandalone(g) && g.status !== 'archived')
    .reduce((s, g) => s + g.saved, 0);
}

export function reservedInCommitments(commitments: Commitment[]): number {
  return commitments.reduce((s, c) => s + Number(c.balance || 0), 0);
}

export function totalHeld(unallocated: number, goals: Goal[], commitments: Commitment[]): number {
  return unallocated + allocatedToActiveQuests(goals) + reservedInCommitments(commitments);
}

export function activeQuests(goals: Goal[]): Goal[] {
  return goals.filter(
    (g) => isStandalone(g) && (g.status === 'active' || g.status === 'completed'),
  );
}

export function archivedQuests(goals: Goal[]): Goal[] {
  return goals.filter((g) => isStandalone(g) && g.status === 'archived');
}

/** Estimated monthly outflow across every commitment row, archived included. */
export function monthlyOutflow(commitments: Commitment[]): number {
  return commitments.reduce((s, x) => {
    const amount = Number(x.amount || 0);
    return (
      s +
      (x.frequency === 'daily'
        ? amount * 30.4375
        : x.frequency === 'weekly'
          ? amount * 4.345
          : x.frequency === 'yearly'
            ? amount / 12
            : amount)
    );
  }, 0);
}

/** Totals of `money_added`, highest first. A blank source is "Unrecorded". */
export function cashBySource(
  events: { type: string; amount?: number; source?: string }[],
): { source: string; amount: number }[] {
  const totals = new Map<string, { source: string; amount: number }>();
  for (const event of events) {
    if (event.type !== 'money_added') continue;
    const raw = (event.source || '').trim();
    const key = raw.toLowerCase();
    const row = totals.get(key) ?? { source: raw || 'Unrecorded', amount: 0 };
    row.amount += Number(event.amount || 0);
    totals.set(key, row);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount || a.source.localeCompare(b.source));
}

/**
 * Totals of `money_added` by the location recorded on the inflow, highest first.
 * Saved locations with no inflow stay at zero. A blank location is "Unspecified".
 */
export function cashByLocation(
  events: { type: string; amount?: number; location?: string }[],
  accounts: { name: string }[] = [],
): { location: string; amount: number }[] {
  const totals = new Map<string, { location: string; amount: number }>();
  const rowFor = (name: string) => {
    const raw = name.trim();
    const key = raw.toLowerCase();
    const row = totals.get(key) ?? { location: raw || 'Unspecified', amount: 0 };
    totals.set(key, row);
    return row;
  };
  for (const account of accounts) {
    if (account.name.trim()) rowFor(account.name);
  }
  for (const event of events) {
    if (event.type !== 'money_added') continue;
    rowFor(event.location || '').amount += Number(event.amount || 0);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount || a.location.localeCompare(b.location));
}

export function levelProgress(xp: number) {
  const perLevel = xpConfig.perLevel;
  return {
    level: Math.max(1, Math.floor(xp / perLevel) + 1),
    into: xp % perLevel,
    perLevel,
  };
}

export function characterStats(input: {
  goals: Goal[];
  buckets: { name: string }[];
  events: { type: string }[];
  goalAllocated: number;
  commitmentReserved: number;
  unallocated: number;
}) {
  const completed = input.goals.filter((x) => x.status === 'completed' || x.status === 'archived').length;
  const contributions = input.events.filter((x) =>
    ['contribution', 'commitment_top_up'].includes(x.type),
  ).length;
  const adjustments = input.events.filter((x) =>
    ['transfer', 'expense', 'withdrawal', 'spend', 'commitment_spend', 'commitment_deduction', 'commitment_true_up'].includes(
      x.type,
    ),
  ).length;
  return {
    integrity: 100,
    discipline: Math.min(100, completed * 12),
    consistency: Math.min(100, contributions * 5),
    balance: Math.min(
      100,
      50 + input.buckets.filter((x) => input.goals.some((y) => y.bucket === x.name)).length * 10,
    ),
    power: Math.min(
      100,
      Math.round((input.goalAllocated + input.commitmentReserved + input.unallocated) / 1000),
    ),
    adaptability: Math.min(100, adjustments * 10),
  };
}
