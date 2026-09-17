import { getDatabase } from "../database/database";
import { localToday } from "./validation";
export interface SearchResult{type:"subject"|"assignment"|"competition"|"reminder"|"transaction";id:string;title:string;subtitle:string;}
export const searchService={async search(query:string):Promise<SearchResult[]>{const db=await getDatabase();const term=`%${query.trim().toLowerCase()}%`;if(query.trim().length<2)return[];return[
  ...db.all<{id:string;title:string;subtitle:string}>(`SELECT DISTINCT s.id,s.name title,s.short_name subtitle FROM subjects s JOIN timetable_slots ts ON ts.subject_id=s.id WHERE ts.timetable_version_id=(SELECT id FROM timetable_versions WHERE active_from<=? AND (active_to IS NULL OR active_to>=?) ORDER BY active_from DESC LIMIT 1) AND (lower(s.name) LIKE ? OR lower(s.short_name) LIKE ?) LIMIT 20`,[localToday(),localToday(),term,term]).map(x=>({...x,type:"subject" as const})),
  ...db.all<{id:string;title:string;subtitle:string}>("SELECT id,name title,deadline subtitle FROM assignments WHERE lower(name) LIKE ? OR lower(notes) LIKE ? LIMIT 20",[term,term]).map(x=>({...x,type:"assignment" as const})),
  ...db.all<{id:string;title:string;subtitle:string}>("SELECT id,name title,team_name subtitle FROM competitions WHERE lower(name) LIKE ? OR lower(team_name) LIKE ? LIMIT 20",[term,term]).map(x=>({...x,type:"competition" as const})),
  ...db.all<{id:string;title:string;subtitle:string}>("SELECT id,message title,frequency subtitle FROM reminders WHERE lower(message) LIKE ? LIMIT 20",[term]).map(x=>({...x,type:"reminder" as const})),
  ...db.all<{id:string;title:string;subtitle:string}>("SELECT t.id,CASE WHEN t.comment='' THEN c.name ELSE t.comment END title,printf('₹%.2f',t.amount_cents/100.0) subtitle FROM transactions t JOIN categories c ON c.id=t.category_id WHERE lower(t.comment) LIKE ? OR lower(c.name) LIKE ? LIMIT 20",[term,term]).map(x=>({...x,type:"transaction" as const})),
];}};
