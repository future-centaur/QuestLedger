import { useEffect, useMemo, useState } from 'react';
import { api, auth } from '@appdeploy/client';
import { Plus, Target, Wallet, Shield, Flame, Scale, RefreshCw, ArrowRightLeft, Trophy, ChevronRight, X, LogIn, LogOut, Sparkles, Archive, Repeat2, Check, CircleDollarSign, CalendarDays } from 'lucide-react';

type Goal = {
  id: string; name: string; target: number; saved: number; spent: number;
  bucket: string; account: string; deadline?: string; status: string;
  kind: 'goal' | 'expense'; commitmentId?: string; periodKey?: string;
};
type Account = { id: string; name: string };
type Bucket = { id: string; name: string };
type Commitment = {
  id: string; name: string; amount: number; frequency: string; dueDay?: number;
  kind: 'goal' | 'expense'; bucket: string; account: string; active: boolean;
};
type Event = {
  id: string; type: string; amount: number; from?: string; to?: string; goalId?: string;
  createdAt: string; reason?: string; location?: string; fromName?: string; toName?: string;
};
type State = {
  goals: Goal[]; accounts: Account[]; buckets: Bucket[]; commitments: Commitment[];
  events: Event[]; xp: number; unallocated: number; stats: Record<string, number>;
};
const empty: State = { goals: [], accounts: [], buckets: [], commitments: [], events: [], xp: 0, unallocated: 0,
  stats: { integrity: 100, discipline: 0, consistency: 0, balance: 50, power: 0, adaptability: 0 } };
const money = (n: number) => `KSh ${Math.round(n).toLocaleString()}`;

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [state, setState] = useState(empty);
  const [tab, setTab] = useState('home');
  const [modal, setModal] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    auth.getUser().then(setUser).catch(() => setUser(null)).finally(() => setChecking(false));
  }, []);
  const login = async () => {
    setError('');
    try {
      const r = await auth.signIn({ scope: 'openid email profile offline_access' });
      setUser(r.user);
    } catch (e: any) {
      setError(e?.code === 'popup_blocked' ? 'Please allow popups to sign in.' :
        e?.code === 'popup_closed' ? 'Sign-in was cancelled.' : 'Could not sign in.');
    }
  };
  const logout = () => { setUser(null); setState(empty); auth.signOut().catch(() => {}); };
  const load = async () => { const r = await api.get('/api/state'); setState(r.data); };
  useEffect(() => { if (user) load().catch(() => setError('Could not load your private data.')); }, [user]);
  const mutate = async (path: string, body: Record<string, unknown>) => {
    setBusy(true); setError('');
    try { await api.post(path, body); await load(); setModal(null); setForm({}); }
    catch (e: any) { setError(e?.response?.data?.message || e?.response?.data?.error || 'Nothing was changed. Please try again.'); }
    finally { setBusy(false); }
  };
  const xpLevel = Math.max(1, Math.floor(state.xp / 500) + 1);
  const xpIn = state.xp % 500;
  const allocated = state.goals.reduce((s, g) => s + g.saved, 0);
  const totalMoney = state.unallocated + allocated;
  const activeGoals = state.goals.filter(g => g.status === 'active' || g.status === 'completed');
  const archives = state.goals.filter(g => g.status === 'archived');
  const create = () => mutate('/api/goals', {
    name: form.name, target: Number(form.target), bucket: form.bucket, account: form.account,
    deadline: form.deadline || undefined, kind: form.kind || 'goal'
  });
  const allocate = () => mutate('/api/contributions', { goalId: form.goalId, amount: Number(form.amount) });
  const addMoney = () => mutate('/api/money', { amount: Number(form.amount), location: form.location || '' });
  const adjust = () => mutate('/api/rebalance', { kind: form.kind || 'transfer', from: form.from, to: form.to, amount: Number(form.amount), reason: form.reason || '' });
  const complete = (g: Goal) => mutate('/api/complete', { goalId: g.id });
  const spend = (g: Goal, amount?: number) => mutate('/api/spend', { goalId: g.id, amount: amount || g.saved, reason: form.reason || '' });
  const createCommitment = () => mutate('/api/commitments', {
    name: form.name, amount: Number(form.amount), frequency: form.frequency, dueDay: Number(form.dueDay || 1),
    kind: form.kind || 'expense', bucket: form.bucket, account: form.account
  });
  const toggleCommitment = (c: Commitment) => mutate('/api/commitments/toggle', { id: c.id, active: !c.active });

  if (checking) return <div className='splash'><div className='crest'>Q</div><b>QuestLedger</b><span>Loading your financial world…</span></div>;
  if (!user) return <Landing onLogin={login} error={error} />;

  const nav = [['home', 'Dashboard'], ['goals', 'Quests'], ['commitments', 'Recurring'], ['archive', 'Archives'], ['stats', 'Character'], ['analysis', 'Analytics']];
  return <div className='shell'>
    <header>
      <div className='brand'><div className='crest'>Q</div><div><b>QuestLedger</b><span>Your financial RPG</span></div></div>
      <div className='userBar'><span>{user.name || user.email || 'Player'}</span><div className='level'><b>LEVEL {xpLevel}</b><div className='xp'><i style={{ width: `${xpIn / 5}%` }} /></div><small>{xpIn}/500 XP</small></div><button className='iconBtn' onClick={logout}><LogOut /></button></div>
    </header>
    <main>
      {error && <div className='errorBanner'>{error}<button onClick={() => setError('')}>×</button></div>}
      {tab === 'home' && <Dashboard state={state} total={totalMoney} allocated={allocated} goals={activeGoals.filter(g => g.status === 'active')} open={g => setModal('detail:' + g.id)} newGoal={() => { setForm({}); setModal('goal'); }} add={() => { setForm({}); setModal('money'); }} allocate={() => { setForm({}); setModal('contribute'); }} adjust={() => { setForm({}); setModal('rebalance'); }} />}
      {tab === 'goals' && <Goals goals={activeGoals} open={g => setModal('detail:' + g.id)} newGoal={() => { setForm({}); setModal('goal'); }} allocate={g => { setForm({ goalId: g.id }); setModal('contribute'); }} complete={complete} spend={g => { setForm({ goalId: g.id }); setModal('spend:' + g.id); }} />}
      {tab === 'commitments' && <Commitments commitments={state.commitments} goals={state.goals} newCommitment={() => { setForm({}); setModal('commitment'); }} toggle={toggleCommitment} />}
      {tab === 'archive' && <Archives goals={archives} open={g => setModal('detail:' + g.id)} />}
      {tab === 'stats' && <Character state={state} />}
      {tab === 'analysis' && <Analytics state={state} addBucket={() => { setForm({}); setModal('bucket'); }} addAccount={() => { setForm({}); setModal('account'); }} />}
    </main>
    <nav>{nav.map(([id, label]) => <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}>
      {id === 'home' ? <Target /> : id === 'goals' ? <Trophy /> : id === 'commitments' ? <Repeat2 /> : id === 'archive' ? <Archive /> : id === 'stats' ? <Shield /> : <Scale />}<span>{label}</span>
    </button>)}</nav>
    {modal?.startsWith('detail:') ? <GoalDetail goal={state.goals.find(g => g.id === modal.slice(7))} events={state.events} close={() => setModal(null)} allocate={g => { setForm({ goalId: g.id }); setModal('contribute'); }} spend={g => { setForm({ goalId: g.id }); setModal('spend:' + g.id); }} />
      : modal?.startsWith('spend:') ? <Modal title='Mark money as spent' close={() => setModal(null)}><Form modal='spend' form={form} setForm={setForm} state={state} submit={() => spend(state.goals.find(g => g.id === modal.slice(6))!, Number(form.amount))} busy={busy} /></Modal>
      : modal && <Modal title={modal === 'goal' ? 'New Quest' : modal === 'money' ? 'Add Unallocated Money' : modal === 'contribute' ? 'Allocate Money' : modal === 'rebalance' ? 'Adjust Allocation' : modal === 'commitment' ? 'New Recurring Commitment' : modal === 'account' ? 'Add Account' : 'Add Bucket'} close={() => setModal(null)}>
        <Form modal={modal} form={form} setForm={setForm} state={state} submit={modal === 'goal' ? create : modal === 'money' ? addMoney : modal === 'contribute' ? allocate : modal === 'rebalance' ? adjust : modal === 'commitment' ? createCommitment : v => mutate(modal === 'account' ? '/api/accounts' : '/api/buckets', { name: v?.name })} busy={busy} />
      </Modal>}
  </div>;
}

function Landing({ onLogin, error }: { onLogin: () => void; error: string }) {
  return <div className='landing'><header className='landingHeader'><div className='brand'><div className='crest'>Q</div><div><b>QuestLedger</b><span>Your financial RPG</span></div></div><button className='ghostBtn' onClick={onLogin}><LogIn /> Sign in</button></header>
    <main className='landingMain'><section className='landingHero'><div className='heroCopy'><div className='pill'><Sparkles /> FINANCIAL PROGRESS, MADE VISIBLE</div><h1>Give your money a <em>mission.</em></h1><p>Know what you have, what is allocated, what still needs funding, and what has already been spent.</p><div className='heroActions'><button className='primary big' onClick={onLogin}>Start your journey <ChevronRight /></button><span>No bank connection required.</span></div>{error && <div className='landingError'>{error}</div>}</div>
      <div className='characterPreview'><div className='previewTop'><span>QUESTLEDGER</span><b>FINANCIAL STATE</b></div><h3>Money with a mission</h3><div className='previewMoney'>KSh 50,000</div><div className='previewStats'><div><span>Unallocated</span><b>KSh 12,500</b></div><div><span>Allocated</span><b>KSh 37,500</b></div><div><span>Completed</span><b>4 quests</b></div><div><span>Spent</span><b>3 quests</b></div></div><div className='previewQuest'><span>EXAMPLE</span><b>Rent · KSh 20,000</b><strong>Allocated → Paid → Archived</strong></div></div></section>
      <section className='landingFeatures'><Feature icon='💰' title='Know your money' text='Start with a general figure instead of maintaining unnecessary pseudo-bank balances.'/><Feature icon='🎯' title='Allocate with purpose' text='Move unallocated money into goals and commitments as your plans become real.'/><Feature icon='✓' title='Separate achievement from spending' text='Completing a quest does not make the money disappear. Mark it spent when it actually leaves you.'/><Feature icon='🔄' title='Handle recurring reality' text='Rent, fuel, subscriptions and repayments become recurring commitments with individual history.'/></section>
      <section className='landingQuote'><p>Completion tells you what you achieved. Spending tells you what happened to the money.</p><span>— The QuestLedger rule</span></section></main><footer>QuestLedger · Your financial RPG</footer></div>;
}
function Feature({ icon, title, text }: { icon: string; title: string; text: string }) { return <div className='feature'><div>{icon}</div><h3>{title}</h3><p>{text}</p></div>; }

function Dashboard({ state, total, allocated, goals, open, newGoal, add, allocate, adjust }: { state: State; total: number; allocated: number; goals: Goal[]; open: (g: Goal) => void; newGoal: () => void; add: () => void; allocate: () => void; adjust: () => void }) {
  return <><section className='hero'><div><p className='eyebrow'>FINANCIAL CHARACTER</p><h1>Level {Math.max(1, Math.floor(state.xp / 500) + 1)} <em>Wealth Builder</em></h1><p className='muted'>Your money has a state. Your quests give it a mission.</p></div><div className='heroStat'><Shield /><strong>{state.stats.integrity}</strong><span>Integrity</span></div></section>
    <section className='moneyOverview'><div><span>Total money</span><strong>{money(total)}</strong></div><div><span>Unallocated</span><strong className='lime'>{money(state.unallocated)}</strong></div><div><span>Allocated</span><strong>{money(allocated)}</strong></div></section>
    <div className='actions'><button className='primary' onClick={add}><CircleDollarSign /> Add money</button><button onClick={allocate}><Target /> Allocate</button><button onClick={newGoal}><Plus /> New quest</button><button onClick={adjust}><ArrowRightLeft /> Adjust</button></div>
    <div className='sectionHead'><h2>Active quests</h2><button onClick={newGoal}>New <ChevronRight /></button></div>
    {goals.length ? <div className='grid'>{goals.slice(0, 4).map(g => <GoalCard key={g.id} g={g} open={open} allocate={allocate} complete={() => {}} spend={() => {}} />)}</div> : <Empty newGoal={newGoal} />}
    <section className='two'><div className='panel'><div className='panelTitle'><Wallet /> Current allocation</div>{goals.slice(0, 5).map(g => <div className='accountRow' key={g.id}><span>{g.name}</span><b>{money(g.saved)}</b></div>)}{!goals.length && <p className='muted'>Nothing is allocated yet.</p>}<div className='integrity'><Shield /><span>Allocated balances remain yours until you mark money as spent.</span></div></div>
      <div className='panel tip'><Repeat2 /><h3>Recurring commitments</h3><p>Rent, fuel, subscriptions and repayments can generate individual quests for each period.</p></div></section></>;
}

function GoalCard({ g, open, allocate, complete, spend }: { g: Goal; open: (g: Goal) => void; allocate: () => void; complete: () => void; spend: () => void }) {
  const p = Math.min(100, g.target ? (g.saved / g.target) * 100 : 0);
  return <article className='card goalClickable' onClick={() => open(g)}><div className='tag'>{g.kind === 'expense' ? 'EXPENSE' : 'GOAL'} · {g.bucket}</div><h3>{g.name}</h3>
    <div className='amount'>{money(g.saved)} <small>/ {money(g.target)}</small></div><div className='bar'><i style={{ width: `${p}%` }} /></div>
    <div className='meta'><span>{g.saved >= g.target ? 'Ready' : `${money(g.target - g.saved)} remaining`}</span><span>{g.account}</span></div>
    <div className='cardActions'><button onClick={e => { e.stopPropagation(); allocate(); }}><Plus /> Allocate</button>
      {g.saved >= g.target && g.status === 'active' && <button className='complete' onClick={e => { e.stopPropagation(); complete(); }}><Check /> Complete</button>}
      {g.saved > 0 && <button className='spend' onClick={e => { e.stopPropagation(); spend(); }}>Spent</button>}</div></article>;
}

function Goals({ goals, open, newGoal, allocate, complete, spend }: { goals: Goal[]; open: (g: Goal) => void; newGoal: () => void; allocate: (g: Goal) => void; complete: (g: Goal) => void; spend: (g: Goal) => void }) {
  return <><div className='pageTitle'><div><p className='eyebrow'>QUEST LOG</p><h1>Active financial quests</h1><p className='muted'>Completed quests stay visible until they become history.</p></div><button className='primary' onClick={newGoal}><Plus /> New quest</button></div>
    {goals.length ? <div className='grid'>{goals.map(g => <GoalCard key={g.id} g={g} open={open} allocate={() => allocate(g)} complete={() => complete(g)} spend={() => spend(g)} />)}</div> : <Empty newGoal={newGoal} />}</>;
}

function Commitments({ commitments, goals, newCommitment, toggle }: { commitments: Commitment[]; goals: Goal[]; newCommitment: () => void; toggle: (c: Commitment) => void }) {
  return <><div className='pageTitle'><div><p className='eyebrow'>RECURRING</p><h1>Commitments</h1><p className='muted'>Rules that create individual quests for each period.</p></div><button className='primary' onClick={newCommitment}><Plus /> New commitment</button></div>
    <div className='commitmentGrid'>{commitments.map(c => {
      const instance = goals.filter(g => g.commitmentId === c.id && g.status !== 'archived').sort((a, b) => (b.periodKey || '').localeCompare(a.periodKey || ''))[0];
      return <article className='card' key={c.id}><div className='commitHead'><span className='tag'><Repeat2 /> {c.frequency}</span><button className={c.active ? 'toggleOn' : 'toggleOff'} onClick={() => toggle(c)}>{c.active ? 'Active' : 'Paused'}</button></div>
        <h3>{c.name}</h3><div className='amount'>{money(c.amount)} <small>/ {c.frequency}</small></div>
        <div className='meta'><span>{c.kind === 'expense' ? 'Expense' : 'Goal'}</span><span>{instance ? `Current: ${instance.status}` : 'Waiting for next period'}</span></div></article>;
    })}</div>
    {!commitments.length && <div className='empty'><Repeat2 /><h3>No recurring commitments</h3><p>Turn repeating real-life obligations into recurring quests.</p><button className='primary' onClick={newCommitment}>Create commitment</button></div>}</>;
}

function Archives({ goals, open }: { goals: Goal[]; open: (g: Goal) => void }) {
  return <><div className='pageTitle'><div><p className='eyebrow'>HISTORY</p><h1>Archives</h1><p className='muted'>Finished quests and money that has left your hands.</p></div></div>
    {goals.length ? <div className='grid'>{goals.map(g => <article className='card goalClickable' key={g.id} onClick={() => open(g)}><div className='tag'><Archive /> ARCHIVED</div><h3>{g.name}</h3><div className='amount'>{money(g.spent)} <small>spent</small></div><div className='meta'><span>{g.kind === 'expense' ? 'Expense' : 'Goal'}</span><span>{g.periodKey || g.deadline || 'Completed'}</span></div></article>)}</div> : <div className='empty'><Archive /><h3>Your archive is empty</h3><p>Completed and fully spent quests will appear here.</p></div>}</>;
}

function GoalDetail({ goal, events, close, allocate, spend }: { goal?: Goal; events: Event[]; close: () => void; allocate: (g: Goal) => void; spend: (g: Goal) => void }) {
  if (!goal) return null;
  const es = events.filter(e => e.goalId === goal.id || e.from === goal.id || e.to === goal.id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const amt = (e: Event) => e.type === 'contribution' ? e.amount : e.type === 'spend' ? -e.amount : e.from === goal.id ? -e.amount : e.to === goal.id ? e.amount : e.amount;
  const label = (e: Event) => e.type === 'contribution' ? 'Allocated from unallocated money' : e.type === 'spend' ? `Money spent${e.reason ? ' — ' + e.reason : ''}` : e.type === 'completion' ? 'Quest completed' : e.type === 'transfer' ? (e.from === goal.id ? `Moved to ${e.toName || 'another quest'}` : `Received from ${e.fromName || 'another quest'}`) : e.type === 'money_added' ? `Money added${e.location ? ' · ' + e.location : ''}` : e.type;
  return <div className='overlay'><div className='modal detailModal'><div className='modalHead'><div><p className='eyebrow'>QUEST HISTORY</p><h2>{goal.name}</h2></div><button onClick={close}><X /></button></div>
    <div className='detailHero'><div><span className='tag'>{goal.kind === 'expense' ? 'EXPENSE' : 'GOAL'} · {goal.bucket}</span><div className='detailAmount'>{money(goal.saved)} <small>remaining allocation</small></div><p className='muted'>{goal.status === 'archived' ? 'Archived' : goal.status === 'completed' ? 'Completed' : 'Active'} · {money(goal.spent)} spent</p></div>
      {goal.status !== 'archived' && <div className='detailButtons'><button className='primary' onClick={() => allocate(goal)}><Plus /> Allocate</button>{goal.saved > 0 && <button className='spend' onClick={() => spend(goal)}>Mark spent</button>}</div>}</div>
    <h3>Activity</h3>{es.length ? <div className='timeline'>{es.map(e => <div className='timelineItem' key={e.id}><div className={`eventDot ${amt(e) >= 0 ? 'positive' : 'negative'}`} /><div className='eventBody'><div><b>{label(e)}</b><strong className={amt(e) >= 0 ? 'positiveText' : 'negativeText'}>{amt(e) >= 0 ? '+' : '−'}{money(Math.abs(amt(e)))}</strong></div><small>{new Date(e.createdAt).toLocaleString()}</small></div></div>)}</div> : <p className='muted'>No activity yet.</p>}
    <div className='integrity'><Shield /><span>Completion and spending are separate events. The history records both.</span></div></div></div>;
}

function Character({ state }: { state: State }) {
  const rows: [string, number, typeof Shield][] = [['Financial Integrity', state.stats.integrity, Shield], ['Goal Discipline', state.stats.discipline, Trophy], ['Consistency', state.stats.consistency, Flame], ['Balance', state.stats.balance, Scale], ['Saving Power', state.stats.power, Wallet], ['Adaptability', state.stats.adaptability, RefreshCw]];
  return <><div className='pageTitle'><div><p className='eyebrow'>CHARACTER SHEET</p><h1>Financial character</h1><p className='muted'>Your stats reflect behavior, not wealth.</p></div></div><div className='statsGrid'>{rows.map(([n, v, I]) => <div className='statCard' key={n}><I /><span>{n}</span><strong>{v}</strong><div className='bar'><i style={{ width: `${v}%` }} /></div></div>)}</div></>;
}

function Analytics({ state, addBucket, addAccount }: { state: State; addBucket: () => void; addAccount: () => void }) {
  const byBucket = useMemo(() => state.buckets.map(b => ({ ...b, total: state.goals.filter(g => g.bucket === b.name && g.status !== 'archived').reduce((s, g) => s + g.saved, 0) })), [state]);
  const total = byBucket.reduce((s, b) => s + b.total, 0) || 1;
  return <><div className='pageTitle'><div><p className='eyebrow'>INTELLIGENCE</p><h1>Financial picture</h1><p className='muted'>Buckets are tags for understanding your allocation patterns.</p></div></div>
    <div className='panel'><div className='panelTitle'><Wallet /> Unallocated</div><div className='bigMetric'>{money(state.unallocated)}</div><p className='muted'>Money available to allocate.</p></div>
    <div className='panel'><h3>By bucket</h3>{byBucket.map(b => <div className='analysisRow' key={b.name}><div><span>{b.name}</span><b>{money(b.total)}</b></div><div className='bar'><i style={{ width: `${b.total / total * 100}%` }} /></div><small>{Math.round(b.total / total * 100)}% of allocated money</small></div>)}<div className='manageRow'><button onClick={addBucket}><Plus /> Add bucket</button><button onClick={addAccount}><Wallet /> Add account</button></div></div>
    <div className='panel'><h3>Money locations</h3><p className='muted'>Locations are recorded when money is added; they do not create separate financial balances.</p>{state.events.filter(e => e.type === 'money_added' && e.location).slice(-8).reverse().map(e => <div className='accountRow' key={e.id}><span>{e.location}</span><b>{money(e.amount)}</b></div>)}</div></>;
}

function Empty({ newGoal }: { newGoal: () => void }) { return <div className='empty'><Target /><h3>No active quests</h3><p>Give your money a mission.</p><button className='primary' onClick={newGoal}>Create your first quest</button></div>; }
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className='overlay'><div className='modal'><div className='modalHead'><h2>{title}</h2><button onClick={close}><X /></button></div>{children}</div></div>; }

function Form({ modal, form, setForm, state, submit, busy }: { modal: string; form: Record<string, string>; setForm: (v: Record<string, string>) => void; state: State; submit: (v?: Record<string, string>) => void; busy: boolean }) {
  const f = (k: string, l: string, t = 'text') => <label>{l}<input type={t} min={t === 'number' ? '0.01' : undefined} step={t === 'number' ? '0.01' : undefined} value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} /></label>;
  const buckets = state.buckets.map(b => <option key={b.id} value={b.name}>{b.name}</option>);
  const accounts = state.accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>);
  if (modal === 'money') return <>{f('amount', 'Amount to add', 'number')}{f('location', 'Where is it?')}<p className='formHint'>This increases your unallocated money. The location is recorded for context, not maintained as a separate balance.</p><button className='primary full' disabled={!form.amount || Number(form.amount) <= 0 || busy} onClick={() => submit()}>Add {form.amount ? money(Number(form.amount)) : 'money'}</button></>;
  if (modal === 'goal') return <>{f('name', 'Quest name')}{f('target', 'Target amount', 'number')}<div className='formgrid'><label>Type<select value={form.kind || 'goal'} onChange={e => setForm({ ...form, kind: e.target.value })}><option value='goal'>Goal — money remains mine</option><option value='expense'>Expense — expected to be spent</option></select></label><label>Bucket<select value={form.bucket || ''} onChange={e => setForm({ ...form, bucket: e.target.value })}><option value=''>Choose bucket</option>{buckets}</select></label><label>Location<select value={form.account || ''} onChange={e => setForm({ ...form, account: e.target.value })}><option value=''>Optional location</option>{accounts}</select></label></div>{f('deadline', 'Deadline', 'date')}<button className='primary full' disabled={!form.name || !form.target || !form.bucket || busy} onClick={() => submit()}>Create quest</button></>;
  if (modal === 'contribute') return <>{!form.goalId && <label>Quest<select value={form.goalId || ''} onChange={e => setForm({ ...form, goalId: e.target.value })}><option value=''>Choose quest</option>{state.goals.filter(g => g.status === 'active').map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}<div className='available'><span>Unallocated</span><b>{money(state.unallocated)}</b></div>{f('amount', 'Amount to allocate', 'number')}<button className='primary full' disabled={!form.goalId || !form.amount || Number(form.amount) <= 0 || Number(form.amount) > state.unallocated || busy} onClick={() => submit()}>Allocate money</button></>;
  if (modal === 'spend') return <><div className='available'><span>Available allocation</span><b>{money(form.goalId ? state.goals.find(g => g.id === form.goalId)?.saved || 0 : 0)}</b></div>{f('amount', 'Amount spent', 'number')}{f('reason', 'What was it for?')}<p className='formHint'>Spending reduces the allocation and records money leaving your possession. Partial spending is allowed.</p><button className='primary full' disabled={!form.goalId || !form.amount || Number(form.amount) <= 0 || busy} onClick={() => submit()}>Mark spent</button></>;
  if (modal === 'commitment') return <>{f('name', 'Commitment name')}{f('amount', 'Expected amount', 'number')}<div className='formgrid'><label>Frequency<select value={form.frequency || 'monthly'} onChange={e => setForm({ ...form, frequency: e.target.value })}><option value='daily'>Daily</option><option value='weekly'>Weekly</option><option value='monthly'>Monthly</option><option value='yearly'>Yearly</option></select></label><label>Type<select value={form.kind || 'expense'} onChange={e => setForm({ ...form, kind: e.target.value })}><option value='expense'>Expense</option><option value='goal'>Goal</option></select></label><label>Bucket<select value={form.bucket || ''} onChange={e => setForm({ ...form, bucket: e.target.value })}><option value=''>Choose bucket</option>{buckets}</select></label><label>Location<select value={form.account || ''} onChange={e => setForm({ ...form, account: e.target.value })}><option value=''>Optional location</option>{accounts}</select></label></div>{(form.frequency || 'monthly') === 'monthly' || (form.frequency || 'monthly') === 'yearly' ? f('dueDay', 'Due day of month', 'number') : null}<button className='primary full' disabled={!form.name || !form.amount || !form.frequency || !form.bucket || busy} onClick={() => submit()}>Create recurring commitment</button></>;
  if (modal === 'rebalance') return <><p className='muted'>Move an allocation between quests, record an expense, or remove an allocation from tracking.</p><label>What happened?<select value={form.kind || 'transfer'} onChange={e => setForm({ ...form, kind: e.target.value })}><option value='transfer'>Move to another quest</option><option value='expense'>Record an expense</option><option value='withdrawal'>Remove from tracking</option></select></label><label>Source quest<select value={form.from || ''} onChange={e => setForm({ ...form, from: e.target.value })}><option value=''>Choose quest</option>{state.goals.filter(g => g.status !== 'archived').map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{(form.kind || 'transfer') === 'transfer' && <label>Destination quest<select value={form.to || ''} onChange={e => setForm({ ...form, to: e.target.value })}><option value=''>Choose quest</option>{state.goals.filter(g => g.status !== 'archived').map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}{f('amount', 'Amount', 'number')}{f('reason', 'Description')}<button className='primary full' disabled={!form.from || !form.amount || ((form.kind || 'transfer') === 'transfer' && !form.to) || busy} onClick={() => submit()}>Record adjustment</button></>;
  return <>{f('name', modal === 'account' ? 'Account/location name' : 'Bucket name')}<button className='primary full' disabled={!form.name || busy} onClick={() => submit(form)}>Add</button></>;
}
