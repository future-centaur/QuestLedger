import { CalendarDays, Repeat2, Wallet } from 'lucide-react';
import { cashByLocation, cashBySource } from '../../../shared/accounting';
import type { State } from '../../../shared/types';
import { money } from '../../format/display';

export function Analytics({
  state,
  addBucket,
  addAccount,
  addSource,
}: {
  state: State;
  addBucket: () => void;
  addAccount: () => void;
  addSource: () => void;
}) {
  const h = state.recurringHealth;
  const sources = cashBySource(state.events);
  const locations = cashByLocation(state.events, state.accounts);
  return (
    <>
      <div className="pageTitle">
        <div>
          <p className="eyebrow">SYSTEM VIEW</p>
          <h1>Money architecture</h1>
          <p className="muted">
            At hand is unallocated money plus what is stocked in quests and commitments. An expense drains one of those stocks.
          </p>
        </div>
      </div>
      <div className="statsGrid">
        <div className="statCard">
          <Wallet />
          <span>Unallocated</span>
          <strong>{money(state.unallocated)}</strong>
        </div>
        <div className="statCard">
          <Repeat2 />
          <span>Recurring reserved</span>
          <strong>{money(h?.totalReserved || 0)}</strong>
        </div>
        <div className="statCard">
          <CalendarDays />
          <span>Monthly recurring outflow</span>
          <strong>{money(h?.monthlyOutflow || 0)}</strong>
        </div>
      </div>
      <div className="two">
        <div className="panel">
          <h3>Cash by source</h3>
          {sources.length ? (
            sources.map((row) => (
              <div className="accountRow" key={row.source}>
                <span>{row.source}</span>
                <b>{money(row.amount)}</b>
              </div>
            ))
          ) : (
            <p className="muted">No inflows yet.</p>
          )}
          <div className="manageRow">
            <button onClick={addSource}>Add source</button>
          </div>
        </div>
        <div className="panel">
          <h3>Money by location</h3>
          <p className="formHint">Cash recorded there when it was added.</p>
          {locations.length ? (
            locations.map((row) => (
              <div className="accountRow" key={row.location}>
                <span>{row.location}</span>
                <b>{money(row.amount)}</b>
              </div>
            ))
          ) : (
            <p className="muted">No locations yet.</p>
          )}
          <div className="manageRow">
            <button onClick={addAccount}>Add account</button>
            <button onClick={addBucket}>Add bucket</button>
          </div>
        </div>
      </div>
    </>
  );
}
