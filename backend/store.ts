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
   * Add `deltaCents` to one stock in the database.
   * Zero rows means the stock is missing, not owned, or would go negative.
   * Quest `saved` moves only on a standalone quest, and an increase also
   * requires that the quest is not archived.
   */
  moveStock(move: StockMove): Promise<any | null>;
  /**
   * Set `saved` to 0 and return the cents that were there.
   * `standaloneOnly` refuses a period row. Null means the row was not released.
   */
  releaseSaved(id: string, ownerUserId: string, standaloneOnly: boolean): Promise<number | null>;
  /**
   * Record a period deduction or true-up. Null means that period already has one,
   * and the stock was not touched.
   */
  insertPeriodMark(record: PeriodMark): Promise<string | null>;
  /** Remove an event inserted in this transaction when the stock move did not stick. */
  deleteEvent(id: string): Promise<void>;
  /**
   * Run `fn` with the store's writes committed or rolled back together.
   * The platform adapter runs `fn` with no transaction. Postgres uses BEGIN/COMMIT.
   */
  transaction?<T>(fn: () => Promise<T>): Promise<T>;
}

export type StockTable = 'profile' | 'goals' | 'commitments';

export type StockMove = {
  table: StockTable;
  id: string;
  ownerUserId: string;
  deltaCents: number;
};

export type PeriodMark = {
  ownerUserId: string;
  type: 'commitment_deduction' | 'commitment_true_up';
  amount: number;
  commitmentId: string;
  reason: string;
  createdAt: string;
};
