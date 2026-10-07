// The only live backend module that imports the platform SDK.
// `backend/realtime*.ts` also imports it; those files are unreferenced and
// stay until it is confirmed the host does not load every named export.
import { db, error, json, requireAuth, router } from '@appdeploy/sdk';
import type { RouteHandler } from '@appdeploy/sdk';
import type { LedgerStore } from './store';

export const platformStore: LedgerStore = db;
export { error, json, requireAuth, router };
export type { RouteHandler };
