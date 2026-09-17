import type { Assignment, FileAttachment } from "../types";
import { createId } from "../database/ids";
import { assignmentRepository } from "../repositories/assignmentRepository";
import { assignmentService } from "../services/assignmentService";
import { localFileService } from "../services/fileService";
export type CreateAssignmentPayload=Pick<Assignment,"name"|"subjectId"|"deadline">&{notes?:string};
export const getAssignments=()=>assignmentService.getAll();
export const createAssignment=(x:CreateAssignmentPayload)=>assignmentService.save({id:createId(),name:x.name,subjectId:x.subjectId,deadline:x.deadline,notes:x.notes??"",status:"pending",files:[]});
export const updateAssignment=(id:string,changes:Partial<Assignment>)=>assignmentService.update(id,changes);
export const deleteAssignment=(id:string)=>assignmentService.delete(id);
export async function uploadAssignmentFile(id:string,file:File):Promise<FileAttachment>{const stored=await localFileService.save("assignments",id,file);return assignmentRepository.addFile(id,{name:file.name,fileType:file.type,size:file.size,localPath:stored.localPath,url:stored.url});}
export async function deleteAssignmentFile(_assignmentId:string,fileId:string):Promise<void>{const file=await assignmentRepository.deleteFile(fileId);if(file?.localPath)await localFileService.delete(file.localPath);}
