import {
  Archive,
  LogOut,
  Repeat2,
  Scale,
  Shield,
  Target,
  Trophy,
} from 'lucide-react';
import { Analytics } from './components/analytics/Analytics';
import { Archives } from './components/archive/Archives';
import { CommitmentDetail } from './components/commitments/CommitmentDetail';
import { Commitments } from './components/commitments/Commitments';
import { Modal } from './components/common/Modal';
import { Form } from './components/forms/Form';
import { Landing } from './components/Landing';
import { Character } from './components/character/Character';
import { Dashboard } from './components/dashboard/Dashboard';
import { GoalDetail } from './components/quests/GoalDetail';
import { Goals } from './components/quests/Goals';
import type { QuestLedgerClient } from './client';
import { tabs, useSession } from './session/useSession';

const titles: Record<string, string> = {
  goal: 'New Quest',
  goalEdit: 'Edit Quest',
  goalTarget: 'Adjust Quest Target',
  goalArchive: 'Archive Quest',
  money: 'Add Unallocated Money',
  contribute: 'Allocate Money',
  rebalance: 'Adjust Allocation',
  commitment: 'New Recurring Commitment',
  commitmentEdit: 'Edit Commitment',
  account: 'Add Account',
  bucket: 'Add Bucket',
  commitmentTopup: 'Top up commitment',
  commitmentSpend: 'Mark commitment money spent',
  commitmentRebalance: 'Rebalance commitment',
  commitmentAdjust: 'Adjust commitment',
};

export default function App({ client }: { client: QuestLedgerClient }) {
  const {
    user,
    checking,
    state,
    tab,
    setTab,
    modal,
    setModal,
    form,
    setForm,
    busy,
    error,
    setError,
    loginWithProvider,
    loginWithPassword,
    signUp,
    logout,
    xpLevel,
    xpIn,
    xpPerLevel,
    goalAllocated,
    totalMoney,
    activeGoals,
    archives,
    create,
    allocate,
    addMoney,
    adjust,
    complete,
    spend,
    createCommitment,
    submitCommitment,
    toggleCommitment,
    updateGoal,
    adjustQuestTarget,
    archiveQuest,
    updateCommitment,
    archiveCommitment,
    addNamed,
  } = useSession(client);

  if (checking)
    return (
      <div className="splash">
        <div className="crest">Q</div>
        <b>QuestLedger</b>
        <span>Loading your financial world…</span>
      </div>
    );
  if (!user)
    return (
      <Landing
        error={error}
        onProvider={loginWithProvider}
        onPassword={loginWithPassword}
        onSignUp={signUp}
      />
    );

  const openGoal = (id: string) => setModal('detail:' + id);
  const commitmentActions = ['commitmentTopup', 'commitmentSpend', 'commitmentRebalance', 'commitmentAdjust'];

  return (
    <div className="shell">
      <header>
        <div className="brand">
          <div className="crest">Q</div>
          <div>
            <b>QuestLedger</b>
            <span>Your financial RPG</span>
          </div>
        </div>
        <div className="userBar">
          <span>{user.name || user.email || 'Player'}</span>
          <div className="level">
            <b>LEVEL {xpLevel}</b>
            <div className="xp">
              <i style={{ width: `${(xpIn / xpPerLevel) * 100}%` }} />
            </div>
            <small>
              {xpIn}/{xpPerLevel} XP
            </small>
          </div>
          <button className="iconBtn" onClick={logout}>
            <LogOut />
          </button>
        </div>
      </header>
      <main>
        {error && (
          <div className="errorBanner">
            {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}
        {tab === 'home' && (
          <Dashboard
            state={state}
            total={totalMoney}
            goalAllocated={goalAllocated}
            open={(g) => openGoal(g.id)}
            newGoal={() => {
              setForm({});
              setModal('goal');
            }}
            add={() => {
              setForm({});
              setModal('money');
            }}
            allocate={() => {
              setForm({});
              setModal('contribute');
            }}
            adjust={() => {
              setForm({});
              setModal('rebalance');
            }}
          />
        )}
        {tab === 'goals' && (
          <Goals
            goals={activeGoals}
            open={(g) => openGoal(g.id)}
            newGoal={() => {
              setForm({});
              setModal('goal');
            }}
            allocate={(g) => {
              setForm({ goalId: g.id });
              setModal('contribute');
            }}
            complete={complete}
            spend={(g) => {
              setForm({ goalId: g.id });
              setModal('spend:' + g.id);
            }}
          />
        )}
        {tab === 'commitments' && (
          <Commitments
            commitments={state.commitments.filter((c) => !c.archived)}
            newCommitment={() => {
              setForm({});
              setModal('commitment');
            }}
            open={(c) => {
              setForm({ commitmentId: c.id });
              setModal('commitmentDetail');
            }}
            toggle={toggleCommitment}
          />
        )}
        {tab === 'archive' && (
          <Archives
            goals={archives}
            commitments={state.commitments.filter((c) => c.archived)}
            open={(g) => openGoal(g.id)}
          />
        )}
        {tab === 'stats' && <Character state={state} />}
        {tab === 'analysis' && (
          <Analytics
            state={state}
            addBucket={() => {
              setForm({});
              setModal('bucket');
            }}
            addAccount={() => {
              setForm({});
              setModal('account');
            }}
          />
        )}
      </main>
      <nav>
        {tabs.map(([id, label]) => (
          <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}>
            {id === 'home' ? (
              <Target />
            ) : id === 'goals' ? (
              <Trophy />
            ) : id === 'commitments' ? (
              <Repeat2 />
            ) : id === 'archive' ? (
              <Archive />
            ) : id === 'stats' ? (
              <Shield />
            ) : (
              <Scale />
            )}
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {modal?.startsWith('detail:') ? (
        <GoalDetail
          goal={state.goals.find((g) => g.id === modal.slice(7))}
          events={state.events}
          close={() => setModal(null)}
          edit={(g) => {
            setForm({
              id: g.id,
              name: g.name,
              bucket: g.bucket,
              account: g.account || '',
              deadline: g.deadline || '',
              kind: g.kind,
            });
            setModal('goalEdit');
          }}
          adjustTarget={(g) => {
            setForm({ id: g.id, target: String(g.target), releaseTo: 'unallocated' });
            setModal('goalTarget');
          }}
          archive={(g) => {
            setForm({ id: g.id, releaseTo: 'unallocated' });
            setModal('goalArchive');
          }}
          allocate={(g) => {
            setForm({ goalId: g.id });
            setModal('contribute');
          }}
          spend={(g) => {
            setForm({ goalId: g.id });
            setModal('spend:' + g.id);
          }}
        />
      ) : modal?.startsWith('spend:') ? (
        <Modal title="Mark money as spent" close={() => setModal(null)}>
          <Form
            modal="spend"
            form={form}
            setForm={setForm}
            state={state}
            submit={() => spend(state.goals.find((g) => g.id === modal.slice(6))!, Number(form.amount))}
            busy={busy}
          />
        </Modal>
      ) : modal === 'commitmentDetail' ? (
        <CommitmentDetail
          commitment={state.commitments.find((c) => c.id === form.commitmentId)}
          goals={state.goals}
          events={state.events}
          close={() => setModal(null)}
          openModal={(m) => setModal(m)}
          edit={(c) => {
            setForm({
              id: c.id,
              name: c.name,
              bucket: c.bucket,
              account: c.account || '',
              kind: c.kind,
            });
            setModal('commitmentEdit');
          }}
          archive={(c) => {
            setForm({ commitmentId: c.id });
            setModal('commitmentArchive');
          }}
          toggle={toggleCommitment}
        />
      ) : (
        modal &&
        !commitmentActions.includes(modal) &&
        modal !== 'commitmentArchive' && (
          <Modal title={titles[modal] ?? 'Add Bucket'} close={() => setModal(null)}>
            <Form
              modal={modal}
              form={form}
              setForm={setForm}
              state={state}
              submit={
                modal === 'goal'
                  ? create
                  : modal === 'goalEdit'
                    ? updateGoal
                    : modal === 'goalTarget'
                      ? adjustQuestTarget
                      : modal === 'goalArchive'
                        ? archiveQuest
                        : modal === 'money'
                          ? addMoney
                          : modal === 'contribute'
                            ? allocate
                            : modal === 'rebalance'
                              ? adjust
                              : modal === 'commitment'
                                ? createCommitment
                                : modal === 'commitmentEdit'
                                  ? updateCommitment
                                  : addNamed
              }
              busy={busy}
            />
          </Modal>
        )
      )}
      {commitmentActions.includes(modal || '') && (
        <Modal title={titles[modal!] ?? 'Adjust commitment'} close={() => setModal(null)}>
          <Form
            modal={modal!}
            form={form}
            setForm={setForm}
            state={state}
            submit={() =>
              submitCommitment(
                modal === 'commitmentTopup'
                  ? 'topup'
                  : modal === 'commitmentSpend'
                    ? 'spend'
                    : modal === 'commitmentRebalance'
                      ? 'rebalance'
                      : 'adjust',
              )
            }
            busy={busy}
          />
        </Modal>
      )}
      {modal === 'commitmentArchive' && (
        <Modal title="Archive commitment" close={() => setModal(null)}>
          <Form
            modal="commitmentArchive"
            form={form}
            setForm={setForm}
            state={state}
            submit={archiveCommitment}
            busy={busy}
          />
        </Modal>
      )}
    </div>
  );
}
