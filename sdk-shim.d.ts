// Minimal ambient declarations for the platform's backend SDK, used ONLY to
// typecheck backend/index.ts locally. The real SDK is supplied by the hosting
// platform and is absent from package.json, so without this the backend — 400+
// lines including every money route — cannot be checked at all.
//
// This is deliberately permissive: `db` is typed loosely because the real
// contract is unverified (see blocker B1 in docs/handoff.md). It is here to
// catch *our* type errors in the domain code, not to assert the SDK's shape.
// Its members are derived from actual call sites, not from documentation.
//
// Not shipped. Do not add a dependency on it.

declare module '@appdeploy/sdk' {
  export const db: {
    list<T = any>(table: string, opts?: { limit?: number; filter?: Record<string, any> }): Promise<{ items: T[] }>;
    get<T = any>(table: string, ids: string[]): Promise<T[]>;
    add(table: string, records: any[]): Promise<string[]>;
    update(table: string, records: Array<{ id: string; record: any }>): Promise<any[]>;
    // Used only by the dead realtime-subscribers.ts, but it confirms `delete`
    // exists on the SDK — see the B1 note below.
    delete(table: string, ids: string[]): Promise<any>;
  };
  /** Websocket fan-out. Used only by the dead realtime-subscribers.ts. */
  export const ws: { send(connectionIds: string[], payload: unknown): Promise<void> };
  export function requireAuth(): any;
  export function json(body: any): any;
  export function error(message: string, status?: number): any;
  /** Route context. `body` is genuinely untyped upstream — routes cast `c.body as any`. */
  export interface RouteContext { body: any; user?: { userId: string } | null }
  export type RouteHandler = (c: RouteContext) => any;
  export function router(routes: Record<string, any>): any;
}

// B1 — no transaction primitive is declared above, because none appears anywhere
// in this repository: not in backend/index.ts, and not in the dead
// realtime-subscribers.ts, which is the only other file that ever imported the
// SDK and exercises a wider surface (db.delete, ws.send) than the live backend
// does. That absence is evidence, not proof — the SDK may export capabilities
// this app never used. Confirm against the platform's SDK documentation before
// treating B1 as settled. See docs/handoff.md §3.