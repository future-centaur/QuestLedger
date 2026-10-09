import { Target } from 'lucide-react';

export function Empty({ newGoal }: { newGoal: () => void }) {
  return (
    <div className="empty">
      <Target />
      <h3>No active quests</h3>
      <p>Give a goal or expense a mission.</p>
      <button className="primary" onClick={newGoal}>
        Create quest
      </button>
    </div>
  );
}
