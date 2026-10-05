// The transport seam for QuestLedger.
//
// Step 3 of the decoupling: the domain should not know which backend it talks to.
// `App.tsx` imports the interface below, not `@appdeploy/client`, so swapping
// AppDeploy for an HTTP backend (step 7) touches this file and nothing else.
//
// Why an interface rather than swapping the import directly: a direct swap is
// about fifteen lines and looks simpler, but it couples the domain to one
// backend's auth *and* transport, so the next migration costs the same again.

import type { User } from '../shared/types';

export interface QuestLedgerClient {
  getUser(): Promise<User>;
  signIn(): Promise<{ user: User }>;
  signOut(): Promise<void>;
  get<T>(path: string): Promise<{ data: T }>;
  post<T>(path: string, body: unknown): Promise<{ data: T }>;
}

/**
 * Error shape the UI depends on.
 *
 * `App.tsx:mutate()` reads `e.response.data.message || e.response.data.error`.
 * **This is unverified** — the AppDeploy SDK is not vendored in this repo, so we
 * cannot confirm which key its `error(msg, code)` helper actually emits. If it
 * emits neither, then every server-side validation message is *already* being
 * replaced by the generic fallback today, including the money guardrails
 * ("Not enough unallocated money", "Spending exceeds the reserved balance",
 * "Reallocate the remaining ... before archiving").
 *
 * Confirm against the SDK docs while resolving blocker B1 — see
 * docs/handoff.md. A replacement backend MUST reproduce whichever key is real,
 * or the product's validation messages become unreachable.
 */
export interface ApiErrorShape {
  response?: { data?: { message?: string; error?: string } };
  /** Auth failures carry these codes; `App.tsx` branches on them for copy. */
  code?: 'popup_blocked' | 'popup_closed' | string;
}

/** Extracts the server's validation message, mirroring current `mutate()` behaviour. */
export const errorMessage = (e: unknown, fallback = 'Nothing was changed. Please try again.'): string => {
  const d = (e as ApiErrorShape | null)?.response?.data;
  return d?.message || d?.error || fallback;
};

/** The auth codes the sign-in UI branches on. Untyped in the SDK; see ApiErrorShape. */
export const authErrorCopy = (e: unknown): string => {
  const code = (e as ApiErrorShape | null)?.code;
  return code === 'popup_blocked' ? 'Please allow popups to sign in.'
    : code === 'popup_closed' ? 'Sign-in was cancelled.'
    : 'Could not sign in.';
};