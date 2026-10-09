import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { HttpClient } from './client.http';
import './index.css';

// OAuth returns in a popup. Tell the original tab, then close.
if (window.opener && window.opener !== window) {
  const authError = new URLSearchParams(window.location.search).get('auth_error');
  window.opener.postMessage({ type: 'questledger-auth', error: authError }, window.location.origin);
  window.close();
}

if (!window.opener || window.opener === window) createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App client={new HttpClient()} />
  </StrictMode>,
);
