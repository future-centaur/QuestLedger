import { CalendarDays, Repeat2, Wallet } from 'lucide-react';
import type { State } from '../../../shared/types';
import { money } from '../../format/display';

export function Analytics({
  state,
  addBucket,
  addAccount,
}: {
  state: State;
  addBucket: () => void;
  addAccount: () => void;
}) {
  const h = state.recurringHealth;
  return (
    <>
      <div className="pageTitle">
        <div>
          <p className="eyebrow">SYSTEM VIEW</p>
          <h1>Money architecture</h1>
          <p className="muted">
            See the distinction between unallocated money, quest allocations and
            recurring reserves.
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
      <div className="panel analysisRow">
        <h3>Money locations</h3>
        {state.accounts.map((a) => (
          <div className="accountRow" key={a.id}>
            <span>{a.name}</span>
            <small>context only</small>
          </div>
        ))}
        <div className="manageRow">
          <button onClick={addAccount}>Add account</button>
          <button onClick={addBucket}>Add bucket</button>
        </div>
      </div>
    </>
  );
}
