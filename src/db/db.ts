import Dexie, { type EntityTable } from 'dexie';
import type { Exercise, Routine, Setting, Workout } from './schema';

export class MfhDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  routines!: EntityTable<Routine, 'id'>;
  workouts!: EntityTable<Workout, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = 'mfh') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name',
      routines: 'id, order',
      workouts: 'id, status, startedAt, routineId',
      settings: 'key',
    });
  }
}

export const db = new MfhDB();

export async function getSetting<T>(key: string, fallback: T, database: MfhDB = db): Promise<T> {
  const row = await database.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown, database: MfhDB = db): Promise<void> {
  await database.settings.put({ key, value });
}
