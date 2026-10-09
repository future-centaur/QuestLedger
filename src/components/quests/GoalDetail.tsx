import { Archive, Plus, X } from 'lucide-react';
import type { Goal, Event } from '../../../shared/types';
import { money } from '../../format/display';

export function GoalDetail({
  goal,
  events,
  close,
  edit,
  adjustTarget,
  archive,
  allocate,
  spend,
}: {
  goal?: Goal;
  events: Event[];
  close: () => void;
  edit: (g: Goal) => void;
  adjustTarget: (g: Goal) => void;
  archive: (g: Goal) => void;
  allocate: (g: Goal) => void;
  spend: (g: Goal) => void;
}) {
  if (!goal) return null;
  const es = events
    .filter(
      (e) => e.goalId === goal.id || e.from === goal.id || e.to === goal.id,
    )
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return (
    <div className="overlay">
      <div className="modal detailModal">
        <div className="modalHead">
          <div>
            <p className="eyebrow">QUEST HISTORY</p>
            <h2>{goal.name}</h2>
          </div>
          <button onClick={close}>
            <X />
          </button>
        </div>
        <div className="detailHero">
          <div>
            <span className="tag">
              {goal.kind === "expense" ? "EXPENSE" : "GOAL"} · {goal.bucket}
            </span>
            <div className="detailAmount">
              {money(goal.saved)} <small>remaining allocation</small>
            </div>
            <p className="muted">
              {goal.status === "archived"
                ? "Archived"
                : goal.status === "completed"
                  ? "Completed"
                  : "Active"}{" "}
              · {money(goal.spent)} spent
            </p>
          </div>
          <div className="detailButtons">
            <button onClick={() => edit(goal)}>Edit</button>
            <button onClick={() => adjustTarget(goal)}>Target</button>
            <button
              className="primary"
              onClick={() => allocate(goal)}
              disabled={goal.status === "archived"}
            >
              <Plus /> Allocate
            </button>
            {goal.saved > 0 && (
              <button className="spend" onClick={() => spend(goal)}>
                Mark spent
              </button>
            )}
            {goal.status !== "archived" && (
              <button onClick={() => archive(goal)}>
                <Archive /> Archive
              </button>
            )}
          </div>
        </div>
        <h3>Activity</h3>
        {es.length ? (
          <div className="timeline">
            {es.map((e) => (
              <div className="timelineItem" key={e.id}>
                <div
                  className={`eventDot ${e.amount >= 0 ? "positive" : "negative"}`}
                />
                <div className="eventBody">
                  <div>
                    <b>{e.type.replace(/_/g, " ")}</b>
                    <strong>{e.amount ? money(e.amount) : ""}</strong>
                  </div>
                  <small>
                    {new Date(e.createdAt).toLocaleString()}
                    {e.reason ? " · " + e.reason : ""}
                  </small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No activity yet.</p>
        )}
      </div>
    </div>
  );
}
