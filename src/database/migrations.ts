import type { LocalSqliteDatabase } from "./driver";
import { CURRENT_SCHEMA_VERSION } from "./schema";

export const MIGRATIONS = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, gender TEXT NOT NULL,
    gmail TEXT NOT NULL DEFAULT '', college TEXT NOT NULL, course TEXT NOT NULL,
    semester TEXT NOT NULL, section TEXT NOT NULL, year_of_entry TEXT NOT NULL,
    expected_year_of_passing TEXT NOT NULL, avatar TEXT, onboarding_complete INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE user_settings (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'system', attendance_threshold REAL NOT NULL DEFAULT 75,
    attendance_notifications_enabled INTEGER NOT NULL DEFAULT 1,
    assignment_notifications_enabled INTEGER NOT NULL DEFAULT 1,
    competition_notifications_enabled INTEGER NOT NULL DEFAULT 1,
    reminder_notifications_enabled INTEGER NOT NULL DEFAULT 1,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE subjects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, short_name TEXT NOT NULL, color TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE timetable_versions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_from TEXT NOT NULL, active_to TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE timetable_slots (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timetable_version_id TEXT NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES subjects(id), day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
    period INTEGER NOT NULL CHECK(period > 0), start_time TEXT NOT NULL, end_time TEXT NOT NULL,
    active_from TEXT NOT NULL, active_to TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(timetable_version_id, day_of_week, period)
  );
  CREATE TABLE attendance_records (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES subjects(id),
    status TEXT NOT NULL CHECK(status IN ('present','absent','cancelled','changed','unmarked')),
    changed_to_subject_id TEXT REFERENCES subjects(id),
    timetable_version_id TEXT REFERENCES timetable_versions(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(user_id, date, subject_id)
  );
  `,
  `
  CREATE TABLE assignments (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES subjects(id), deadline TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','completed','overdue')), completed_at TEXT,
    notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE assignment_files (
    id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL, local_path TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK(file_size >= 0), created_at TEXT NOT NULL
  );
  CREATE TABLE competitions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, team_name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('hackathon','ctf','sports','other')),
    custom_type TEXT, status TEXT NOT NULL CHECK(status IN ('upcoming','completed')),
    celebration_shown INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE competition_rounds (
    id TEXT PRIMARY KEY, competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    label TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('upcoming','completed')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE competition_files (
    id TEXT PRIMARY KEY, competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL, local_path TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE TABLE reminders (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('once','daily','weekly','monthly','yearly')),
    enabled INTEGER NOT NULL DEFAULT 1, last_triggered_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE categories (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, icon TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('expense','income')),
    color TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(user_id, name, type)
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('expense','income')), category_id TEXT NOT NULL REFERENCES categories(id),
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), account TEXT NOT NULL, date TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE alerts (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, message TEXT NOT NULL, timestamp TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('attendance','assignment','competition','reminder','system')),
    reference_type TEXT, reference_id TEXT, dedupe_key TEXT, created_at TEXT NOT NULL,
    UNIQUE(user_id, dedupe_key)
  );
  CREATE TABLE notification_schedules (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, notification_id INTEGER NOT NULL,
    scheduled_for TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(entity_type, entity_id)
  );
  `,
  `
  CREATE INDEX idx_subjects_user ON subjects(user_id);
  CREATE INDEX idx_timetable_user_dates ON timetable_versions(user_id, active_from, active_to);
  CREATE INDEX idx_timetable_slots_version ON timetable_slots(timetable_version_id, day_of_week, period);
  CREATE INDEX idx_attendance_user_date ON attendance_records(user_id, date);
  CREATE INDEX idx_attendance_subject ON attendance_records(subject_id, date);
  CREATE INDEX idx_assignments_deadline ON assignments(user_id, deadline);
  CREATE INDEX idx_competition_rounds_date ON competition_rounds(competition_id, date);
  CREATE INDEX idx_reminders_date ON reminders(user_id, date, time);
  CREATE INDEX idx_transactions_month ON transactions(user_id, date);
  CREATE INDEX idx_transactions_category ON transactions(category_id, date);
  CREATE INDEX idx_alerts_timestamp ON alerts(user_id, timestamp DESC);
  `,
  `
  ALTER TABLE timetable_slots ADD COLUMN room TEXT;
  ALTER TABLE timetable_slots ADD COLUMN teacher TEXT;
  ALTER TABLE timetable_slots ADD COLUMN lab_group INTEGER CHECK(lab_group BETWEEN 1 AND 3);
  `,
  `
  ALTER TABLE competition_files ADD COLUMN file_role TEXT NOT NULL DEFAULT 'certificate'
    CHECK(file_role IN ('document','certificate'));
  `,
] as const;

export async function migrate(database: LocalSqliteDatabase): Promise<void> {
  await database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version(version) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
  `);
  let version = database.first<{ version: number }>("SELECT version FROM schema_version LIMIT 1")?.version ?? 0;
  if (version > CURRENT_SCHEMA_VERSION) throw new Error("This database was created by a newer version of the app");
  while (version < MIGRATIONS.length) {
    const migration = MIGRATIONS[version]!;
    await database.transaction(async () => {
      await database.exec(migration);
      await database.run("UPDATE schema_version SET version = ?", [version + 1]);
    });
    version += 1;
  }
}
