import { getDatabase } from "../database/database";
import { createId, nowIso } from "../database/ids";
import type { UserProfile } from "../types";

type UserRow = {
  id: string; name: string; phone: string; gender: UserProfile["gender"]; gmail: string;
  college: string; course: string; semester: string; section: string; year_of_entry: string;
  expected_year_of_passing: string; avatar: string | null; onboarding_complete: number;
};

function toProfile(row: UserRow): UserProfile {
  return {
    name: row.name, phone: row.phone, gender: row.gender, gmail: row.gmail,
    college: row.college, course: row.course, semester: row.semester, section: row.section,
    yearOfEntry: row.year_of_entry, expectedYearOfPassing: row.expected_year_of_passing,
    avatar: row.avatar,
  };
}

export const userRepository = {
  async get(): Promise<{ id: string; profile: UserProfile; onboardingComplete: boolean } | undefined> {
    const database = await getDatabase();
    const row = database.first<UserRow>("SELECT * FROM users ORDER BY created_at LIMIT 1");
    return row ? { id: row.id, profile: toProfile(row), onboardingComplete: row.onboarding_complete === 1 } : undefined;
  },

  async save(profile: UserProfile, onboardingComplete = true): Promise<string> {
    const database = await getDatabase();
    const existing = database.first<{ id: string }>("SELECT id FROM users ORDER BY created_at LIMIT 1");
    const id = existing?.id ?? createId();
    const timestamp = nowIso();
    await database.run(
      `INSERT INTO users (
        id,name,phone,gender,gmail,college,course,semester,section,year_of_entry,
        expected_year_of_passing,avatar,onboarding_complete,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,gender=excluded.gender,
        gmail=excluded.gmail,college=excluded.college,course=excluded.course,semester=excluded.semester,
        section=excluded.section,year_of_entry=excluded.year_of_entry,
        expected_year_of_passing=excluded.expected_year_of_passing,avatar=excluded.avatar,
        onboarding_complete=excluded.onboarding_complete,updated_at=excluded.updated_at`,
      [id, profile.name, profile.phone, profile.gender, profile.gmail, profile.college, profile.course,
        profile.semester, profile.section, profile.yearOfEntry, profile.expectedYearOfPassing,
        profile.avatarLocalPath ?? profile.avatar, onboardingComplete ? 1 : 0, timestamp, timestamp],
    );
    return id;
  },

  async setOnboardingComplete(complete: boolean): Promise<void> {
    const database = await getDatabase();
    await database.run("UPDATE users SET onboarding_complete=?, updated_at=?", [complete ? 1 : 0, nowIso()]);
  },
};
