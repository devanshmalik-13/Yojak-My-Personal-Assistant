import { getDatabase } from "../database/database";
import { createId, nowIso } from "../database/ids";
import type { Subject } from "../types";
import { requireLocalUserId } from "./helpers";

type SubjectRow = { id: string; name: string; short_name: string; color: string };
const map = (row: SubjectRow): Subject => ({ id: row.id, name: row.name, shortName: row.short_name, color: row.color });

export const subjectRepository = {
  async getAll(): Promise<Subject[]> {
    const database = await getDatabase();
    return database.all<SubjectRow>("SELECT id,name,short_name,color FROM subjects ORDER BY created_at").map(map);
  },
  async getById(id: string): Promise<Subject | undefined> {
    const database = await getDatabase();
    const row = database.first<SubjectRow>("SELECT id,name,short_name,color FROM subjects WHERE id=?", [id]);
    return row ? map(row) : undefined;
  },
  async create(data: Omit<Subject, "id"> & { id?: string }): Promise<Subject> {
    const database = await getDatabase(); const userId = await requireLocalUserId(); const timestamp = nowIso();
    const subject = { ...data, id: data.id ?? createId() };
    await database.run("INSERT INTO subjects VALUES (?,?,?,?,?,?,?)", [subject.id,userId,subject.name,subject.shortName,subject.color,timestamp,timestamp]);
    return subject;
  },
  async update(id: string, changes: Partial<Omit<Subject, "id">>): Promise<Subject> {
    const current = await this.getById(id); if (!current) throw new Error("Subject not found");
    const next = { ...current, ...changes }; const database = await getDatabase();
    await database.run("UPDATE subjects SET name=?,short_name=?,color=?,updated_at=? WHERE id=?", [next.name,next.shortName,next.color,nowIso(),id]);
    return next;
  },
  async delete(id: string): Promise<void> { const database = await getDatabase(); await database.run("DELETE FROM subjects WHERE id=?", [id]); },
};
