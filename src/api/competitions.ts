import type { Competition, CompetitionRound, FileAttachment } from "../types";
import { createId } from "../database/ids";
import { competitionRepository } from "../repositories/competitionRepository";
import { localFileService } from "../services/fileService";
import { competitionService } from "../services/competitionService";
export const getCompetitions=()=>competitionRepository.getAll();
export type CreateCompetitionPayload=Pick<Competition,"name"|"teamName"|"type"|"customType">;
export const createCompetition=(x:CreateCompetitionPayload)=>competitionService.save({...x,id:createId(),rounds:[],status:"upcoming",celebrationShown:false});
export const updateCompetition=(id:string,changes:Partial<Competition>)=>competitionService.update(id,changes);
export async function deleteCompetition(id:string):Promise<void>{const files=await competitionRepository.delete(id);await Promise.all(files.map(file=>file.localPath?localFileService.delete(file.localPath):Promise.resolve()));}
export const addRound=(id:string,x:Pick<CompetitionRound,"label"|"date">)=>competitionService.saveRound(id,{...x,id:createId(),status:"upcoming"});
export async function updateRound(id:string,roundId:string,changes:Partial<CompetitionRound>):Promise<CompetitionRound>{const competition=await competitionRepository.getById(id);const round=competition?.rounds.find(x=>x.id===roundId);if(!round)throw new Error("Competition round not found");return competitionRepository.saveRound(id,{...round,...changes});}
export async function uploadCertificate(id:string,file:File):Promise<FileAttachment>{const stored=await localFileService.save("competitions",id,file);const attachment={id:createId(),name:file.name,fileType:file.type,size:file.size,localPath:stored.localPath,url:stored.url};const old=await competitionRepository.setCertificate(id,attachment);if(old?.localPath)await localFileService.delete(old.localPath);return attachment;}
