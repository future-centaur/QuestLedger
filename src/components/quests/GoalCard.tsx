import { Plus, Check } from 'lucide-react';
import type { Goal } from '../../../shared/types';
import { money } from '../../format/display';

export function GoalCard({
  g,
  open,
  allocate,
  complete,
  spend,
}: {
  g: Goal;
  open: (g: Goal) => void;
  allocate: () => void;
  complete: () => void;
  spend: () => void;
}) {
  const p = Math.min(100, g.target ? (g.saved / g.target) * 100 : 0);
  return (
    <article className="card goalClickable" onClick={() => open(g)}>
      <div className="tag">
        {g.kind === "expense" ? "EXPENSE" : "GOAL"} · {g.bucket}
      </div>
      <h3>{g.name}</h3>
      <div className="amount">
        {money(g.saved)} <small>/ {money(g.target)}</small>
      </div>
      <div className="bar">
        <i style={{ width: `${p}%` }} />
      </div>
      <div className="meta">
        <span>
          {g.saved >= g.target
            ? "Ready"
            : `${money(g.target - g.saved)} remaining`}
        </span>
        <span>{g.account}</span>
      </div>
      <div className="cardActions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            allocate();
          }}
        >
          <Plus /> Allocate
        </button>
        {g.saved >= g.target && g.status === "active" && (
          <button
            className="complete"
            onClick={(e) => {
              e.stopPropagation();
              complete();
            }}
          >
            <Check /> Complete
          </button>
        )}
        {g.saved > 0 && (
          <button
            className="spend"
            onClick={(e) => {
              e.stopPropagation();
              spend();
            }}
          >
            Spent
          </button>
        )}
      </div>
    </article>
  );
}
