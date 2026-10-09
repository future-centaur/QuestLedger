import { Plus } from 'lucide-react';
import type { Goal } from '../../../shared/types';
import { Empty } from '../common/Empty';
import { GoalCard } from './GoalCard';

export function Goals({
  goals,
  open,
  newGoal,
  allocate,
  complete,
  spend,
}: {
  goals: Goal[];
  open: (g: Goal) => void;
  newGoal: () => void;
  allocate: (g: Goal) => void;
  complete: (g: Goal) => void;
  spend: (g: Goal) => void;
}) {
  return (
    <>
      <div className="pageTitle">
        <div>
          <p className="eyebrow">QUEST LOG</p>
          <h1>Active financial quests</h1>
          <p className="muted">
            Standalone quests keep their own allocation. Recurring money lives
            with its commitment.
          </p>
        </div>
        <button className="primary" onClick={newGoal}>
          <Plus /> New quest
        </button>
      </div>
      {goals.length ? (
        <div className="grid">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              g={g}
              open={open}
              allocate={() => allocate(g)}
              complete={() => complete(g)}
              spend={() => spend(g)}
            />
          ))}
        </div>
      ) : (
        <Empty newGoal={newGoal} />
      )}
    </>
  );
}
