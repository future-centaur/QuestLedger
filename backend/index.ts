import { router, json, error, db, requireAuth } from '@appdeploy/sdk';

type Goal = { id?: string; name: string; target: number; saved: number; spent: number; bucket: string; account?: string; deadline?: string; status: string; kind: 'goal' | 'expense'; ownerUserId: string; commitmentId?: string; periodKey?: string };
type Commitment = { name: string; amount: number; frequency: string; dueDay?: number; kind: 'goal' | 'expense'; bucket: string; account?: string; active: boolean; ownerUserId: string };
type Event = { type: string; amount: number; from?: string; to?: string; goalId?: string; createdAt: string; reason?: string; location?: string; ownerUserId: string };
type Owned = { ownerUserId?: string };
const tables = ['goals', 'accounts', 'buckets', 'events', 'profile', 'commitments'];

async function claim(userId: string) {
  for (const t of tables) {
    const r = await db.list<Owned>(t, { limit: 100 });
    const legacy = r.items.filter(x => !x.ownerUserId);
    if (legacy.length) await db.update(t, legacy.map(x => ({ id: x.id, record: { ...x, ownerUserId: userId } })));
  }
}
async function defaults(userId: string) {
  await claim(userId);
  const b = await db.list('buckets', { limit: 50, filter: { ownerUserId: userId } });
  if (!b.items.length) await db.add('buckets', [{ name: 'Necessities', ownerUserId: userId }, { name: 'Investment', ownerUserId: userId }, { name: 'Fun', ownerUserId: userId }, { name: 'Luxuries', ownerUserId: userId }]);
  const a = await db.list('accounts', { limit: 50, filter: { ownerUserId: userId } });
  if (!a.items.length) await db.add('accounts', [{ name: 'M-Pesa', ownerUserId: userId }, { name: 'M-Shwari', ownerUserId: userId }, { name: 'KCB Bank', ownerUserId: userId }, { name: 'Cash', ownerUserId: userId }]);
  const p = await db.list('profile', { limit: 1, filter: { ownerUserId: userId } });
  if (!p.items.length) await db.add('profile', [{ xp: 0, unallocated: 0, ownerUserId: userId }]);
}
async function xp(uid: string, n: number) {
  const r = await db.list('profile', { limit: 1, filter: { ownerUserId: uid } });
  const p = r.items[0];
  if (p) await db.update('profile', [{ id: p.id, record: { ...p, xp: ((p as any).xp || 0) + n } }]);
}
async function profile(uid: string) {
  const r = await db.list('profile', { limit: 1, filter: { ownerUserId: uid } });
  return r.items[0];
}
function periodKey(frequency: string, now = new Date()) {
  if (frequency === 'daily') return now.toISOString().slice(0, 10);
  if (frequency === 'weekly') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1);
    return d.toISOString().slice(0, 10);
  }
  if (frequency === 'yearly') return String(now.getUTCFullYear());
  return now.toISOString().slice(0, 7);
}
async function ensureInstances(uid: string, commitments: Array<Commitment & { id: string }>) {
  const goals = await db.list<Goal>('goals', { limit: 100, filter: { ownerUserId: uid } });
  for (const c of commitments.filter(x => x.active)) {
    const key = periodKey(c.frequency);
    const exists = goals.items.some(g => g.commitmentId === c.id && g.periodKey === key);
    if (!exists) {
      await db.add('goals', [{ name: c.name + ' · ' + key, target: c.amount, saved: 0, spent: 0, bucket: c.bucket, account: c.account || '', status: 'active', kind: c.kind, commitmentId: c.id, periodKey: key, ownerUserId: uid }]);
    }
  }
}
async function getState(uid: string) {
  await defaults(uid);
  const commitments = (await db.list<Commitment>('commitments', { limit: 100, filter: { ownerUserId: uid } })).items;
  await ensureInstances(uid, commitments);
  const [g, b, a, e, p, c] = await Promise.all([
    db.list<Goal>('goals', { limit: 100, filter: { ownerUserId: uid } }),
    db.list('buckets', { limit: 50, filter: { ownerUserId: uid } }),
    db.list('accounts', { limit: 50, filter: { ownerUserId: uid } }),
    db.list<Event>('events', { limit: 100, filter: { ownerUserId: uid } }),
    db.list('profile', { limit: 1, filter: { ownerUserId: uid } }),
    db.list<Commitment>('commitments', { limit: 100, filter: { ownerUserId: uid } })
  ]);
  const names = new Map(g.items.map(x => [x.id, x.name]));
  const events = e.items.map(x => ({ ...x, fromName: x.from ? names.get(x.from) : undefined, toName: x.to ? names.get(x.to) : undefined }));
  const completed = g.items.filter(x => x.status === 'completed' || x.status === 'archived').length;
  const contributions = events.filter(x => x.type === 'contribution').length;
  const adjustments = events.filter(x => ['transfer', 'expense', 'withdrawal', 'spend'].includes(x.type)).length;
  const totalAllocated = g.items.reduce((s, x) => s + x.saved, 0);
  const unallocated = Number((p.items[0] as any)?.unallocated || 0);
  return { goals: g.items, accounts: a.items, buckets: b.items, commitments: c.items, events, unallocated, xp: (p.items[0] as any)?.xp || 0,
    stats: { integrity: 100, discipline: Math.min(100, completed * 12), consistency: Math.min(100, contributions * 5), balance: Math.min(100, 50 + b.items.filter((x: any) => g.items.some(y => y.bucket === x.name)).length * 10), power: Math.min(100, Math.round((totalAllocated + unallocated) / 1000)), adaptability: Math.min(100, adjustments * 10) } };
}
async function changeGoal(uid: string, id: string, delta: number) {
  const [g] = await db.get<Goal>('goals', [id]);
  if (!g || g.ownerUserId !== uid || g.saved + delta < 0) return false;
  return (await db.update('goals', [{ id, record: { ...g, saved: g.saved + delta } }]))[0];
}
const P = (fn: any) => [requireAuth(), fn];

export const handler = router({
  'GET /api/state': P(async c => json(await getState(c.user!.userId))),
  'POST /api/money': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (n <= 0) return error('Enter a positive amount', 400);
    const p = await profile(u); if (!p) return error('Profile unavailable', 500);
    if (!(await db.update('profile', [{ id: p.id, record: { ...p, unallocated: Number((p as any).unallocated || 0) + n } }]))[0]) return error('Could not add money', 500);
    const [id] = await db.add('events', [{ type: 'money_added', amount: n, location: x.location || '', createdAt: new Date().toISOString(), ownerUserId: u }]);
    if (!id) return error('Money was added but its history event failed', 500);
    await xp(u, 2); return json({ ok: true });
  }),
  'POST /api/goals': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.target);
    if (!x.name || n <= 0 || !x.bucket) return error('Missing required quest fields', 400);
    const [id] = await db.add('goals', [{ name: x.name, target: n, saved: 0, spent: 0, bucket: x.bucket, account: x.account || '', deadline: x.deadline, status: 'active', kind: x.kind === 'expense' ? 'expense' : 'goal', ownerUserId: u }]);
    return id ? json({ id }) : error('Could not create quest', 500);
  }),
  'POST /api/contributions': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.goalId || n <= 0) return error('Invalid allocation', 400);
    const p = await profile(u); const available = Number((p as any)?.unallocated || 0);
    if (!p || n > available) return error('Not enough unallocated money', 400);
    const [g] = await db.get<Goal>('goals', [x.goalId]);
    if (!g || g.ownerUserId !== u || g.status === 'archived') return error('Quest is not available for allocation', 400);
    if (!(await db.update('profile', [{ id: p.id, record: { ...p, unallocated: available - n } }]))[0]) return error('Could not allocate money', 500);
    if (!await changeGoal(u, x.goalId, n)) { await db.update('profile', [{ id: p.id, record: { ...p, unallocated: available } }]); return error('Could not update quest', 500); }
    const [id] = await db.add('events', [{ type: 'contribution', goalId: x.goalId, amount: n, createdAt: new Date().toISOString(), ownerUserId: u }]);
    if (!id) { await changeGoal(u, x.goalId, -n); await db.update('profile', [{ id: p.id, record: { ...p, unallocated: available } }]); return error('Allocation was not recorded', 500); }
    await xp(u, 5); return json({ ok: true });
  }),
  'POST /api/complete': P(async c => {
    const u = c.user!.userId; const [g] = await db.get<Goal>('goals', [(c.body as any).goalId]);
    if (!g || g.ownerUserId !== u || g.status !== 'active' || g.saved < g.target) return error('Quest is not ready to complete', 400);
    if (!(await db.update('goals', [{ id: (c.body as any).goalId, record: { ...g, status: 'completed' } }]))[0]) return error('Could not complete quest', 500);
    await db.add('events', [{ type: 'completion', goalId: g.id, amount: g.target, createdAt: new Date().toISOString(), ownerUserId: u }]); await xp(u, 100); return json({ ok: true });
  }),
  'POST /api/spend': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.goalId || n <= 0) return error('Enter a valid spending amount', 400);
    const [g] = await db.get<Goal>('goals', [x.goalId]);
    if (!g || g.ownerUserId !== u || g.status === 'archived' || n > g.saved) return error('Spending exceeds the remaining allocation', 400);
    const remaining = g.saved - n; const spent = (g.spent || 0) + n;
    const status = remaining === 0 ? 'archived' : g.status;
    if (!(await db.update('goals', [{ id: g.id, record: { ...g, saved: remaining, spent, status } }]))[0]) return error('Could not record spending', 500);
    const [id] = await db.add('events', [{ type: 'spend', goalId: g.id, amount: n, reason: x.reason || '', createdAt: new Date().toISOString(), ownerUserId: u }]);
    if (!id) { await db.update('goals', [{ id: g.id, record: { ...g } }]); return error('Spending was not recorded', 500); }
    await xp(u, 10); return json({ ok: true });
  }),
  'POST /api/rebalance': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.from || n <= 0) return error('Choose a source quest and positive amount', 400);
    if (!await changeGoal(u, x.from, -n)) return error('The source quest does not have enough allocation', 400);
    if (x.kind === 'transfer') {
      if (!x.to || x.to === x.from || !await changeGoal(u, x.to, n)) { await changeGoal(u, x.from, n); return error('Choose a different valid destination quest', 400); }
      const [id] = await db.add('events', [{ type: 'transfer', from: x.from, to: x.to, amount: n, reason: x.reason || '', createdAt: new Date().toISOString(), ownerUserId: u }]);
      if (!id) { await changeGoal(u, x.from, n); await changeGoal(u, x.to, -n); return error('Transfer was not recorded', 500); }
    } else {
      const [id] = await db.add('events', [{ type: x.kind === 'expense' ? 'expense' : 'withdrawal', goalId: x.from, amount: n, reason: x.reason || '', createdAt: new Date().toISOString(), ownerUserId: u }]);
      if (!id) { await changeGoal(u, x.from, n); return error('Adjustment was not recorded', 500); }
    }
    await xp(u, 10); return json({ ok: true });
  }),
  'POST /api/commitments': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const n = Number(x.amount);
    if (!x.name || n <= 0 || !x.frequency || !x.bucket) return error('Missing recurring commitment fields', 400);
    const [id] = await db.add('commitments', [{ name: x.name, amount: n, frequency: x.frequency, dueDay: Number(x.dueDay || 1), kind: x.kind === 'goal' ? 'goal' : 'expense', bucket: x.bucket, account: x.account || '', active: true, ownerUserId: u }]);
    return id ? json({ id }) : error('Could not create commitment', 500);
  }),
  'POST /api/commitments/toggle': P(async c => {
    const x = c.body as any; const u = c.user!.userId; const [cmt] = await db.get<Commitment>('commitments', [x.id]);
    if (!cmt || cmt.ownerUserId !== u) return error('Commitment not found', 404);
    if (!(await db.update('commitments', [{ id: x.id, record: { ...cmt, active: Boolean(x.active) } }]))[0]) return error('Could not update commitment', 500);
    return json({ ok: true });
  }),
  'POST /api/accounts': P(async c => { const x = c.body as any; if (!x.name) return error('Account name required', 400); const [id] = await db.add('accounts', [{ name: x.name, ownerUserId: c.user!.userId }]); return id ? json({ id }) : error('Could not add account', 500); }),
  'POST /api/buckets': P(async c => { const x = c.body as any; if (!x.name) return error('Bucket name required', 400); const [id] = await db.add('buckets', [{ name: x.name, ownerUserId: c.user!.userId }]); return id ? json({ id }) : error('Could not add bucket', 500); })
});