// Composition root. The host loads this module and resolves two names:
// `handler` (HTTP) and `processCommitments` (cron.json). Keep both exports.
import { createLedger } from './domain/ledger';
import { createHandler } from './http/routes';
import { platformStore } from './platform';

const ledger = createLedger(platformStore);

export const handler = createHandler(ledger);
export const processCommitments = ledger.processCommitments;
