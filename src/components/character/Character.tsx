import { Shield } from 'lucide-react';
import type { State } from '../../../shared/types';

export function Character({ state }: { state: State }) {
  const stats = [
    ["Integrity", state.stats.integrity],
    ["Discipline", state.stats.discipline],
    ["Consistency", state.stats.consistency],
    ["Balance", state.stats.balance],
    ["Power", state.stats.power],
    ["Adaptability", state.stats.adaptability],
  ];
  return (
    <>
      <div className="pageTitle">
        <div>
          <p className="eyebrow">CHARACTER SHEET</p>
          <h1>Your financial character</h1>
        </div>
      </div>
      <div className="statsGrid">
        {stats.map(([n, v]) => (
          <div className="statCard" key={n}>
            <Shield />
            <span>{n}</span>
            <strong>{v}</strong>
            <div className="bar">
              <i style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
