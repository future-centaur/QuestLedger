import { useState } from 'react';
import { ChevronRight, LogIn, Sparkles } from 'lucide-react';
import type { OAuthProvider } from '../client';
import { Feature } from './common/Feature';

export function Landing({
  error,
  onProvider,
  onPassword,
  onSignUp,
}: {
  error: string;
  onProvider: (provider: OAuthProvider) => void;
  onPassword: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      if (creating) await onSignUp(email, password);
      else await onPassword(email, password);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="landing">
      <header className="landingHeader">
        <div className="brand">
          <div className="crest">Q</div>
          <div>
            <b>QuestLedger</b>
            <span>Your financial RPG</span>
          </div>
        </div>
        <a className="ghostBtn" href="#sign-in">
          <LogIn /> Sign in
        </a>
      </header>
      <main className="landingMain">
        <section className="landingHero">
          <div className="heroCopy">
            <div className="pill">
              <Sparkles /> FINANCIAL PROGRESS, MADE VISIBLE
            </div>
            <h1>
              Give your money a <em>mission.</em>
            </h1>
            <p>
              Know what you have, what is allocated, what still needs funding,
              and what has already been spent.
            </p>
            <div className="heroActions" id="sign-in">
                <form
                  className="authCard"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                >
                  <div className="authProviders">
                    <button type="button" onClick={() => onProvider('google')}>
                      Google
                    </button>
                    <button type="button" onClick={() => onProvider('apple')}>
                      Apple
                    </button>
                    <button type="button" onClick={() => onProvider('x')}>
                      X
                    </button>
                  </div>
                  <label>
                    Email
                    <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      minLength={8}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </label>
                  <button className="primary big" type="submit" disabled={busy}>
                    {creating ? 'Create account' : 'Sign in'} <ChevronRight />
                  </button>
                  <button className="textBtn" type="button" onClick={() => setCreating((value) => !value)}>
                    {creating ? 'Have an account? Sign in' : 'New here? Create an account'}
                  </button>
                </form>
              <span>No bank connection required.</span>
            </div>
            {error && <div className="landingError">{error}</div>}
          </div>
          <div className="characterPreview">
            <div className="previewTop">
              <span>QUESTLEDGER</span>
              <b>FINANCIAL STATE</b>
            </div>
            <h3>Money with a mission</h3>
            <div className="previewMoney">KSh 50,000</div>
            <div className="previewStats">
              <div>
                <span>Unallocated</span>
                <b>KSh 12,500</b>
              </div>
              <div>
                <span>Reserved</span>
                <b>KSh 37,500</b>
              </div>
              <div>
                <span>Completed</span>
                <b>4 quests</b>
              </div>
              <div>
                <span>Spent</span>
                <b>3 quests</b>
              </div>
            </div>
            <div className="previewQuest">
              <span>EXAMPLE</span>
              <b>Rent · KSh 20,000</b>
              <strong>Funded → Deducted → History</strong>
            </div>
          </div>
        </section>
        <section className="landingFeatures">
          <Feature
            icon="💰"
            title="Know your money"
            text="Start with a general figure instead of maintaining unnecessary pseudo-bank balances."
          />
          <Feature
            icon="🎯"
            title="Allocate with purpose"
            text="Move unallocated money into goals and funded recurring commitments."
          />
          <Feature
            icon="✓"
            title="Separate achievement from spending"
            text="Completion is not spending. The money remains visible until it is actually spent."
          />
          <Feature
            icon="🔄"
            title="Fund recurring reality"
            text="Rent, fuel, subscriptions and repayments keep their own balance and runway."
          />
        </section>
        <section className="landingQuote">
          <p>
            Completion tells you what you achieved. Spending tells you what
            happened to the money.
          </p>
          <span>— The QuestLedger rule</span>
        </section>
      </main>
      <footer>QuestLedger · Your financial RPG</footer>
    </div>
  );
}
