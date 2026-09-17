import { getDatabase } from "../database/database";
import { createId, nowIso } from "../database/ids";
import type { AppAlert } from "../types";
import { requireLocalUserId } from "./helpers";

type Row={id:string;title:string;message:string;timestamp:string;read:number;alert_type:AppAlert["alertType"];reference_type:string|null;reference_id:string|null};
const map=(x:Row):AppAlert=>({id:x.id,title:x.title,message:x.message,timestamp:x.timestamp,read:x.read===1,alertType:x.alert_type,referenceType:x.reference_type??undefined,referenceId:x.reference_id??undefined});
export const alertRepository={
  async getAll():Promise<AppAlert[]>{const db=await getDatabase();return db.all<Row>("SELECT * FROM alerts ORDER BY timestamp DESC").map(map);},
  async create(value:Omit<AppAlert,"id">&{id?:string;dedupeKey?:string}):Promise<AppAlert|undefined>{const db=await getDatabase();const userId=await requireLocalUserId();const next={...value,id:value.id??createId()};const result=await db.run("INSERT OR IGNORE INTO alerts VALUES (?,?,?,?,?,?,?,?,?,?,?)",[next.id,userId,next.title,next.message,next.timestamp,next.read?1:0,next.alertType,next.referenceType??null,next.referenceId??null,value.dedupeKey??null,nowIso()]);return result.changes?next:undefined;},
  async markAllRead():Promise<void>{const db=await getDatabase();await db.run("UPDATE alerts SET read=1");},
  async markRead(id:string):Promise<void>{const db=await getDatabase();await db.run("UPDATE alerts SET read=1 WHERE id=?",[id]);},
  async deleteByType(alertType:AppAlert["alertType"]):Promise<void>{const db=await getDatabase();await db.run("DELETE FROM alerts WHERE alert_type=?",[alertType]);},
};
