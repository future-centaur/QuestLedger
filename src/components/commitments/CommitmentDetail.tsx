import { ArrowRightLeft, X, Archive, Pause, Play, MoreHorizontal } from 'lucide-react';
import type { Goal, Commitment, Event } from '../../../shared/types';
import { money, dateText, statusFor, cyclesText, daysOfCover, runRate, postedEstimate } from '../../format/display';

export function CommitmentDetail({
  commitment,
  goals,
  events,
  close,
  openModal,
  edit,
  archive,
  toggle,
  spend,
  trueUp,
}: {
  commitment?: Commitment;
  goals: Goal[];
  events: Event[];
  close: () => void;
  openModal: (m: string) => void;
  edit: (c: Commitment) => void;
  archive: (c: Commitment) => void;
  toggle: (c: Commitment) => void;
  spend: (c: Commitment) => void;
  trueUp: (periodKey: string, estimate: number) => void;
}) {
  if (!commitment) return null;
  const c = commitment,
    linked = goals
      .filter((g) => g.commitmentId === c.id)
      .sort((a, b) => (b.periodKey || "").localeCompare(a.periodKey || ""))
      .slice(0, 8);
  const history = events
    .filter((e) => e.commitmentId === c.id)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const es = history.slice(0, 12);
  const recent = runRate(linked);
  return (
    <div className="overlay">
      <div className="modal detailModal">
        <div className="modalHead">
          <div>
            <p className="eyebrow">COMMITMENT</p>
            <h2>{c.name}</h2>
          </div>
          <button onClick={close}>
            <X />
          </button>
        </div>
        <div className="commitHero">
          <div>
            <span className="tag">
              {c.kind === "expense" ? "EXPENSE" : "GOAL"} · {c.frequency}
            </span>
            <div className="detailAmount">
              {money(c.balance || 0)} <small>reserved</small>
            </div>
            <p
              className={
                statusFor(c) === "Underfunded" ? "negativeText" : "positiveText"
              }
            >
              {statusFor(c)} · {cyclesText(c)}
            </p>
          </div>
          <div className="detailButtons">
            <button
              className="primary"
              onClick={() => {
                openModal("commitmentTopup");
              }}
            >
              Top up
            </button>
            <button onClick={() => spend(c)}>Record expense</button>
          </div>
        </div>
        <div className="metricGrid">
          <div>
            <span>Budget</span>
            <b>{money(c.amount)}</b>
            <small>
              {c.frequency}
              {c.pendingAmount ? ` · next cycle ${money(c.pendingAmount)}` : ""}
            </small>
          </div>
          <div>
            <span>Next due</span>
            <b>{dateText(c.nextDueAt)}</b>
            <small>{money(c.pendingAmount ?? c.amount)} if not recorded</small>
          </div>
          <div>
            <span>Recent cost</span>
            <b>{recent === null ? "—" : money(recent)}</b>
            <small>average of the last 7 closed periods</small>
          </div>
          <div>
            <span>Days of cover</span>
            <b>{daysOfCover(c)}</b>
            <small>forecast from the estimate</small>
          </div>
        </div>
        <div className="detailButtons manageCommit">
          <button onClick={() => edit(c)}>Edit</button>
          <button onClick={() => openModal("commitmentRebalance")}>
            <ArrowRightLeft /> Rebalance
          </button>
          <button
            onClick={() => {
              openModal("commitmentAdjust");
            }}
          >
            <MoreHorizontal /> Adjust
          </button>
          <button onClick={() => toggle(c)}>
            {c.active ? <Pause /> : <Play />} {c.active ? "Pause" : "Resume"}
          </button>
          <button onClick={() => archive(c)}>
            <Archive /> Archive
          </button>
        </div>
        <h3>Period history</h3>
        {linked.length ? (
          <div className="periodList">
            {linked.map((g) => {
              const estimate = g.periodKey ? postedEstimate(g.periodKey, history) : null;
              return (
                <div className="periodRow" key={g.id}>
                  <div>
                    <b>{g.periodKey}</b>
                    <small>{estimate !== null ? "estimate" : g.periodStatus || g.status}</small>
                  </div>
                  <strong>{g.spent ? money(g.spent) : money(g.target)}</strong>
                  {estimate !== null && g.periodKey && (
                    <button
                      type="button"
                      onClick={() => trueUp(g.periodKey as string, Number(g.spent) || estimate)}
                    >
                      Record actual
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No periods recorded yet.</p>
        )}
        <h3>Activity</h3>
        {es.length ? (
          <div className="timeline">
            {es.map((e) => (
              <div className="timelineItem" key={e.id}>
                <div
                  className={`eventDot ${e.type.includes("deduction") || e.type.includes("spend") ? "negative" : "positive"}`}
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
