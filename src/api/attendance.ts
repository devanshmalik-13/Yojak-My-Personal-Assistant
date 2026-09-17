import type { AttendanceRecord, AttendanceStatus, Subject, TimetableSlot } from "../types";
import { attendanceRepository } from "../repositories/attendanceRepository";
import { timetableRepository } from "../repositories/timetableRepository";
import { subjectRepository } from "../repositories/subjectRepository";
import { settingsRepository } from "../repositories/settingsRepository";
import { attendanceService } from "../services/attendanceService";
import { timetableService } from "../services/timetableService";
export interface TimetablePayload{slots:TimetableSlot[];subjects:Subject[];activeFrom:string;activeTo:string;}
export async function getTimetable():Promise<TimetablePayload>{const [table,subjects]=await Promise.all([timetableRepository.getActive(),subjectRepository.getAll()]);return{slots:table.slots,subjects,activeFrom:table.activeFrom,activeTo:table.activeTo};}
export async function replaceTimetable(payload:TimetablePayload):Promise<TimetablePayload>{await timetableService.replace({slots:payload.slots,subjects:payload.subjects,keepMode:"all",activeFrom:payload.activeFrom});return getTimetable();}
export async function getAttendance(from:string,to:string):Promise<AttendanceRecord[]>{return(await attendanceRepository.getAll()).filter(x=>x.date>=from&&x.date<=to);}
export interface MarkAttendancePayload{date:string;subjectId:string;status:AttendanceStatus;changedToSubjectId?:string;}
export const markAttendance=(payload:MarkAttendancePayload)=>attendanceService.markAttendance(payload);
export const getAttendanceStats=()=>attendanceService.getStatistics();
export async function setAttendanceThreshold(threshold:number):Promise<{threshold:number}>{await settingsRepository.update({attendanceThreshold:threshold});return{threshold};}
