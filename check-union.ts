// Proves the Goal union still narrows at the money-critical selectors.
import {
  activeQuests,
  allocatedToActiveQuests,
  archivedQuests,
  reservedInCommitments,
  totalHeld,
} from './shared/accounting';
import { isPeriod } from './shared/types';
import type { Goal, State } from './shared/types';

const empty: State = {
  goals: [],
  accounts: [],
  buckets: [],
  commitments: [],
  events: [],
  xp: 0,
  unallocated: 0,
  stats: {
    integrity: 100,
    discipline: 0,
    consistency: 0,
    balance: 50,
    power: 0,
    adaptability: 0,
  },
};
const state: State = empty;

const goalAllocated = allocatedToActiveQuests(state.goals);
const commitmentReserved = reservedInCommitments(state.commitments);
const totalMoney = totalHeld(state.unallocated, state.goals, state.commitments);
const active = activeQuests(state.goals);
const archives = archivedQuests(state.goals);

const c = state.commitments[0];
const linked = state.goals
  .filter((g) => g.commitmentId === c!.id)
  .sort((a, b) => (b.periodKey || '').localeCompare(a.periodKey || ''))
  .slice(0, 8);
const pk: (string | undefined)[] = linked.map((g) => g.periodKey);
const ps: (string | undefined)[] = linked.map((g) => g.periodStatus);

const periods: Goal[] = state.goals.filter(isPeriod);
const keyIsString: boolean = periods.every((g) => typeof g.periodKey === 'string');

export { totalMoney, active, archives, pk, ps, keyIsString, goalAllocated, commitmentReserved };
