import { migrate } from "./migrations";
import { openPersistentDatabase, type LocalSqliteDatabase } from "./driver";

let databasePromise: Promise<LocalSqliteDatabase> | undefined;

export function getDatabase(): Promise<LocalSqliteDatabase> {
  databasePromise ??= openPersistentDatabase().then(async (database) => {
    await migrate(database);
    return database;
  });
  return databasePromise;
}

export function setDatabaseForTests(database?: LocalSqliteDatabase): void {
  databasePromise = database ? Promise.resolve(database) : undefined;
}

export async function clearApplicationTables(): Promise<void> {
  const database = await getDatabase();
  await database.transaction(async () => {
    // Delete explicitly in dependency order. This keeps reset reliable even if
    // a restored database was created with foreign-key cascades disabled.
    const tables = [
      "notification_schedules",
      "alerts",
      "transactions",
      "competition_files",
      "competition_rounds",
      "assignment_files",
      "attendance_records",
      "timetable_slots",
      "reminders",
      "competitions",
      "assignments",
      "categories",
      "timetable_versions",
      "subjects",
      "user_settings",
      "users",
    ];
    for (const table of tables) await database.run(`DELETE FROM ${table}`);
  });
}
