import { getDatabase } from "../database/database";
import { createId, nowIso } from "../database/ids";
import type { Assignment, FileAttachment } from "../types";
import { requireLocalUserId } from "./helpers";

type Row={id:string;name:string;subject_id:string;deadline:string;status:Assignment["status"];completed_at:string|null;notes:string};
type FileRow={id:string;original_name:string;local_path:string;mime_type:string;file_size:number};
const fileMap=(x:FileRow):FileAttachment=>({id:x.id,name:x.original_name,fileType:x.mime_type,localPath:x.local_path,size:x.file_size});

async function mapAssignment(row:Row):Promise<Assignment>{const db=await getDatabase();const files=db.all<FileRow>("SELECT * FROM assignment_files WHERE assignment_id=? ORDER BY created_at",[row.id]).map(fileMap);return{id:row.id,name:row.name,subjectId:row.subject_id,deadline:row.deadline,status:row.status,completedAt:row.completed_at??undefined,notes:row.notes,files};}

export const assignmentRepository={
  async getAll():Promise<Assignment[]>{const db=await getDatabase();const rows=db.all<Row>("SELECT * FROM assignments ORDER BY deadline");return Promise.all(rows.map(mapAssignment));},
  async getById(id:string):Promise<Assignment|undefined>{const db=await getDatabase();const row=db.first<Row>("SELECT * FROM assignments WHERE id=?",[id]);return row?mapAssignment(row):undefined;},
  async save(value:Assignment):Promise<Assignment>{const db=await getDatabase();const userId=await requireLocalUserId();const timestamp=nowIso();const id=value.id||createId();await db.run(`INSERT INTO assignments VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,subject_id=excluded.subject_id,deadline=excluded.deadline,status=excluded.status,completed_at=excluded.completed_at,notes=excluded.notes,updated_at=excluded.updated_at`,[id,userId,value.name,value.subjectId,value.deadline,value.status,value.completedAt??null,value.notes??"",timestamp,timestamp]);return{...value,id};},
  async update(id:string,changes:Partial<Assignment>):Promise<Assignment>{const current=await this.getById(id);if(!current)throw new Error("Assignment not found");return this.save({...current,...changes,id});},
  async delete(id:string):Promise<FileAttachment[]>{const current=await this.getById(id);const db=await getDatabase();await db.run("DELETE FROM assignments WHERE id=?",[id]);return current?.files??[];},
  async addFile(assignmentId:string,file:Omit<FileAttachment,"id">&{id?:string}):Promise<FileAttachment>{const db=await getDatabase();const next={...file,id:file.id??createId()};await db.run("INSERT INTO assignment_files VALUES (?,?,?,?,?,?,?)",[next.id,assignmentId,next.name,next.localPath??"",next.fileType,next.size??0,nowIso()]);return next;},
  async deleteFile(id:string):Promise<FileAttachment|undefined>{const db=await getDatabase();const row=db.first<FileRow>("SELECT * FROM assignment_files WHERE id=?",[id]);await db.run("DELETE FROM assignment_files WHERE id=?",[id]);return row?fileMap(row):undefined;},
  async renameFile(id:string,name:string):Promise<void>{const db=await getDatabase();await db.run("UPDATE assignment_files SET original_name=? WHERE id=?",[name,id]);},
};
