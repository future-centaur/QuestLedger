import type { User } from '../shared/types';
import type { OAuthProvider, QuestLedgerClient } from './client';

function root(): string {
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
}

async function send(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${root()}${path}`, { ...init, headers, credentials: 'include' });
  const data = (await response.json().catch(() => ({}))) as { message?: string; user?: User };
  if (!response.ok) {
    const error = new Error(data.message || 'Request failed') as Error & {
      response?: { data?: { message?: string } };
    };
    error.response = { data: { message: data.message } };
    throw error;
  }
  return data;
}

export class HttpClient implements QuestLedgerClient {
  async getUser(): Promise<User> {
    const data = (await send('/api/auth/session')) as { user: User };
    return data.user ?? null;
  }
  signInWithProvider(provider: OAuthProvider): Promise<{ user: User }> {
    const popup = window.open(
      `${root()}/api/auth/${provider}`,
      'questledger-auth',
      'popup,width=480,height=720',
    );
    if (!popup) return Promise.reject(new Error('Please allow popups to sign in.'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (run: () => void) => {
        if (settled) return;
        settled = true;
        window.clearInterval(timer);
        window.removeEventListener('message', onMessage);
        run();
      };
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string; error?: string | null };
        if (data?.type !== 'questledger-auth') return;
        finish(() => {
          if (data.error) reject(new Error(data.error));
          else this.getUser().then((user) => (user ? resolve({ user }) : reject(new Error('Could not sign in.'))));
        });
      };
      window.addEventListener('message', onMessage);
      const timer = window.setInterval(() => {
        if (!popup.closed) return;
        finish(() => {
          this.getUser().then((user) => (user ? resolve({ user }) : reject(new Error('Sign-in was cancelled.'))));
        });
      }, 400);
    });
  }
  async signInWithPassword(email: string, password: string): Promise<{ user: User }> {
    const data = (await send('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })) as { user: User };
    return { user: data.user };
  }
  async signUp(email: string, password: string, name?: string): Promise<{ user: User }> {
    const data = (await send('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    })) as { user: User };
    return { user: data.user };
  }
  async signOut(): Promise<void> {
    await send('/api/auth/logout', { method: 'POST' });
  }
  async get<T>(path: string): Promise<{ data: T }> {
    return { data: (await send(path)) as T };
  }
  async post<T>(path: string, body: unknown): Promise<{ data: T }> {
    return { data: (await send(path, { method: 'POST', body: JSON.stringify(body) })) as T };
  }
}
