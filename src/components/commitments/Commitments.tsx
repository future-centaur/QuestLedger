import { Plus, Repeat2 } from 'lucide-react';
import type { Commitment } from '../../../shared/types';
import { money, dateText, statusFor, cyclesText } from '../../format/display';

export function Commitments({
  commitments,
  newCommitment,
  open,
  toggle,
}: {
  commitments: Commitment[];
  newCommitment: () => void;
  open: (c: Commitment) => void;
  toggle: (c: Commitment) => void;
}) {
  return (
    <>
      <div className="pageTitle">
        <div>
          <p className="eyebrow">RECURRING</p>
          <h1>Funded commitments</h1>
          <p className="muted">
            Each commitment owns its reserved balance and tells you how long it
            can sustain.
          </p>
        </div>
        <button className="primary" onClick={newCommitment}>
          <Plus /> New commitment
        </button>
      </div>
      <div className="commitmentGrid">
        {commitments.map((c) => {
          const status = statusFor(c);
          return (
            <article
              className="card goalClickable"
              key={c.id}
              onClick={() => open(c)}
            >
              <div className="commitHead">
                <span className="tag">
                  <Repeat2 /> {c.frequency}
                </span>
                <button
                  className={c.active ? "toggleOn" : "toggleOff"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(c);
                  }}
                >
                  {c.active ? "Active" : "Paused"}
                </button>
              </div>
              <h3>{c.name}</h3>
              <div className="amount">
                {money(c.balance || 0)} <small>reserved</small>
              </div>
              <div className="meta">
                <span>{cyclesText(c)}</span>
                <span
                  className={
                    status === "Underfunded" ? "negativeText" : "positiveText"
                  }
                >
                  {status}
                </span>
              </div>
              <div className="commitDue">
                <span>Next: {dateText(c.nextDueAt)}</span>
                <span>
                  {money(c.amount)} / {c.frequency}
                </span>
              </div>
              <div className="bar">
                <i
                  style={{
                    width: `${Math.min(100, Number(c.amount) ? ((Number(c.balance || 0) % Number(c.amount)) / Number(c.amount)) * 100 : 0)}%`,
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>
      {!commitments.length && (
        <div className="empty">
          <Repeat2 />
          <h3>No funded commitments</h3>
          <p>
            Turn rent, fuel, loans and other repeating obligations into standing
            money pools.
          </p>
          <button className="primary" onClick={newCommitment}>
            Create commitment
          </button>
        </div>
      )}
    </>
  );
}
