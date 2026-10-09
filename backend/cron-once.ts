import { config } from 'dotenv';

config();

const { runCommitments } = await import('./http/nodeHandler.js');
const result = await runCommitments();
console.log(JSON.stringify(result));
