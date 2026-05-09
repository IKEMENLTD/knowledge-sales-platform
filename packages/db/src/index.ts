import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;

export function getDb(databaseUrl?: string): Database {
  if (cached) return cached;
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { prepare: false, max: 10 });
  cached = drizzle(client, { schema, casing: 'snake_case' });
  return cached;
}

export * as schema from './schema/index.js';
export type {
  User,
  NewUser,
  Company,
  NewCompany,
  Contact,
  NewContact,
  Meeting,
  NewMeeting,
  Recording,
  NewRecording,
  Notification,
  NewNotification,
} from './schema/index.js';
