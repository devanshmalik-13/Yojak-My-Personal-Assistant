import { getDatabase } from "../database/database";
import { createId, nowIso } from "../database/ids";
import { DEFAULT_CATEGORIES } from "../database/schema";
import type { Category } from "../types";
import { requireLocalUserId } from "./helpers";

type Row={id:string;name:string;icon:string;type:Category["type"];color:string};
export const categoryRepository={
  async getAll():Promise<Category[]>{const db=await getDatabase();return db.all<Row>("SELECT id,name,icon,type,color FROM categories ORDER BY is_default DESC,created_at");},
  async ensureDefaults(userId?:string):Promise<void>{const db=await getDatabase();const owner=userId??await requireLocalUserId();const timestamp=nowIso();await db.transaction(async()=>{for(const category of DEFAULT_CATEGORIES)await db.run("INSERT OR IGNORE INTO categories VALUES (?,?,?,?,?,?,?,?,?)",[`${owner}-${category.id}`,owner,category.name,category.icon,category.type,category.color,1,timestamp,timestamp]);});},
  async create(value:Omit<Category,"id">&{id?:string}):Promise<Category>{const db=await getDatabase();const userId=await requireLocalUserId();const timestamp=nowIso();const next={...value,id:value.id??createId()};await db.run("INSERT INTO categories VALUES (?,?,?,?,?,?,?,?,?)",[next.id,userId,next.name,next.icon,next.type,next.color,0,timestamp,timestamp]);return next;},
  async delete(id:string):Promise<void>{const db=await getDatabase();await db.run("DELETE FROM categories WHERE id=? AND is_default=0",[id]);},
};
