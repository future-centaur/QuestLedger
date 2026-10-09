// The transport the UI is allowed to use. `src/client.http.ts` implements it.

import type { User } from '../shared/types';

export type OAuthProvider = 'google' | 'apple' | 'x';

export interface QuestLedgerClient {
  getUser(): Promise<User>;
  signInWithProvider(provider: OAuthProvider): Promise<{ user: User }>;
  signInWithPassword(email: string, password: string): Promise<{ user: User }>;
  signUp(email: string, password: string, name?: string): Promise<{ user: User }>;
  signOut(): Promise<void>;
  get<T>(path: string): Promise<{ data: T }>;
  post<T>(path: string, body: unknown): Promise<{ data: T }>;
}

/** Error shape `errorMessage()` reads from a failed API call. */
export interface ApiErrorShape {
  response?: { data?: { message?: string; error?: string } };
}

/** Extracts the server's validation message. */
export const errorMessage = (e: unknown, fallback = 'Nothing was changed. Please try again.'): string => {
  const d = (e as ApiErrorShape | null)?.response?.data;
  if (d?.message || d?.error) return d.message || d.error || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
};