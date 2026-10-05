// Minimal ambient declarations for @appdeploy/sdk, used ONLY to typecheck
// backend/index.ts locally. The real SDK is supplied by the AppDeploy platform
// and is absent from package.json, so without this the backend — 400+ lines
// including every money route — cannot be checked at all.
//
// This is deliberately permissive: `db` is typed loosely because the real
// contract is unverified (see blocker B1 in docs/handoff.md). It is here to
// catch *our* type errors in the domain code, not to assert the SDK's shape.
//
// Not shipped. Do not add a dependency on it.

declare module '@appdeploy/sdk' {
  export const db: {
    list<T = any>(table: string, opts?: { limit?: number; filter?: Record<string, any> }): Promise<{ items: T[] }>;
    get<T = any>(table: string, ids: string[]): Promise<T[]>;
    add(table: string, records: any[]): Promise<string[]>;
    update(table: string, records: Array<{ id: string; record: any }>): Promise<any[]>;
  };
  export function requireAuth(): any;
  export function json(body: any): any;
  export function error(message: string, status?: number): any;
  /** Route context. `body` is genuinely untyped upstream — routes cast `c.body as any`. */
  export interface RouteContext { body: any; user?: { userId: string } | null }
  export type RouteHandler = (c: RouteContext) => any;
  export function router(routes: Record<string, any>): any;
}