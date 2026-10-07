/** What a command returns. The HTTP adapter turns this into a response. */
export type Failure = { ok: false; message: string; status: number };
export type Success<T> = { ok: true; data: T };
export type Outcome<T> = Success<T> | Failure;

export const fail = (message: string, status: number): Failure => ({ ok: false, message, status });
export const ok = <T>(data: T): Success<T> => ({ ok: true, data });
