import type { AppState, AttendanceRecord, AttendanceStatus } from "../types";
import { attendanceRepository } from "../repositories/attendanceRepository";
import { timetableRepository } from "../repositories/timetableRepository";
import { alertRepository } from "../repositories/alertRepository";

export interface AttendanceStatistics {
  overall:number; present:number; counted:number;
  bySubject:{subjectId:string;present:number;total:number;pct:number}[];
}

export interface AttendanceProjection { current:number; classesNeeded:number; canMiss:number; projected:number; }

export function calculateStatistics(records:AttendanceRecord[],subjectIds?:string[]):AttendanceStatistics{
  const counted=records.filter(r=>r.status!=="cancelled"&&r.status!=="unmarked");
  const effectiveSubject=(r:AttendanceRecord)=>r.status==="changed"?(r.changedToSubjectId??r.subjectId):r.subjectId;
  const present=counted.filter(r=>r.status==="present"||r.status==="changed").length;
  const ids=subjectIds??[...new Set(counted.map(effectiveSubject))];
  return{overall:counted.length?present/counted.length*100:0,present,counted:counted.length,bySubject:ids.map(subjectId=>{const rows=counted.filter(r=>effectiveSubject(r)===subjectId);const p=rows.filter(r=>r.status==="present"||r.status==="changed").length;return{subjectId,present:p,total:rows.length,pct:rows.length?p/rows.length*100:0};})};
}

export function calculateProjection(present:number,counted:number,threshold:number,nextClasses=1):AttendanceProjection{
  const target=threshold/100;const current=counted?present/counted*100:0;
  const classesNeeded=current>=threshold||target>=1?0:Math.max(0,Math.ceil((target*counted-present)/(1-target)));
  const canMiss=current<threshold||target<=0?0:Math.max(0,Math.floor(present/target-counted+1e-9));
  const projected=(present+nextClasses)/(counted+nextClasses)*100;
  return{current,classesNeeded,canMiss,projected};
}

export const attendanceService={
  async markAttendance(input:{date:string;subjectId:string;status:AttendanceStatus;changedToSubjectId?:string}):Promise<AttendanceRecord>{const version=await timetableRepository.getVersionForDate(input.date);const record=await attendanceRepository.upsert({...input,timetableVersionId:version});return record;},
  async getStatistics(subjectIds?:string[]):Promise<AttendanceStatistics>{return calculateStatistics(await attendanceRepository.getAll(),subjectIds);},
  async evaluateThreshold(state:Pick<AppState,"attendanceRecords"|"subjects"|"attendanceThreshold">):Promise<void>{const stats=calculateStatistics(state.attendanceRecords,state.subjects.map(s=>s.id));for(const item of stats.bySubject){if(item.total>0&&item.pct<state.attendanceThreshold){const subject=state.subjects.find(s=>s.id===item.subjectId);await alertRepository.create({title:"Attendance warning",message:`${subject?.shortName??"Subject"} attendance is ${item.pct.toFixed(1)}%, below your ${state.attendanceThreshold}% target.`,timestamp:new Date().toISOString(),read:false,alertType:"attendance",referenceType:"subject",referenceId:item.subjectId,dedupeKey:`attendance-${item.subjectId}-${item.present}-${item.total}-${state.attendanceThreshold}`});}}},
};
