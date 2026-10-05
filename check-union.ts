// Isolated check of the App.tsx money expressions against the shared union,
// without React. Reproduces lines 30-34 verbatim so the discriminated-union
// types are actually verified rather than masked by missing React types.
import type { State, Goal } from './shared/types';

const empty: State = { goals: [], accounts: [], buckets: [], commitments: [], events: [], xp: 0, unallocated: 0, stats: { integrity: 100, discipline: 0, consistency: 0, balance: 50, power: 0, adaptability: 0 } };
const state: State = empty;

const goalAllocated = state.goals.filter(g => !g.commitmentId && g.status !== 'archived').reduce((s, g) => s + g.saved, 0);
const commitmentReserved = state.commitments.reduce((s, c) => s + Number(c.balance || 0), 0);
const totalMoney = state.unallocated + goalAllocated + commitmentReserved;
const activeGoals = state.goals.filter(g => !g.commitmentId && (g.status === 'completed' || g.status === 'active'));
const archives = state.goals.filter(g => g.status === 'archived' && !g.commitmentId);

// CommitmentDetail's linked-periods expression (App.tsx:93)
const c = state.commitments[0];
const linked = state.goals.filter(g => g.commitmentId === c!.id).sort((a, b) => (b.periodKey || '').localeCompare(a.periodKey || '')).slice(0, 8);
// The narrowed element must expose periodKey/periodStatus as strings.
const pk: (string | undefined)[] = linked.map(g => g.periodKey);
const ps: (string | undefined)[] = linked.map(g => g.periodStatus);

// isPeriod must discriminate the union.
const periods: Goal[] = state.goals.filter(g => Boolean(g.commitmentId));
const keyIsString: boolean = periods.every(g => typeof (g.commitmentId === undefined ? '' : g.periodKey) === 'string');

export { totalMoney, activeGoals, archives, pk, ps, keyIsString, goalAllocated, commitmentReserved };