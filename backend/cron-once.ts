import { config } from 'dotenv';

config();

const { runCommitments } = await import('./http/nodeHandler');
const result = await runCommitments();
console.log(JSON.stringify(result));
