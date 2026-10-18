import assert from 'node:assert/strict';
import { test } from 'node:test';
import { booksBalance } from './accounting.ts';
import type { Commitment, Goal } from './types.ts';

function quest(saved: number): Goal {
  return {
    id: 'quest',
    name: 'Quest',
    target: saved,
    saved,
    spent: 0,
    bucket: 'Fun',
    status: 'active',
    kind: 'goal',
    ownerUserId: 'user',
  };
}

function reserve(balance: number): Commitment {
  return {
    id: 'commitment',
    name: 'Rent',
    amount: 10000,
    frequency: 'monthly',
    kind: 'expense',
    bucket: 'Necessities',
    active: true,
    balance,
    ownerUserId: 'user',
  };
}

test('an inflow is held until it is spent', () => {
  const open = booksBalance({
    unallocated: 1000,
    goals: [],
    commitments: [],
    events: [{ type: 'money_added', amount: 1000 }],
  });
  assert.equal(open.agrees, true);

  const spent = booksBalance({
    unallocated: 800,
    goals: [],
    commitments: [],
    events: [
      { type: 'money_added', amount: 1000 },
      { type: 'expense', amount: 200 },
    ],
  });
  assert.equal(spent.agrees, true);
  assert.equal(spent.held + spent.left, spent.arrived);
});

test('a transfer between stocks cancels out', () => {
  const books = booksBalance({
    unallocated: 400,
    goals: [quest(600)],
    commitments: [],
    events: [
      { type: 'money_added', amount: 1000 },
      { type: 'contribution', amount: 600 },
      { type: 'transfer', amount: 100 },
    ],
  });
  assert.equal(books.agrees, true);
});

test('a true-up replaces the deduction and a migration counts as arrived', () => {
  const corrected = booksBalance({
    unallocated: 0,
    goals: [],
    commitments: [reserve(920)],
    events: [
      { type: 'money_added', amount: 1000 },
      { type: 'commitment_deduction', amount: 100, commitmentId: 'commitment', reason: 'period:2026-10-16' },
      { type: 'commitment_true_up', amount: 80, commitmentId: 'commitment', reason: 'period:2026-10-16' },
    ],
  });
  assert.equal(corrected.left, 80);
  assert.equal(corrected.agrees, true);

  const migrated = booksBalance({
    unallocated: 0,
    goals: [],
    commitments: [reserve(500)],
    events: [{ type: 'commitment_migration', amount: 500, commitmentId: 'commitment' }],
  });
  assert.equal(migrated.agrees, true);
});

test('a true-up with no matching deduction does not agree', () => {
  const books = booksBalance({
    unallocated: 1000,
    goals: [],
    commitments: [],
    events: [
      { type: 'money_added', amount: 1000 },
      { type: 'commitment_true_up', amount: 80, commitmentId: 'commitment', reason: 'period:2026-10-16' },
    ],
  });
  assert.equal(books.agrees, false);
});
