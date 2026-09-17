import { getDatabase } from "../database/database";
import { createId, nowIso } from "../database/ids";
import { DEFAULT_TIMEZONE } from "../database/schema";
import type { NotificationSettings, ThemeMode } from "../types";
import { bool, requireLocalUserId } from "./helpers";

export interface LocalSettings {
  theme: ThemeMode;
  attendanceThreshold: number;
  notificationSettings: NotificationSettings;
  timezone: string;
}

type SettingsRow = {
  theme: ThemeMode; attendance_threshold: number; attendance_notifications_enabled: number;
  assignment_notifications_enabled: number; competition_notifications_enabled: number;
  reminder_notifications_enabled: number; timezone: string;
};

export const DEFAULT_SETTINGS: LocalSettings = {
  theme: "system",
  attendanceThreshold: 75,
  notificationSettings: { attendance: true, assignments: true, competitions: true, reminders: true },
  timezone: DEFAULT_TIMEZONE,
};

export const settingsRepository = {
  async ensure(userId?: string): Promise<void> {
    const database = await getDatabase();
    const ownerId = userId ?? await requireLocalUserId();
    const timestamp = nowIso();
    await database.run(
      `INSERT OR IGNORE INTO user_settings (
        id,user_id,theme,attendance_threshold,attendance_notifications_enabled,
        assignment_notifications_enabled,competition_notifications_enabled,
        reminder_notifications_enabled,timezone,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [createId(), ownerId, "system", 75, 1, 1, 1, 1, DEFAULT_TIMEZONE, timestamp, timestamp],
    );
  },

  async get(): Promise<LocalSettings> {
    const database = await getDatabase();
    const row = database.first<SettingsRow>("SELECT * FROM user_settings LIMIT 1");
    if (!row) return DEFAULT_SETTINGS;
    return {
      theme: row.theme,
      attendanceThreshold: row.attendance_threshold,
      notificationSettings: {
        attendance: bool(row.attendance_notifications_enabled),
        assignments: bool(row.assignment_notifications_enabled),
        competitions: bool(row.competition_notifications_enabled),
        reminders: bool(row.reminder_notifications_enabled),
      },
      timezone: row.timezone,
    };
  },

  async update(changes: Partial<LocalSettings>): Promise<void> {
    await this.ensure();
    const current = await this.get();
    const next = {
      ...current,
      ...changes,
      notificationSettings: { ...current.notificationSettings, ...changes.notificationSettings },
    };
    const database = await getDatabase();
    await database.run(
      `UPDATE user_settings SET theme=?,attendance_threshold=?,attendance_notifications_enabled=?,
       assignment_notifications_enabled=?,competition_notifications_enabled=?,reminder_notifications_enabled=?,
       timezone=?,updated_at=?`,
      [next.theme, next.attendanceThreshold, next.notificationSettings.attendance ? 1 : 0,
        next.notificationSettings.assignments ? 1 : 0, next.notificationSettings.competitions ? 1 : 0,
        next.notificationSettings.reminders ? 1 : 0, next.timezone, nowIso()],
    );
  },
};
