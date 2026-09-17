import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AppAlert, AppState, Assignment, AttendanceRecord, Category, Competition, CompetitionRound, FileAttachment, NotificationSettings, Reminder, Subject, ThemeMode, TimetableSlot, Transaction, UserProfile } from "./types";
import { createId } from "./database/ids";
import { applicationService, createEmptyState } from "./services/applicationService";
import { profileService } from "./services/profileService";
import { settingsRepository } from "./repositories/settingsRepository";
import { attendanceService, calculateStatistics } from "./services/attendanceService";
import { attendanceRepository } from "./repositories/attendanceRepository";
import { assignmentService } from "./services/assignmentService";
import { assignmentRepository } from "./repositories/assignmentRepository";
import { competitionRepository } from "./repositories/competitionRepository";
import { competitionService } from "./services/competitionService";
import { reminderService } from "./services/reminderService";
import { transactionRepository } from "./repositories/transactionRepository";
import { categoryRepository } from "./repositories/categoryRepository";
import { alertRepository } from "./repositories/alertRepository";
import { getCurrentTimetableSubjects, timetableService } from "./services/timetableService";
import { resetService } from "./services/resetService";
import { localFileService } from "./services/fileService";
import { notificationService } from "./services/notificationService";
import { alertService } from "./services/alertService";

export type Action =
  | { type:"COMPLETE_ONBOARDING";profile:UserProfile }
  | { type:"UPDATE_PROFILE";profile:Partial<UserProfile> }
  | { type:"SET_THEME";theme:ThemeMode }
  | { type:"SET_THRESHOLD";threshold:number }
  | { type:"SET_NOTIFICATION_SETTINGS";settings:Partial<NotificationSettings> }
  | { type:"SET_TIMEZONE";timezone:string }
  | { type:"MARK_ATTENDANCE";record:AttendanceRecord }
  | { type:"ADD_ASSIGNMENT";assignment:Assignment }
  | { type:"UPDATE_ASSIGNMENT";id:string;changes:Partial<Assignment> }
  | { type:"ADD_ASSIGNMENT_FILE";assignmentId:string;file:FileAttachment }
  | { type:"DELETE_ASSIGNMENT_FILES";fileIds:string[] }
  | { type:"RENAME_ASSIGNMENT_FILE";fileId:string;name:string }
  | { type:"DELETE_ASSIGNMENT";id:string }
  | { type:"CLEAR_ASSIGNMENTS" }
  | { type:"ADD_COMPETITION";competition:Competition }
  | { type:"UPDATE_COMPETITION";id:string;changes:Partial<Competition> }
  | { type:"ADD_COMPETITION_FILE";competitionId:string;file:FileAttachment }
  | { type:"DELETE_COMPETITION_FILES";fileIds:string[] }
  | { type:"RENAME_COMPETITION_FILE";fileId:string;name:string }
  | { type:"ADD_COMPETITION_ROUND";competitionId:string;round:CompetitionRound }
  | { type:"UPDATE_COMPETITION_ROUND";competitionId:string;roundId:string;changes:Partial<CompetitionRound> }
  | { type:"DELETE_COMPETITION";id:string }
  | { type:"CLEAR_COMPETITIONS" }
  | { type:"ADD_REMINDER";reminder:Reminder }
  | { type:"UPDATE_REMINDER";id:string;changes:Partial<Reminder> }
  | { type:"DELETE_REMINDER";id:string }
  | { type:"CLEAR_REMINDERS" }
  | { type:"ADD_TRANSACTION";transaction:Transaction }
  | { type:"UPDATE_TRANSACTION";id:string;changes:Partial<Transaction> }
  | { type:"DELETE_TRANSACTION";id:string }
  | { type:"CLEAR_TRANSACTIONS" }
  | { type:"ADD_CATEGORY";category:Category }
  | { type:"ADD_ALERT";alert:AppAlert }
  | { type:"READ_ALL_ALERTS" }
  | { type:"CLEAR_ATTENDANCE" }
  | { type:"RESET_APP" }
  | { type:"CHANGE_TIMETABLE";keepMode:"all"|"before-date"|"fresh";cutoffDate?:string;timetable:TimetableSlot[];subjects:Subject[] };

export type AppDispatch=(action:Action)=>Promise<void>;
interface AppContextValue{state:AppState;dispatch:AppDispatch;ready:boolean;busy:boolean;error:string|null;clearError:()=>void;reload:()=>Promise<void>;}
const AppContext=createContext<AppContextValue|null>(null);

export function AppProvider({children}:{children:ReactNode}){
  const[state,setState]=useState<AppState>(createEmptyState);
  const[ready,setReady]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null);
  const stateRef=useRef(state);useEffect(()=>{stateRef.current=state;},[state]);
  const queue=useRef<Promise<void>>(Promise.resolve());

  const reload=useCallback(async()=>{const next=await applicationService.load();stateRef.current=next;setState(next);},[]);
  useEffect(()=>{let active=true;applicationService.initialize().then(next=>{if(active){stateRef.current=next;setState(next);setReady(true);}}).catch(cause=>{if(active){setError(cause instanceof Error?cause.message:"Unable to initialize local data");setReady(true);}});return()=>{active=false;};},[]);

  const apply=useCallback(async(action:Action)=>{const current=stateRef.current;switch(action.type){
    case"COMPLETE_ONBOARDING":await profileService.completeOnboarding(action.profile);break;
    case"UPDATE_PROFILE":await profileService.update({...current.profile,...action.profile});break;
    case"SET_THEME":await settingsRepository.update({theme:action.theme});break;
    case"SET_THRESHOLD":if(action.threshold<1||action.threshold>=100)throw new Error("Attendance threshold must be between 1 and 99");await settingsRepository.update({attendanceThreshold:action.threshold});break;
    case"SET_NOTIFICATION_SETTINGS":await settingsRepository.update({notificationSettings:{...current.notificationSettings,...action.settings}});break;
    case"SET_TIMEZONE":try{Intl.DateTimeFormat("en",{timeZone:action.timezone}).format();}catch{throw new Error("Choose a valid timezone");}await settingsRepository.update({timezone:action.timezone});break;
    case"MARK_ATTENDANCE":await attendanceService.markAttendance(action.record);break;
    case"ADD_ASSIGNMENT":await assignmentService.save(action.assignment);for(const file of action.assignment.files??[])if(file.localPath)await assignmentRepository.addFile(action.assignment.id,file);if(current.notificationSettings.assignments)await notificationService.requestPermission();break;
    case"UPDATE_ASSIGNMENT":await assignmentService.update(action.id,action.changes);break;
    case"ADD_ASSIGNMENT_FILE":await assignmentRepository.addFile(action.assignmentId,action.file);break;
    case"DELETE_ASSIGNMENT_FILES":await assignmentService.deleteFiles(action.fileIds);break;
    case"RENAME_ASSIGNMENT_FILE":await assignmentService.renameFile(action.fileId,action.name);break;
    case"DELETE_ASSIGNMENT":await assignmentService.delete(action.id);break;
    case"CLEAR_ASSIGNMENTS":await assignmentService.deleteAll();await alertRepository.deleteByType("assignment");break;
    case"ADD_COMPETITION":await competitionService.save(action.competition);for(const file of action.competition.documents??[])if(file.localPath)await competitionRepository.addFile(action.competition.id,file,'document');if(current.notificationSettings.competitions)await notificationService.requestPermission();break;
    case"UPDATE_COMPETITION":await competitionService.update(action.id,action.changes);if(action.changes.certificate?.localPath){const old=await competitionRepository.setCertificate(action.id,action.changes.certificate);if(old?.localPath)await localFileService.delete(old.localPath);}break;
    case"ADD_COMPETITION_FILE":await competitionRepository.addFile(action.competitionId,action.file,'document');break;
    case"DELETE_COMPETITION_FILES":await competitionService.deleteFiles(action.fileIds);break;
    case"RENAME_COMPETITION_FILE":await competitionService.renameFile(action.fileId,action.name);break;
    case"ADD_COMPETITION_ROUND":await competitionService.saveRound(action.competitionId,action.round);break;
    case"UPDATE_COMPETITION_ROUND":{const competition=await competitionRepository.getById(action.competitionId);const round=competition?.rounds.find(x=>x.id===action.roundId);if(!round)throw new Error("Competition round not found");await competitionService.saveRound(action.competitionId,{...round,...action.changes});break;}
    case"DELETE_COMPETITION":{const files=await competitionRepository.delete(action.id);await Promise.all(files.map(file=>file.localPath?localFileService.delete(file.localPath):Promise.resolve()));break;}
    case"CLEAR_COMPETITIONS":await competitionService.deleteAll();await alertRepository.deleteByType("competition");break;
    case"ADD_REMINDER":await reminderService.save(action.reminder);break;
    case"UPDATE_REMINDER":await reminderService.update(action.id,action.changes);break;
    case"DELETE_REMINDER":await reminderService.delete(action.id);break;
    case"CLEAR_REMINDERS":await reminderService.deleteAll();await alertRepository.deleteByType("reminder");break;
    case"ADD_TRANSACTION":await transactionRepository.save(action.transaction);break;
    case"UPDATE_TRANSACTION":await transactionRepository.update(action.id,action.changes);break;
    case"DELETE_TRANSACTION":await transactionRepository.delete(action.id);break;
    case"CLEAR_TRANSACTIONS":await transactionRepository.deleteAll();break;
    case"ADD_CATEGORY":await categoryRepository.create(action.category);break;
    case"ADD_ALERT":await alertRepository.create({...action.alert,dedupeKey:`manual-${action.alert.id}`});break;
    case"READ_ALL_ALERTS":await alertRepository.markAllRead();break;
    case"CLEAR_ATTENDANCE":await attendanceRepository.deleteAll();await alertRepository.deleteByType("attendance");break;
    case"RESET_APP":await resetService.resetApplication();break;
    case"CHANGE_TIMETABLE":await timetableService.replace({subjects:action.subjects,slots:action.timetable,keepMode:action.keepMode,cutoffDate:action.cutoffDate});break;
  }await reload();if(action.type==="MARK_ATTENDANCE"||action.type==="SET_THRESHOLD"){await attendanceService.evaluateThreshold(stateRef.current);await reload();}await alertService.reconcile(stateRef.current);await reload();void notificationService.reconcileApp(stateRef.current).catch(()=>undefined);},[reload]);

  const dispatch=useCallback<AppDispatch>((action)=>{const operation=queue.current.then(async()=>{setBusy(true);setError(null);try{await apply(action);}catch(cause){setError(cause instanceof Error?cause.message:"The change could not be saved");throw cause;}finally{setBusy(false);}});queue.current=operation.catch(()=>undefined);return operation;},[apply]);
  return <AppContext.Provider value={{state,dispatch,ready,busy,error,clearError:()=>setError(null),reload}}>{children}</AppContext.Provider>;
}

export function useApp(){const context=useContext(AppContext);if(!context)throw new Error("useApp must be used within AppProvider");return context;}

export function useAttendanceStats(state:AppState){const currentSubjects=getCurrentTimetableSubjects(state.subjects,state.timetable);const stats=calculateStatistics(state.attendanceRecords,currentSubjects.map(s=>s.id));const bySubject=stats.bySubject.map(item=>({subject:currentSubjects.find(s=>s.id===item.subjectId)!,present:item.present,total:item.total,pct:item.pct})).filter(x=>x.subject);const impact=stats.counted?Math.abs(((stats.present+1)/(stats.counted+1)-stats.present/stats.counted)*100):0;return{overall:stats.overall,present:stats.present,counted:stats.counted,bySubject,impact};}
export const uid=createId;
