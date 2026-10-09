import { config } from 'dotenv';

config();

const { ensureMigrated } = await import('./migrate');
await ensureMigrated();
console.log('Migrations applied.');
