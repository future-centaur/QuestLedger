import { config } from 'dotenv';

config();

const { ensureMigrated } = await import('./migrate.js');
await ensureMigrated();
console.log('Migrations applied.');
