/**
 * Persistence port.
 *
 * The platform adapter is a document store: equality filters, no cursor, and
 * no transaction primitive (blocker B1). Command methods therefore cannot
 * assume that two writes succeed or fail together. A Postgres adapter
 * implements these same operations inside a transaction; it should not grow
 * this interface into a query language.
 */
export interface LedgerStore {
  list<T = any>(
    table: string,
    opts?: { limit?: number; filter?: Record<string, any> },
  ): Promise<{ items: T[] }>;
  get<T = any>(table: string, ids: string[]): Promise<T[]>;
  add(table: string, records: any[]): Promise<string[]>;
  update(table: string, records: Array<{ id: string; record: any }>): Promise<any[]>;
  /**
   * Run `fn` with the store's writes committed or rolled back together.
   * The platform adapter runs `fn` with no transaction. Postgres uses BEGIN/COMMIT.
   */
  transaction?<T>(fn: () => Promise<T>): Promise<T>;
}
