import { ArrowRightLeft, X, Archive, Pause, Play, MoreHorizontal } from 'lucide-react';
import type { Goal, Commitment, Event } from '../../../shared/types';
import { money, dateText, statusFor, cyclesText, exhaustionText } from '../../format/display';

export function CommitmentDetail({
  commitment,
  goals,
  events,
  close,
  openModal,
  edit,
  archive,
  toggle,
}: {
  commitment?: Commitment;
  goals: Goal[];
  events: Event[];
  close: () => void;
  openModal: (m: string) => void;
  edit: (c: Commitment) => void;
  archive: (c: Commitment) => void;
  toggle: (c: Commitment) => void;
}) {
  if (!commitment) return null;
  const c = commitment,
    linked = goals
      .filter((g) => g.commitmentId === c.id)
      .sort((a, b) => (b.periodKey || "").localeCompare(a.periodKey || ""))
      .slice(0, 8);
  const es = events
    .filter((e) => e.commitmentId === c.id)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 12);
  const remainingAfter = Math.max(
    0,
    Number(c.balance || 0) - Number(c.amount || 0),
  );
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
            <button
              onClick={() => {
                openModal("commitmentSpend");
              }}
            >
              Mark spent
            </button>
          </div>
        </div>
        <div className="metricGrid">
          <div>
            <span>Recurring amount</span>
            <b>{money(c.amount)}</b>
            <small>{c.frequency}</small>
          </div>
          <div>
            <span>Next due</span>
            <b>{dateText(c.nextDueAt)}</b>
            <small>{money(c.amount)} deduction</small>
          </div>
          <div>
            <span>After next deduction</span>
            <b>{money(remainingAfter)}</b>
            <small>
              {remainingAfter < c.amount
                ? "Underfunded next cycle"
                : "Still funded"}
            </small>
          </div>
          <div>
            <span>Projected exhaustion</span>
            <b>{exhaustionText(c)}</b>
            <small>if no top-up</small>
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
            {linked.map((g) => (
              <div className="periodRow" key={g.id}>
                <div>
                  <b>{g.periodKey}</b>
                  <small>{g.periodStatus || g.status}</small>
                </div>
                <strong>{g.spent ? money(g.spent) : money(g.target)}</strong>
              </div>
            ))}
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
