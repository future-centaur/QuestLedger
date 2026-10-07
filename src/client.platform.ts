// Implementation of QuestLedgerClient over the current hosting platform's SDK.
//
// This is the ONLY file that imports the platform client package. It is the
// seam that step 7 removes: delete this, add an HTTP implementation, and
// `main.tsx` is the only call site because the UI depends on the interface.
//
// The class is named for the *shape* of the implementation, not the vendor, so
// the file needs no rename when the backend does. The vendor name survives only
// where it is factually load-bearing — the package specifier below, and the
// `docs/` record of why this coupling exists.

import { api, auth } from '@appdeploy/client';
import type { User } from '../shared/types';
import type { QuestLedgerClient } from './client';

export class PlatformClient implements QuestLedgerClient {
  getUser(): Promise<User> {
    return auth.getUser() as Promise<User>;
  }
  signIn(): Promise<{ user: User }> {
    return auth.signIn({ scope: 'openid email profile offline_access' }) as Promise<{ user: User }>;
  }
  async signOut(): Promise<void> {
    await auth.signOut();
  }
  get<T>(path: string): Promise<{ data: T }> {
    return api.get(path) as Promise<{ data: T }>;
  }
  post<T>(path: string, body: unknown): Promise<{ data: T }> {
    return api.post(path, body) as Promise<{ data: T }>;
  }
}