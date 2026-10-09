import { ArrowRightLeft, ChevronRight, CircleDollarSign, Plus, Repeat2, Shield, Target, Wallet } from 'lucide-react';
import type { Goal, State } from '../../../shared/types';
import { isStandalone } from '../../../shared/types';
import { levelProgress } from '../../../shared/accounting';
import { money } from '../../format/display';
import { Empty } from '../common/Empty';
import { GoalCard } from '../quests/GoalCard';

export function Dashboard({
  state,
  total,
  goalAllocated,
  open,
  newGoal,
  add,
  allocate,
  adjust,
}: {
  state: State;
  total: number;
  goalAllocated: number;
  open: (g: Goal) => void;
  newGoal: () => void;
  add: () => void;
  allocate: () => void;
  adjust: () => void;
}) {
  const h = state.recurringHealth;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">FINANCIAL CHARACTER</p>
          <h1>
            Level {levelProgress(state.xp).level}{" "}
            <em>Wealth Builder</em>
          </h1>
          <p className="muted">
            Your money has a state. Your quests give it a mission.
          </p>
        </div>
        <div className="heroStat">
          <Shield />
          <strong>{state.stats.integrity}</strong>
          <span>Integrity</span>
        </div>
      </section>
      <section className="moneyOverview">
        <div>
          <span>Total money</span>
          <strong>{money(total)}</strong>
        </div>
        <div>
          <span>Unallocated</span>
          <strong className="lime">{money(state.unallocated)}</strong>
        </div>
        <div>
          <span>Quest allocations</span>
          <strong>{money(goalAllocated)}</strong>
        </div>
      </section>
      <div className="actions">
        <button className="primary" onClick={add}>
          <CircleDollarSign /> Add money
        </button>
        <button onClick={allocate}>
          <Target /> Allocate
        </button>
        <button onClick={newGoal}>
          <Plus /> New quest
        </button>
        <button onClick={adjust}>
          <ArrowRightLeft /> Adjust
        </button>
      </div>
      <section className="recurringHealth">
        <div>
          <p className="eyebrow">RECURRING OBLIGATIONS</p>
          <h2>{money(h?.totalReserved || 0)} reserved</h2>
          <p>
            {money(h?.monthlyOutflow || 0)} estimated monthly outflow ·{" "}
            {h?.activeCount || 0} active commitments
          </p>
        </div>
        <div className="runwayMetric">
          <span>Reserved runway</span>
          <b>
            {h && h.monthlyOutflow > 0
              ? (h.totalReserved / h.monthlyOutflow).toFixed(1)
              : "0"}{" "}
            mo
          </b>
        </div>
      </section>
      <div className="sectionHead">
        <h2>Active quests</h2>
        <button onClick={newGoal}>
          New <ChevronRight />
        </button>
      </div>
      {state.goals.filter((g) => isStandalone(g) && g.status !== "archived")
        .length ? (
        <div className="grid">
          {state.goals
            .filter((g) => isStandalone(g) && g.status !== "archived")
            .slice(0, 4)
            .map((g) => (
              <GoalCard
                key={g.id}
                g={g}
                open={open}
                allocate={allocate}
                complete={() => {}}
                spend={() => {}}
              />
            ))}
        </div>
      ) : (
        <Empty newGoal={newGoal} />
      )}
      <section className="two">
        <div className="panel">
          <div className="panelTitle">
            <Wallet /> Current quest allocation
          </div>
          {state.goals
            .filter((g) => isStandalone(g) && g.status !== "archived")
            .slice(0, 5)
            .map((g) => (
              <div className="accountRow" key={g.id}>
                <span>{g.name}</span>
                <b>{money(g.saved)}</b>
              </div>
            ))}
          <div className="integrity">
            <Shield />
            <span>
              Commitments now hold their own reserved balances; period instances
              are history, not separate money pools.
            </span>
          </div>
        </div>
        <div className="panel tip">
          <Repeat2 />
          <h3>Recurring runway</h3>
          <p>
            Open Recurring to fund rent, fuel, loans and other repeating
            obligations, then see how many cycles your balance can sustain.
          </p>
        </div>
      </section>
    </>
  );
}
