/** What a command returns. The HTTP adapter turns this into a response. */
export type Failure = { ok: false; message: string; status: number };
export type Success<T> = { ok: true; data: T };
export type Outcome<T> = Success<T> | Failure;

export const fail = (message: string, status: number): Failure => ({ ok: false, message, status });
export const ok = <T>(data: T): Success<T> => ({ ok: true, data });

/** Thrown inside a command transaction so a failed command rolls back. */
export class CommandFailure extends Error {
  readonly failure: Failure;
  constructor(failure: Failure) {
    super(failure.message);
    this.name = 'CommandFailure';
    this.failure = failure;
  }
}
