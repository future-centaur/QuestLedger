import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { HttpClient } from './client.http';
import type { QuestLedgerClient } from './client';
import './index.css';

async function client(): Promise<QuestLedgerClient> {
  if (import.meta.env.VITE_AUTH === 'http') return new HttpClient();
  const { PlatformClient } = await import('./client.platform');
  return new PlatformClient();
}

client().then((api) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App client={api} />
    </StrictMode>,
  );
});
