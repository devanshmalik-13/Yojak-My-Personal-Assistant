import { getDatabase } from "../database/database";
import { createId, nowIso } from "../database/ids";
import type { AttendanceRecord } from "../types";
import { requireLocalUserId } from "./helpers";

type Row = { id:string;date:string;subject_id:string;status:AttendanceRecord["status"];changed_to_subject_id:string|null;timetable_version_id:string|null };
const map = (row:Row):AttendanceRecord => ({id:row.id,date:row.date,subjectId:row.subject_id,status:row.status,changedToSubjectId:row.changed_to_subject_id??undefined,timetableVersionId:row.timetable_version_id??undefined});

export const attendanceRepository = {
  async getAll():Promise<AttendanceRecord[]>{const db=await getDatabase();return db.all<Row>("SELECT * FROM attendance_records ORDER BY date").map(map);},
  async getByDate(date:string):Promise<AttendanceRecord[]>{const db=await getDatabase();return db.all<Row>("SELECT * FROM attendance_records WHERE date=?",[date]).map(map);},
  async getBySubject(subjectId:string):Promise<AttendanceRecord[]>{const db=await getDatabase();return db.all<Row>("SELECT * FROM attendance_records WHERE subject_id=? OR changed_to_subject_id=? ORDER BY date",[subjectId,subjectId]).map(map);},
  async upsert(record:Omit<AttendanceRecord,"id">&{id?:string}):Promise<AttendanceRecord>{
    const db=await getDatabase();const userId=await requireLocalUserId();const timestamp=nowIso();const next={...record,id:record.id??createId()};
    await db.run(`INSERT INTO attendance_records VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,date,subject_id) DO UPDATE SET status=excluded.status,
      changed_to_subject_id=excluded.changed_to_subject_id,timetable_version_id=excluded.timetable_version_id,updated_at=excluded.updated_at`,
      [next.id,userId,next.date,next.subjectId,next.status,next.changedToSubjectId??null,next.timetableVersionId??null,timestamp,timestamp]);
    return next as AttendanceRecord;
  },
  async delete(id:string):Promise<void>{const db=await getDatabase();await db.run("DELETE FROM attendance_records WHERE id=?",[id]);},
  async deleteFrom(date:string):Promise<void>{const db=await getDatabase();await db.run("DELETE FROM attendance_records WHERE date>=?",[date]);},
  async deleteAll():Promise<void>{const db=await getDatabase();await db.run("DELETE FROM attendance_records");},
};
