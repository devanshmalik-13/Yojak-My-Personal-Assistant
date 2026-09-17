import { getDatabase } from "../database/database";
import { createId, nowIso } from "../database/ids";
import type { Reminder } from "../types";
import { requireLocalUserId } from "./helpers";

type Row={id:string;message:string;date:string;time:string;frequency:Reminder["frequency"];enabled:number};
const map=(x:Row):Reminder=>({id:x.id,message:x.message,date:x.date,time:x.time,frequency:x.frequency,enabled:x.enabled===1});
export const reminderRepository={
  async getAll():Promise<Reminder[]>{const db=await getDatabase();return db.all<Row>("SELECT * FROM reminders ORDER BY date,time").map(map);},
  async getById(id:string):Promise<Reminder|undefined>{const db=await getDatabase();const row=db.first<Row>("SELECT * FROM reminders WHERE id=?",[id]);return row?map(row):undefined;},
  async save(value:Reminder):Promise<Reminder>{const db=await getDatabase();const userId=await requireLocalUserId();const timestamp=nowIso();const next={...value,id:value.id||createId(),enabled:value.enabled??true};await db.run(`INSERT INTO reminders VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET message=excluded.message,date=excluded.date,time=excluded.time,frequency=excluded.frequency,enabled=excluded.enabled,updated_at=excluded.updated_at`,[next.id,userId,next.message,next.date,next.time,next.frequency,next.enabled?1:0,null,timestamp,timestamp]);return next;},
  async update(id:string,changes:Partial<Reminder>):Promise<Reminder>{const current=await this.getById(id);if(!current)throw new Error("Reminder not found");return this.save({...current,...changes,id});},
  async delete(id:string):Promise<void>{const db=await getDatabase();await db.run("DELETE FROM reminders WHERE id=?",[id]);},
  async deleteAll():Promise<void>{const db=await getDatabase();await db.run("DELETE FROM reminders");},
};
