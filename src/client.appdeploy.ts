// AppDeploy-backed implementation of QuestLedgerClient.
//
// This is the ONLY file that imports `@appdeploy/client`. It is the seam that
// step 7 removes: delete this, add an HTTP implementation, and `App.tsx` is
// untouched because it depends on the interface, not on this class.

import { api, auth } from '@appdeploy/client';
import type { User } from '../shared/types';
import type { QuestLedgerClient } from './client';

export class AppDeployClient implements QuestLedgerClient {
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