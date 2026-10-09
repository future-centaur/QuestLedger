import { Archive } from 'lucide-react';
import type { Goal, Commitment } from '../../../shared/types';
import { money } from '../../format/display';

export function Archives({
  goals,
  commitments,
  open,
}: {
  goals: Goal[];
  commitments: Commitment[];
  open: (g: Goal) => void;
}) {
  return (
    <>
      <div className="pageTitle">
        <div>
          <p className="eyebrow">HISTORY</p>
          <h1>Archives</h1>
          <p className="muted">
            Finished quests and archived commitments remain visible as history.
          </p>
        </div>
      </div>
      {goals.length ? (
        <div className="grid">
          {goals.map((g) => (
            <article
              className="card goalClickable"
              key={g.id}
              onClick={() => open(g)}
            >
              <div className="tag">
                <Archive /> ARCHIVED QUEST
              </div>
              <h3>{g.name}</h3>
              <div className="amount">
                {money(g.spent)} <small>spent</small>
              </div>
              <div className="meta">
                <span>{g.kind === "expense" ? "Expense" : "Goal"}</span>
                <span>{g.periodKey || g.deadline || "Completed"}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {commitments.length ? (
        <>
          <div className="sectionHead">
            <h2>Archived commitments</h2>
          </div>
          <div className="commitmentGrid">
            {commitments.map((c) => (
              <article className="card" key={c.id}>
                <div className="tag">
                  <Archive /> ARCHIVED COMMITMENT
                </div>
                <h3>{c.name}</h3>
                <div className="amount">
                  {money(c.balance || 0)} <small>remaining</small>
                </div>
                <div className="meta">
                  <span>{c.frequency}</span>
                  <span>{c.bucket}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
      {!goals.length && !commitments.length && (
        <div className="empty">
          <Archive />
          <h3>Your archive is empty</h3>
          <p>Completed and archived financial history will appear here.</p>
        </div>
      )}
    </>
  );
}
