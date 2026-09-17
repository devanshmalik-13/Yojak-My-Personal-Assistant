import type { Competition, CompetitionRound } from "../types";
import { competitionRepository } from "../repositories/competitionRepository";
import { isValidLocalDate, requireText } from "./validation";
import { localFileService } from "./fileService";

function validateCompetition(value:Competition):void{requireText(value.name,"Competition name");requireText(value.teamName,"Team name");if(value.type==="other")requireText(value.customType??"","Custom competition type");for(const round of value.rounds)validateRound(round);}
function validateRound(value:CompetitionRound):void{requireText(value.label,"Round name");if(!isValidLocalDate(value.date))throw new Error("Choose a valid round date");}
export const competitionService={
  async save(value:Competition):Promise<Competition>{validateCompetition(value);return competitionRepository.save(value);},
  async update(id:string,changes:Partial<Competition>):Promise<Competition>{const current=await competitionRepository.getById(id);if(!current)throw new Error("Competition not found");return this.save({...current,...changes,id});},
  async saveRound(competitionId:string,round:CompetitionRound):Promise<CompetitionRound>{validateRound(round);return competitionRepository.saveRound(competitionId,round);},
  async deleteAll():Promise<void>{const files=await competitionRepository.deleteAll();await Promise.all(files.map(file=>file.localPath?localFileService.delete(file.localPath):Promise.resolve()));},
  async deleteFiles(ids:string[]):Promise<void>{const files=await Promise.all([...new Set(ids)].map(id=>competitionRepository.deleteFile(id)));await Promise.all(files.map(file=>file?.localPath?localFileService.delete(file.localPath):Promise.resolve()));},
  async renameFile(id:string,name:string):Promise<void>{const cleaned=name.trim();if(!cleaned||cleaned.length>120||/[\\/\u0000-\u001f]/.test(cleaned))throw new Error("Choose a valid file name");await competitionRepository.renameFile(id,cleaned);},
};
