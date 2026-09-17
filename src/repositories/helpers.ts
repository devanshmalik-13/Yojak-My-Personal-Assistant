import { getDatabase } from "../database/database";

export async function requireLocalUserId(): Promise<string> {
  const database = await getDatabase();
  const row = database.first<{ id: string }>("SELECT id FROM users ORDER BY created_at LIMIT 1");
  if (!row) throw new Error("Complete onboarding before saving app data");
  return row.id;
}

export const bool = (value: unknown): boolean => Number(value) === 1;
