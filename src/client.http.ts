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
  signIn(): Promise<{ user: User }> {
    return Promise.reject(new Error('Choose a provider or email sign-in.'));
  }
  signInWithProvider(provider: OAuthProvider): Promise<{ user: User }> {
    window.location.assign(`${root()}/api/auth/${provider}`);
    return new Promise(() => {});
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
