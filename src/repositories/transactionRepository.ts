import { getDatabase } from "../database/database";
import { createId, nowIso } from "../database/ids";
import { isValidLocalDate, requireText } from "../services/validation";
import type { Transaction } from "../types";
import { requireLocalUserId } from "./helpers";

type Row={id:string;type:Transaction["type"];category_id:string;amount_cents:number;account:string;date:string;comment:string};
const map=(x:Row):Transaction=>({id:x.id,type:x.type,categoryId:x.category_id,amount:x.amount_cents/100,account:x.account,date:x.date,comment:x.comment});
export const transactionRepository={
  async getAll(month?:string):Promise<Transaction[]>{const db=await getDatabase();const rows=month?db.all<Row>("SELECT * FROM transactions WHERE substr(date,1,7)=? ORDER BY date DESC",[month]):db.all<Row>("SELECT * FROM transactions ORDER BY date DESC");return rows.map(map);},
  async getById(id:string):Promise<Transaction|undefined>{const db=await getDatabase();const row=db.first<Row>("SELECT * FROM transactions WHERE id=?",[id]);return row?map(row):undefined;},
  async save(value:Transaction):Promise<Transaction>{if(!Number.isFinite(value.amount)||value.amount<=0)throw new Error("Amount must be greater than zero");if(!isValidLocalDate(value.date))throw new Error("Choose a valid transaction date");requireText(value.account,"Account");const db=await getDatabase();const userId=await requireLocalUserId();const timestamp=nowIso();const next={...value,id:value.id||createId()};await db.run(`INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,category_id=excluded.category_id,amount_cents=excluded.amount_cents,account=excluded.account,date=excluded.date,comment=excluded.comment,updated_at=excluded.updated_at`,[next.id,userId,next.type,next.categoryId,Math.round(next.amount*100),next.account,next.date,next.comment,timestamp,timestamp]);return next;},
  async update(id:string,changes:Partial<Transaction>):Promise<Transaction>{const current=await this.getById(id);if(!current)throw new Error("Transaction not found");return this.save({...current,...changes,id});},
  async delete(id:string):Promise<void>{const db=await getDatabase();await db.run("DELETE FROM transactions WHERE id=?",[id]);},
  async deleteAll():Promise<void>{const db=await getDatabase();await db.run("DELETE FROM transactions");},
  async getMonthlySummary(month:string):Promise<{income:number;expense:number;balance:number;byCategory:{categoryId:string;total:number}[]}>{const db=await getDatabase();const totals=db.first<{income:number;expense:number}>(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount_cents ELSE 0 END),0) income,COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END),0) expense FROM transactions WHERE substr(date,1,7)=?`,[month])??{income:0,expense:0};const byCategory=db.all<{categoryId:string;total:number}>("SELECT category_id categoryId,SUM(amount_cents) total FROM transactions WHERE type='expense' AND substr(date,1,7)=? GROUP BY category_id ORDER BY total DESC",[month]).map(x=>({...x,total:x.total/100}));return{income:totals.income/100,expense:totals.expense/100,balance:(totals.income-totals.expense)/100,byCategory};},
};
